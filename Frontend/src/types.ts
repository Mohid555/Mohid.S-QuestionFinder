/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
}

export interface Question {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  text: string;
  tag: string;
  embedding: number[];
  createdAt: string;
}

export interface SimilarQuestionResult {
  id: string;
  text: string;
  tag: string;
  userName: string;
  createdAt: string;
  similarity: number;
}

export interface QuestionResponse {
  id: string;
  text: string;
  tag: string;
  createdAt: string;
  similarQuestions: SimilarQuestionResult[];
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export const ACADEMIC_TOPICS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "History",
  "Literature & Language",
  "Earth Science",
  "Geography",
  "Economics",
  "Psychology",
  "Political Science",
  "Art & Music",
  "Philosophy & Ethics",
  "Environmental Science",
  "General Science",
  "Indian General Knowledge"
] as const;

export type AcademicTopic = typeof ACADEMIC_TOPICS[number];
