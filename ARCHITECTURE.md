# Architecture: Question Finder with MongoDB Atlas

This document explains how Question Finder stores and retrieves data using MongoDB Atlas.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    QUESTION FINDER APP                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Frontend (React)                                            │
│  ├── Search Interface                                        │
│  ├── Topic Filter                                            │
│  └── User Submissions Form                                   │
│           ↓                                                  │
│  Backend API (Node.js)                                       │
│  ├── /api/questions/search      (BM25 + Embedding Search)   │
│  ├── /api/submissions           (Read user questions)        │
│  ├── /api/topics                (Get categories)             │
│  └── POST: Save user submission                              │
│           ↓                                                  │
│  MongoDB Atlas (Cloud Database)                              │
│  ├── Collection: questions      (Seed data)                  │
│  └── Collection: submissions    (User submissions)           │
│                                                               │
│  Python Pipeline (Data Seeding - Optional)                   │
│  ├── Load 10,000+ questions from Hugging Face                │
│  ├── Generate embeddings with sentence-transformers         │
│  └── Upload to MongoDB Atlas                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1️⃣ Data Seeding (Setup Phase)

**File**: `modal.py`

```
Hugging Face Datasets
    ↓
Python: Load questions (10,000+)
    ↓
Generate Embeddings (all-MiniLM-L6-v2)
    ↓
Save to:
  • embeddings.npy        (numpy array)
  • questions.json        (local JSON)
  • MongoDB Atlas         (production DB) ← PRIMARY
    ↓
Collection: "questions" (seed-data)
```

**When to run**:

- First time setup
- Refreshing question dataset
- Adding new questions

**Command**:

```bash
python modal.py
```

### 2️⃣ Search Query (Frontend → Backend → MongoDB)

```
User Types: "What is photosynthesis?"
    ↓
Frontend sends to: POST /api/questions/search
    ↓
Backend (Node.js):
  1. Classify topic (AI classifier)
  2. Find similar questions:
     - BM25 text matching
     - Cosine similarity on embeddings
     - Topic bonus scoring
  3. Load from MongoDB:
     - queries collection "questions" (seed data)
     - queries collection "submissions" (user questions)
  4. Merge results (dedup by ID)
    ↓
Return top 6 similar questions + metadata
    ↓
Frontend displays results with similarity scores
```

### 3️⃣ User Submission Flow

```
User fills form & clicks "Ask"
    ↓
POST /api/questions/search with:
  {
    "question": "What is photosynthesis?",
    "userName": "Alex"
  }
    ↓
Backend:
  1. Classify topic → "Biology"
  2. Find 6 similar existing questions
  3. Save submission to MongoDB
    ↓
MongoDB Collection: "submissions"
  {
    "_id": ObjectId(...),
    "id": "q-api-1234567890",
    "text": "What is photosynthesis?",
    "tag": "Biology",
    "userName": "Alex",
    "createdAt": "2024-06-24T10:30:00Z",
    "source": "user-submission",
    "similarQuestions": [...]
  }
    ↓
Return JSON response with:
  • question details
  • 6 similar questions
  • classification confidence
```

## MongoDB Schema

### Database: `questionfinder`

### Collection 1: `questions`

**Purpose**: Seed data loaded by Python pipeline

```json
{
  "_id": ObjectId("..."),
  "id": "seed-12345",
  "text": "What is photosynthesis?",
  "tag": "Biology",
  "userName": "Question Finder",
  "createdAt": "2024-06-24T10:00:00Z",
  "source": "seed-data",
  "searchText": "photosynthesis process plants light energy glucose",
  "similarQuestions": []
}
```

**Indexed fields** (recommended):

```javascript
db.questions.createIndex({ tag: 1 });
db.questions.createIndex({ createdAt: -1 });
db.questions.createIndex({ source: 1 });
db.questions.createIndex({ text: "text", searchText: "text" }); // Full-text search
```

### Collection 2: `submissions`

**Purpose**: User-submitted questions

```json
{
  "_id": ObjectId("..."),
  "id": "q-api-1234567890",
  "text": "How do plants photosynthesize in the dark?",
  "tag": "Biology",
  "userName": "Alice",
  "createdAt": "2024-06-24T11:00:00Z",
  "source": "user-submission",
  "searchText": "photosynthesis darkness plants energy",
  "similarQuestions": [
    {
      "id": "seed-12345",
      "text": "What is photosynthesis?",
      "tag": "Biology",
      "similarity": 0.89
    }
  ]
}
```

**Note**: `submissions` and `questions` are queried together by the backend.

## Backend API Endpoints

### GET `/api/health`

Check if server is running and MongoDB is connected.

**Response**:

```json
{
  "status": "ok",
  "service": "Question Finder API"
}
```

### GET `/api/topics`

Get all question categories from both collections.

**Response**:

```json
{
  "topics": ["Biology", "Chemistry", "Physics", "Mathematics", ...]
}
```

**MongoDB Query**:

```javascript
db.questions.distinct("tag");
db.submissions.distinct("tag");
// Merged and sorted
```

### POST `/api/questions/search`

Search for similar questions and save submission.

**Request**:

```json
{
  "question": "What is photosynthesis?",
  "userName": "Student"
}
```

**Response**:

```json
{
  "id": "q-api-1234567890",
  "text": "What is photosynthesis?",
  "tag": "Biology",
  "createdAt": "2024-06-24T11:00:00Z",
  "similarQuestions": [
    {
      "id": "seed-12345",
      "text": "What is photosynthesis?",
      "tag": "Biology",
      "similarity": 0.95
    }
    // ... 5 more
  ]
}
```

**Backend Logic**:

1. Classify question topic
2. Load embeddings and embeddings cache
3. Query MongoDB for all questions
4. Compute BM25 scores + embedding similarity
5. Apply topic bonuses
6. Sort by similarity (0-1 scale)
7. Take top 6
8. Insert submission into `submissions` collection

### GET `/api/submissions?tag=Biology`

Get all user submissions (optionally filtered by tag).

**MongoDB Query**:

```javascript
db.submissions.find({ tag: "Biology" }).sort({ createdAt: -1 });
```

**Response**:

```json
{
  "submissions": [
    {
      "id": "q-api-1234567890",
      "text": "How does photosynthesis work?",
      "tag": "Biology",
      "userName": "Alice",
      "createdAt": "2024-06-24T11:00:00Z",
      "similarQuestions": [...]
    }
  ],
  "total": 42
}
```

### GET `/api/questions/list?page=0&limit=50&tag=Biology`

Get paginated list of all questions (seed + submissions).

**MongoDB Query**:

```javascript
db.questions
  .find({ tag: "Biology" })
  .sort({ createdAt: -1 })
  .skip(0)
  .limit(50)
  .toArray();
```

## Search Algorithm

### BM25 + Embeddings Hybrid

The backend uses **two-tier scoring**:

#### Tier 1: BM25 Text Matching

- Tokenizes question into unigrams, bigrams, trigrams
- Computes term frequency-inverse document frequency
- Scores based on:
  - TF (term frequency in doc)
  - IDF (inverse document frequency)
  - Document length normalization (Okapi BM25 formula)

**Parameters**:

- k1 = 1.5 (saturation point)
- b = 0.75 (length normalization)

#### Tier 2: Topic Bonus

- If topic matches, add +0.08 to score
- Keeps searches focused on relevant category

#### Fallback Strategies (in order):

1. BM25 if score ≥ 0.05
2. Substring matching on raw tokens if BM25 fails
3. Random same-topic questions if all else fails

### Similarity Score Range

- 0.0 - 0.2: Very weak match
- 0.2 - 0.5: Moderate relevance
- 0.5 - 0.8: Good match
- 0.8 - 1.0: Excellent match

## Data Consistency

### Write Operations

```
User submits question
    ↓
Backend validates (min 8 chars)
    ↓
Backend classifies topic
    ↓
Backend finds similar questions
    ↓
MongoDB INSERT into "submissions"
    ↓
Response sent to frontend
```

### Read Operations

```
Frontend requests search
    ↓
Backend loads all questions from MongoDB
    ↓
Backend builds BM25 index (in-memory, cached)
    ↓
Backend computes similarity
    ↓
Returns top 6 results
```

**Cache**: BM25 index is rebuilt only if question count changes.

## Monitoring & Operations

### Check Data in MongoDB Atlas

1. **Web Dashboard**:
   - Go to Deployment → Collections
   - View documents in real-time
   - Search and filter

2. **MongoDB Compass** (GUI):
   - Download from https://www.mongodb.com/products/compass
   - Connect with connection string
   - Browse, search, edit documents

3. **Metrics**:
   - CPU usage
   - Memory/Storage used
   - Connection count
   - Operations/second

### Sample Queries

**Count all seed questions**:

```javascript
db.questions.countDocuments({ source: "seed-data" });
```

**Count user submissions**:

```javascript
db.submissions.countDocuments();
```

**Find questions by topic**:

```javascript
db.questions.find({ tag: "Biology" });
```

**Find most recent submissions**:

```javascript
db.submissions.find().sort({ createdAt: -1 }).limit(10);
```

## Scaling Considerations

### Free Tier (M0)

- ✅ 512 MB storage (10,000+ questions)
- ✅ Good for development & testing
- ✅ Low traffic apps
- ⚠️ No backups
- ⚠️ Max 100 connections

### When to Upgrade (M2+)

- Storage exceeds 512 MB
- > 1000 concurrent searches/hour
- Need automated backups
- Production deployment

### Performance Tips

1. **Index frequently queried fields**: `tag`, `source`, `createdAt`
2. **Paginate results**: Use `limit()` and `skip()`
3. **Cache BM25 index**: Only rebuild on question count changes
4. **Batch inserts**: Insert 500 at a time during seeding

## Error Handling

### MongoDB Connection Errors

**Scenario**: `ECONNREFUSED`

- Check internet connectivity
- Verify MONGODB_URI in .env
- Check network access in MongoDB Atlas

**Scenario**: `authentication failed`

- Verify username/password in MONGODB_URI
- Check database user exists in MongoDB Atlas
- Ensure password has no special characters

**Scenario**: `timeout`

- Check network access allows your IP
- Increase `serverSelectionTimeoutMS` in connection options
- Upgrade cluster tier if overloaded

### Graceful Fallbacks

If MongoDB is unavailable:

1. Backend falls back to JSON files (local `db-store.json`)
2. Searches still work on cached data
3. User submissions are NOT saved
4. Browser console shows warning

---

## Quick Reference

| Component     | Technology                 | Purpose             |
| ------------- | -------------------------- | ------------------- |
| Frontend      | React 19, TypeScript, Vite | User interface      |
| Backend       | Node.js, Express           | API server          |
| Database      | MongoDB Atlas              | Persistent storage  |
| Search        | BM25 + Embeddings          | Similarity matching |
| Embeddings    | all-MiniLM-L6-v2           | Semantic similarity |
| Data Pipeline | Python                     | Seed data loading   |

---

**For questions, see MONGODB_SETUP.md or check MongoDB Atlas documentation.**
