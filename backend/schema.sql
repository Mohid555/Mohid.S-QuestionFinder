-- Optional for local PostgreSQL only:
-- CREATE DATABASE questionfinder;
-- \c questionfinder

CREATE TABLE IF NOT EXISTS question_submissions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  tag TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Anonymous',
  similar_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'user-submission',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  tag TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'Question Finder',
  search_text TEXT,
  source TEXT NOT NULL DEFAULT 'Academic dataset',
  similar_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS question_submissions_tag_idx
  ON question_submissions (tag);

CREATE INDEX IF NOT EXISTS question_submissions_created_at_idx
  ON question_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS question_bank_tag_idx
  ON question_bank (tag);

CREATE INDEX IF NOT EXISTS question_bank_created_at_idx
  ON question_bank (created_at DESC);
