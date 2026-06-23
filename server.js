import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const PORT = Number(process.env.PORT || 5000);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
} catch {}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "questionfinder";
const USE_MONGODB = Boolean(MONGODB_URI) && !MONGODB_URI.includes("<db_password>");

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const staticTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

let cache = {
  questions: null,
  topics: null,
};

let mongoClient = null;

async function getDatabase() {
  if (!USE_MONGODB) return null;

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    console.log("Connected to MongoDB Atlas");
  }

  return mongoClient.db(DB_NAME);
}

async function readJson(fileName, fallback) {
  try {
    const raw = await readFile(join(__dirname, fileName), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${fileName}:`, error.message);
    return fallback;
  }
}

async function loadQuestions() {
  const db = await getDatabase();
  if (db) {
    const questions = await db.collection("questions").find({}).toArray();
    if (questions.length >= 100) return questions;
  }

  if (!cache.questions) {
    const data = await readJson("db-store.json", { questions: [] });
    cache.questions = Array.isArray(data.questions) ? data.questions : [];
  }
  return cache.questions;
}

async function loadTopics() {
  const db = await getDatabase();
  if (db) {
    const topics = await db.collection("topics").find({}).sort({ name: 1 }).toArray();
    if (topics.length > 0) return topics.map((topic) => topic.name || topic.topic).filter(Boolean);
  }

  if (!cache.topics) {
    const data = await readJson("topics.json", []);
    cache.topics = Array.isArray(data) ? data : data.topics || [];
  }
  return cache.topics;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, jsonHeaders);
  response.end(JSON.stringify(body));
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "has",
  "how",
  "does",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "this",
  "that",
  "with",
  "from",
  "have",
  "into",
  "about",
  "there",
  "their",
  "will",
  "also",
  "more",
  "most",
  "very",
  "just",
  "only",
  "each",
  "other",
  "like",
  "then",
  "make",
  "made",
  "over",
  "much",
  "well",
  "give",
  "after",
  "year",
  "years",
  "here",
  "being",
  "between",
  "need",
  "used",
  "using",
  "use",
  "type",
  "types",
]);

const keywordMap = {
  Biology: ["plant", "cell", "photosynthesis", "animal", "dna", "organism", "body", "blood", "heart", "brain", "gene", "virus", "bacteria"],
  Chemistry: ["atom", "molecule", "acid", "base", "reaction", "element", "compound", "bond", "chemical", "periodic", "solution"],
  Physics: ["force", "energy", "motion", "gravity", "light", "electric", "speed", "velocity", "wave", "sound", "heat", "magnet"],
  Mathematics: ["equation", "algebra", "calculus", "geometry", "number", "fraction", "angle", "graph", "theorem", "probability"],
  "Computer Science": ["computer", "program", "algorithm", "data", "code", "database", "index", "software", "network", "internet", "api"],
  History: ["war", "king", "empire", "revolution", "ancient", "independence", "civilization", "battle", "dynasty"],
  Geography: ["country", "river", "mountain", "capital", "map", "continent", "population", "ocean", "climate", "city"],
  Economics: ["money", "market", "inflation", "trade", "economy", "supply", "demand", "price", "tax", "bank", "gdp"],
  Psychology: ["mental", "health", "mind", "behavior", "emotion", "stress", "anxiety", "depression", "memory", "learning", "personality"],
  "Art & Music": ["photo", "photography", "image", "picture", "painting", "art", "music", "song", "instrument", "color", "design"],
  "Literature & Language": ["poem", "story", "novel", "author", "language", "grammar", "shakespeare", "literature", "essay"],
  "Earth Science": ["earth", "rock", "volcano", "earthquake", "soil", "weather", "atmosphere", "geology", "ocean"],
  "Environmental Science": ["environment", "pollution", "climate", "ecosystem", "recycle", "conservation", "global warming"],
  "Political Science": ["government", "politics", "democracy", "constitution", "election", "law", "parliament"],
  "Philosophy & Ethics": ["ethics", "moral", "philosophy", "truth", "justice", "logic", "belief"],
  "Indian General Knowledge": ["india", "indian", "bharat", "gandhi", "nehru", "isro", "rbi", "lok sabha", "rajya sabha"],
  "General Science": ["science", "experiment", "matter", "technology", "research", "energy"],
};

function classifyTopic(question, topics) {
  const text = normalizeText(question);
  const topicScores = new Map(topics.map((topic) => [topic, 0]));

  for (const topic of topics) {
    const words = normalizeText(topic).split(" ");
    for (const word of words) {
      if (word.length > 2 && text.includes(word)) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 2);
      }
    }
  }

  for (const [topic, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 3);
      }
    }
  }

  let bestTopic = "General Knowledge";
  let bestScore = 0;
  for (const [topic, score] of topicScores.entries()) {
    if (score > bestScore) {
      bestTopic = topic;
      bestScore = score;
    }
  }

  return bestTopic;
}

function findSimilarQuestions(question, assignedTopic, questions) {
  const queryWords = new Set(
    normalizeText(question)
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word))
  );

  const scored = questions
    .map((item) => {
      const itemText = normalizeText(item.searchText || item.text);
      const itemWords = new Set(itemText.split(" "));
      let matches = 0;
      for (const word of queryWords) {
        if (itemWords.has(word)) matches += 1;
        else if (word.length >= 4 && itemText.includes(word)) matches += 0.6;
      }

      const topicBonus = item.tag === assignedTopic ? 0.35 : 0;
      const similarity = queryWords.size ? matches / queryWords.size + topicBonus : topicBonus;

      return {
        id: item.id,
        text: item.text,
        tag: item.tag,
        userName: item.userName || "Question Finder",
        createdAt: item.createdAt,
        similarity: Math.min(0.96, Number(similarity.toFixed(2))),
      };
    })
    .filter((item) => item.similarity >= 0.25 && normalizeText(item.text) !== normalizeText(question))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);

  if (scored.length > 0) return scored;

  const fallback = questions
    .filter((item) => item.tag === assignedTopic && normalizeText(item.text) !== normalizeText(question))
    .slice(0, 6)
    .map((item, index) => ({
      id: item.id,
      text: item.text,
      tag: item.tag,
      userName: item.userName || "Question Finder",
      createdAt: item.createdAt,
      similarity: Number((0.58 - index * 0.03).toFixed(2)),
    }));

  if (fallback.length > 0) return fallback;

  return questions
    .filter((item) => normalizeText(item.text) !== normalizeText(question))
    .slice(0, 6)
    .map((item, index) => ({
      id: item.id,
      text: item.text,
      tag: item.tag,
      userName: item.userName || "Question Finder",
      createdAt: item.createdAt,
      similarity: Number((0.5 - index * 0.03).toFixed(2)),
    }));
}

async function saveSubmittedQuestion(question) {
  const db = await getDatabase();
  if (!db) return;

  await db.collection("submissions").insertOne({
    ...question,
    userName: question.userName || "Sir",
    source: "presentation-demo",
  });
}

async function handleApi(request, response, url) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, jsonHeaders);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", service: "Question Finder API" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/topics") {
    sendJson(response, 200, { topics: await loadTopics() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stats") {
    const questions = await loadQuestions();
    const tagCounts = {};
    for (const question of questions) {
      tagCounts[question.tag] = (tagCounts[question.tag] || 0) + 1;
    }
    sendJson(response, 200, {
      totalQuestions: questions.length,
      tagCounts,
      topics: Object.keys(tagCounts),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/submissions") {
    const db = await getDatabase();
    if (!db) {
      sendJson(response, 200, { submissions: [] });
      return;
    }

    const submissions = await db
      .collection("submissions")
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const [questions, topics] = await Promise.all([loadQuestions(), loadTopics()]);
    const enrichedSubmissions = submissions.map((submission) => {
      if (Array.isArray(submission.similarQuestions) && submission.similarQuestions.length > 0) {
        return submission;
      }

      const tag = submission.tag || classifyTopic(submission.text, topics);
      return {
        ...submission,
        tag,
        similarQuestions: findSimilarQuestions(submission.text, tag, questions),
      };
    });

    sendJson(response, 200, { submissions: enrichedSubmissions });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/questions/search") {
    const body = await readRequestBody(request);
    const text = String(body.question || "").trim();

    if (text.length < 8) {
      sendJson(response, 400, { error: "Question must be at least 8 characters." });
      return;
    }

    const [questions, topics] = await Promise.all([loadQuestions(), loadTopics()]);
    const tag = classifyTopic(text, topics);
    const similarQuestions = findSimilarQuestions(text, tag, questions);
    const newQuestion = {
      id: `q-api-${Date.now()}`,
      text,
      tag,
      createdAt: new Date().toISOString(),
      userName: body.userName || "Sir",
      similarQuestions,
    };

    await saveSubmittedQuestion(newQuestion);

    sendJson(response, 200, {
      id: newQuestion.id,
      text: newQuestion.text,
      tag: newQuestion.tag,
      createdAt: newQuestion.createdAt,
      similarQuestions,
    });
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(__dirname, "dist", safePath);
  const extension = extname(filePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": staticTypes[extension] || "application/octet-stream" });
    response.end(file);
  } catch {
    const index = await readFile(join(__dirname, "dist", "index.html"));
    response.writeHead(200, { "Content-Type": staticTypes[".html"] });
    response.end(index);
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Question Finder backend running at http://localhost:${PORT}`);
});
