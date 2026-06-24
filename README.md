# Mohid.S-QuestionFinder

Question Finder is a React and Node.js project that classifies study questions, finds similar academic questions, and stores submitted questions in MongoDB Atlas.

## 🚀 Quick Start

### 1. Setup MongoDB Atlas (Required)

See [MONGODB_SETUP.md](./MONGODB_SETUP.md) for detailed instructions on:
- Creating a free MongoDB Atlas account
- Connecting your cluster
- Updating credentials in `.env`

**Quick summary**:
```env
# Update .env with your MongoDB Atlas credentials
MONGODB_URI=mongodb+srv://username:password@cluster-name.mongodb.net/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
MONGODB_DB=questionfinder
MONGODB_COLLECTIONS=submissions,questions
PORT=5000
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Frontend

```bash
npm run dev
```

Frontend: http://localhost:5173

### 4. Run Backend

```bash
npm run server
```

Backend: http://localhost:5000

### 5. Seed Data to MongoDB (Optional)

```bash
# Install Python dependencies
pip install sentence-transformers datasets scikit-learn numpy pymongo python-dotenv

# Run the seeding script
python modal.py
```

This loads 10,000 study questions into MongoDB Atlas.

## 📚 Features

- **Question Search**: Find similar study questions instantly
- **Auto-Classification**: Automatically tags questions by subject (Biology, Chemistry, etc.)
- **MongoDB Integration**: Persistent storage in MongoDB Atlas
- **Real-time Similarity**: BM25 + embeddings-based relevance ranking
- **User Submissions**: Store user-submitted questions
- **Statistics**: View question distribution by topic

## 🗂️ Project Structure

```
├── server.js              # Node.js backend with MongoDB integration
├── modal.py              # Python script to seed questions to MongoDB
├── src/
│   ├── App.tsx           # Main React component
│   ├── components/       # UI components
│   └── types.ts          # TypeScript types
├── .env                  # MongoDB credentials (REQUIRED)
├── .env.example          # Template for .env
├── MONGODB_SETUP.md      # MongoDB Atlas setup guide
└── package.json          # Node.js dependencies
```

## 🔗 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/topics` | Get all question categories |
| POST | `/api/questions/search` | Search for similar questions |
| GET | `/api/submissions` | Get all user submissions |
| GET | `/api/stats` | Get statistics |

## 🗄️ MongoDB Collections

**Database**: `questionfinder`

| Collection | Purpose | Source |
|-----------|---------|--------|
| `questions` | 10,000+ seed questions | Python script (modal.py) |
| `submissions` | User-submitted questions | Frontend |

## ⚙️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express-like HTTP server
- **Database**: MongoDB Atlas (Cloud)
- **Data Processing**: Python with sentence-transformers, scikit-learn
- **Search**: BM25 + Cosine Similarity

## 📋 Scripts
