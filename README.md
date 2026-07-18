# Mohid.S - Question Finder

An AI-assisted study question finder that classifies a student's question by subject and searches for similar previous questions.

## Chosen Option

I chose the **Similar Study Question Finder** option.

The project allows a user to enter a study question, automatically detects the academic subject, and finds related questions from the existing question database.

## Project Overview

Use Link --> questionfindermohid.netlify.app 

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js HTTP API with PostgreSQL persistence
- **Database:** PostgreSQL (`pg` driver)
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

### 3. Configure PostgreSQL

Create a PostgreSQL database, then set the connection string in `.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/questionfinder
PG_TABLE_NAME=question_submissions
PG_QUESTIONS_TABLE=question_bank
PGSSLMODE=disable
PORT=5000
```

For hosted PostgreSQL providers that require SSL, use:

```env
PGSSLMODE=require
```

The backend creates the `question_submissions` and `question_bank` tables automatically. On first startup it seeds `question_bank` from `backend/db-store.json`.

### 4. Start the Backend

Open one terminal and run:

```bash
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
- PostgreSQL-backed question bank and submission history

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
2. It finds the most similar questions from the PostgreSQL-backed question bank.
3. It saves the submitted question and suggested matches in PostgreSQL.
4. The frontend displays the result with match percentages.

## Optional: Regenerate Seed Data

The project already includes local seed data, so this step is optional.

If you want to regenerate or upload a larger dataset, install the Python dependencies:

```bash
pip install sentence-transformers datasets scikit-learn numpy python-dotenv
```

Then run:

```bash
python modal.py
```

This script prepares study questions and creates embeddings.

## Notes for Evaluators

- The production frontend can be built using `npm run build`.

## Author

**Mohid S**  
Nandha Engineering College


