# Mohid.S - Question Finder

An AI-assisted study question finder that classifies a student's question by subject, searches for similar previous questions, and stores submitted questions in MongoDB.

## Chosen Option

I chose the **Similar Study Question Finder** option.

The project allows a user to enter a study question, automatically detects the academic subject, finds related questions from the existing question database, and saves the new submission for future use.


## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js HTTP API
- **Database:** MongoDB Atlas
- **AI / ML Search:** Topic classification, BM25 text ranking, and precomputed semantic similarity data
- **Icons / UI:** Lucide React
- **Optional data preparation:** Python, sentence-transformers, NumPy, scikit-learn


## How to Run Locally

### 1. Clone the Repository

```bash
git clone < https://github.com/Mohid555/Mohid.S-QuestionFinder.git >
cd similar-study-question-finder
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create the Environment File

Copy `.env.example` to a new file named `.env`.

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your MongoDB Atlas connection string:

```env
MONGODB_URI=mongodb+srv://mohid:mohid123@<cluster-host>/questionfinder?retryWrites=true&w=majority&appName=QuestionFinder
MONGODB_DB=questionfinder
MONGODB_COLLECTIONS=submissions,questions
PORT=5000
VITE_API_BASE_URL=http://localhost:5000
```

`VITE_API_BASE_URL` is important when running locally because it tells the React frontend to use your local backend instead of the hosted API.

### 4. Start the Backend

Open one terminal and run:

```bash

cd .\backend\ 

npm run server

```

Backend URL:

```text
http://localhost:5000
```

Health check:

```text
http://localhost:5000/api/health
```

### 5. Start the Frontend

Open a second terminal and run:

```bash

 cd .\Frontend\

npm run dev

```

Frontend URL:

```text
http://localhost:5173
```

### 6. Login for Demo

Use the demo credentials shown in the app.

Default demo login:

```text
Email: demo123@gmail.com
Password: demo123
```

## Available Scripts

```bash
npm run dev
```

Starts the Vite frontend development server.

```bash
npm run server
```

Starts the Node.js backend API server.

```bash
npm run build
```

Builds the React frontend for production.

```bash
npm run lint
```

Runs TypeScript checking.


## Main Features

- Login / signup demonstration screen
- Dashboard for asking questions
- Automatic subject classification
- Similar question results with match percentage
- Topic filter sidebar
- Question history and previous reports
- Statistics page for topic distribution
- MongoDB storage for submitted questions
- Local fallback question database for development

## Project Structure

```text
similar-study-question-finder/
|-- Frontend/
|   `-- src/
|       |-- App.tsx
|       |-- components/
|       |-- config/
|       `-- types.ts
|-- backend/
|   |-- server.js
|   |-- db-store.json
|   |-- topics.json
|   `-- similarity_map.json
|-- modal.py
|-- package.json
|-- .env.example
`-- README.md
```



## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check if backend is running |
| GET | `/api/topics` | Get available subjects |
| POST | `/api/questions/search` | Submit a question and get similar questions |
| GET | `/api/submissions` | Get saved user submissions |
| GET | `/api/stats` | Get topic statistics |

Example search request:

```json
{
  "question": "How does photosynthesis work in plants?",
  "userName": "Student"
}
```

## How the AI / ML Part Works

The project uses a hybrid AI-style search approach instead of only simple keyword matching.

### 1. Topic Classification

When the user submits a question, the app analyzes the text and detects the most likely subject, such as:

- Biology
- Chemistry
- Physics
- Mathematics
- Computer Science
- History
- Economics
- Indian General Knowledge

The classifier uses subject-specific academic keywords and topic signals to assign the question to the correct category.

### 2. Similar Question Search

After classification, the backend searches the question database for related questions.

It uses **BM25 ranking**, a common information retrieval algorithm used in search engines. BM25 gives higher scores to questions that share important terms with the user's question.

The search also uses:

- normalized text processing
- stop-word removal
- unigrams, bigrams, and trigrams
- topic-based score boosting
- fallback matching when exact search results are weak

### 3. Semantic Similarity Data

The project includes precomputed files such as:

```text
backend/similarity_map.json
backend/db-store.json
```

These files store prepared question data and similarity information. They help the app show related study questions quickly without needing to train a model every time the app runs.

### 4. Saving Results

When a question is submitted:

1. The backend classifies the subject.
2. It finds the most similar questions.
3. It saves the submitted question and its matches in MongoDB.
4. The frontend displays the result with match percentages.

## Optional: Regenerate Seed Data

The project already includes local seed data, so this step is optional.

If you want to regenerate or upload a larger dataset, install the Python dependencies:

```bash
pip install sentence-transformers datasets scikit-learn numpy pymongo python-dotenv
```

Then run:

```bash
python modal.py
```

This script prepares study questions, creates embeddings, and can upload seed data to MongoDB Atlas.

## Notes for Evaluators

- The app can run locally with MongoDB Atlas configured in `.env`.
- If MongoDB is not configured, the backend can still use local JSON data for question search.
- User submissions require MongoDB to be saved permanently.
- The production frontend can be built using `npm run build`.

## Author

**Mohid S**  
Nandha Engineering College
