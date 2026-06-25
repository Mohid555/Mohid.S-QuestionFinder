import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const dataDirs = [
  __dirname,
  join(__dirname, "public"),
  join(projectRoot, "dist"),
];

try {
  const envFile = readFileSync(join(projectRoot, ".env"), "utf8");
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

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "questionfinder";
const COLLECTION_NAMES = (process.env.MONGODB_COLLECTIONS || process.env.MONGODB_COLLECTION || "submissions,questions")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const WRITE_COLLECTION = COLLECTION_NAMES[0] || "submissions";
const SEED_COLLECTION = COLLECTION_NAMES[1] || WRITE_COLLECTION;
let mongoUnavailableReason = null;

// Detect placeholder / unconfigured URIs
const PLACEHOLDER_PATTERNS = ["<db_password>", "username:password", "<password>", "yourpassword", "your_password"];
const HAS_VALID_PRIMARY_URI = Boolean(MONGODB_URI) &&
  !PLACEHOLDER_PATTERNS.some((p) => MONGODB_URI.toLowerCase().includes(p.toLowerCase()));
const USE_MONGODB = HAS_VALID_PRIMARY_URI;

if (!USE_MONGODB) {
  console.warn("⚠️  MongoDB NOT configured — set MONGODB_URI in your .env file.");
}

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
let mongoConnecting = false;
let mongoSeeded = false;

async function readStoreData() {
  const data = await readJson("db-store.json", { users: [], questions: [] });
  return {
    users: Array.isArray(data.users) ? data.users : [],
    questions: Array.isArray(data.questions) ? data.questions : [],
  };
}

async function ensureSeedData(db) {
  if (mongoSeeded) return;

  const data = await readStoreData();
  if (!data.questions.length) {
    mongoSeeded = true;
    return;
  }

  const collection = db.collection(SEED_COLLECTION);
  const existingQuestions = await collection.estimatedDocumentCount();
  if (existingQuestions >= data.questions.length) {
    mongoSeeded = true;
    return;
  }

  const seedDocs = data.questions.map((question) => ({
    ...question,
    id: question.id || `seed-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    searchText: question.searchText || question.text,
    createdAt: question.createdAt || new Date().toISOString(),
  }));

  await collection.deleteMany({});
  for (let i = 0; i < seedDocs.length; i += 500) {
    await collection.insertMany(seedDocs.slice(i, i + 500), { ordered: false });
  }

  mongoSeeded = true;
  console.log(`Seeded ${seedDocs.length} hidden questions into MongoDB Atlas.`);
}

async function getDatabase() {
  if (!USE_MONGODB) return null;
  if (mongoUnavailableReason) return null;
  if (mongoConnecting) return null;

  if (!mongoClient) {
    const options = {
      retryWrites: true,
      w: "majority",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      // Disable certificate verification as a test (temporary troubleshooting only)
      // WARNING: Never use in production!
      tlsAllowInvalidCertificates: true,  // ⚠️ TEMPORARY - for troubleshooting only
      tlsAllowInvalidHostnames: true,      // ⚠️ TEMPORARY - for troubleshooting only
      retryWrites: true,
    };

    mongoConnecting = true;

    try {
      console.log("Attempting to connect to MongoDB Atlas...");
      console.log(`  URI: ${MONGODB_URI.replace(/:[^:]*@/, ':***@')}`);  // Hide password
      console.log("  ⚠️  Using permissive SSL settings (TEMPORARY - for troubleshooting)");
      mongoClient = new MongoClient(MONGODB_URI, options);
      await mongoClient.connect();
      
      console.log("✅ Connected to MongoDB Atlas.");
      await mongoClient.db("admin").command({ ping: 1 });
      console.log("✅ Database verified (ping successful).");

      mongoUnavailableReason = null;
      const db = mongoClient.db(DB_NAME);
      await ensureSeedData(db);

      return db;
    } catch (err) {
      mongoClient = null;
      console.error("\n❌ MongoDB Connection Error Details:");
      console.error(`   Code: ${err.code}`);
      console.error(`   Name: ${err.name}`);
      console.error(`   Message: ${err.message}`);
      
      // Provide specific guidance based on error type
      if (err.message?.includes("SSL") || err.message?.includes("ssl") || err.message?.includes("certificate") || err.message?.includes("alert")) {
        console.error("\n   🔧 SSL/TLS Handshake Error - This is usually a network/firewall issue:");
        console.error("      CRITICAL CHECKS:");
        console.error("      1. ✅ VERIFY IN MONGODB ATLAS DASHBOARD:");
        console.error("         - Go to Security → Network Access");
        console.error("         - Look for entry '0.0.0.0/0' (Allow from Anywhere)");
        console.error("         - If missing, click 'Add IP Address' → 'Allow access from anywhere'");
        console.error("      2. ✅ TRY THESE FIXES IN ORDER:");
        console.error("         a) Restart your backend server");
        console.error("         b) Disconnect from VPN if using one");
        console.error("         c) Disable Windows Defender Firewall temporarily");
        console.error("         d) Disable antivirus temporarily");
        console.error("         e) Try from a different network (mobile hotspot)");
        console.error("      3. ✅ VERIFY CONNECTION STRING:");
        console.error("         - Go to MongoDB Atlas → Connect → Drivers");
        console.error("         - Copy the connection string");
        console.error("         - Make sure .env matches EXACTLY");
        console.error("      4. ✅ TEST WITH DIFFERENT MONGODB INSTANCE:");
        console.error("         - Try connecting to a different MongoDB cluster");
        console.error("         - If that works, your QuestionFinder cluster may be paused");
      } else if (err.message?.includes("ENOTFOUND") || err.message?.includes("ECONNREFUSED")) {
        console.error("\n   🔧 Network Error - Can't reach MongoDB:");
        console.error("      1. Check internet connectivity: ping 8.8.8.8");
        console.error("      2. Verify cluster name in connection string");
        console.error("      3. Check firewall is not blocking mongodb.net");
      } else if (err.message?.includes("authentication failed")) {
        console.error("\n   🔧 Authentication Error:");
        console.error("      1. Verify username and password in MONGODB_URI");
        console.error("      2. Check database user exists in MongoDB Atlas");
        console.error("      3. Try resetting the database user password");
      }
      
      throw err;
    } finally {
      mongoConnecting = false;
    }
  }

  return mongoClient.db(DB_NAME);
}

async function readJson(fileName, fallback) {
  let lastError = null;

  for (const dir of dataDirs) {
    try {
      const raw = await readFile(join(dir, fileName), "utf8");
      return JSON.parse(raw);
    } catch (error) {
      lastError = error;
    }
  }

  console.error(`Failed to read ${fileName}:`, lastError?.message);
  return fallback;
}

async function loadQuestions() {
  const localQuestions = await loadLocalQuestionCorpus();
  const db = await getDatabase();
  if (db) {
    const dbQuestions = (await readQuestionDocs(db))
      .map(normalizeQuestionDoc)
      .filter(isSearchCorpusQuestion);

    if (dbQuestions.length > 0) {
      return mergeQuestionCorpus(localQuestions, dbQuestions);
    }
  }

  return localQuestions;
}

async function loadLocalQuestionCorpus() {
  if (!cache.questions) {
    const data = await readJson("db-store.json", { questions: [] });
    const questions = Array.isArray(data.questions) ? data.questions : [];
    cache.questions = questions.map(normalizeQuestionDoc).filter(isSearchCorpusQuestion);
  }

  return cache.questions;
}

function mergeQuestionCorpus(primaryQuestions, extraQuestions) {
  const byKey = new Map();
  for (const question of [...primaryQuestions, ...extraQuestions]) {
    const key = question.id || normalizeText(question.text);
    if (!byKey.has(key)) byKey.set(key, question);
  }
  return [...byKey.values()];
}

async function loadTopics() {
  const db = await getDatabase();
  if (db) {
    const topicSets = await Promise.all(
      COLLECTION_NAMES.map((collectionName) => db.collection(collectionName).distinct("tag"))
    );
    const topics = [...new Set(topicSets.flat())].filter(Boolean).sort();
    if (topics.length > 0) return topics;
  }

  if (!cache.topics) {
    const data = await readJson("topics.json", []);
    cache.topics = Array.isArray(data) ? data : data.topics || [];
  }
  return cache.topics;
}

function normalizeQuestionDoc(q) {
  return {
    id: q.id || String(q._id),
    text: q.text,
    tag: q.tag,
    createdAt: q.createdAt,
    userName: q.userName || "Anonymous",
    similarQuestions: Array.isArray(q.similarQuestions) ? q.similarQuestions : [],
    searchText: q.searchText || q.text,
    source: q.source || "",
  };
}

function isSearchCorpusQuestion(question) {
  const source = String(question.source || "").toLowerCase();
  const id = String(question.id || "");
  return source !== "user-submission" && !id.startsWith("q-api-");
}

function sortDocsByCreatedAt(docs) {
  return [...docs].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

async function readQuestionDocs(db, filter = {}) {
  const docsByKey = new Map();
  const collections = COLLECTION_NAMES.length ? COLLECTION_NAMES : ["submissions"];

  for (const collectionName of collections) {
    const docs = await db.collection(collectionName).find(filter).toArray();
    for (const doc of docs) {
      const key = doc.id || String(doc._id) || `${doc.text || ""}-${doc.createdAt || ""}`;
      if (!docsByKey.has(key)) docsByKey.set(key, doc);
    }
  }

  return sortDocsByCreatedAt([...docsByKey.values()]);
}

async function readSubmissionDocs(db, filter = {}) {
  const docs = await db.collection(WRITE_COLLECTION).find(filter).toArray();
  return sortDocsByCreatedAt(docs);
}

async function deleteSubmissionDoc(id) {
  const db = await getDatabase();
  if (!db) {
    throw new Error("MongoDB is not configured, so saved history cannot be deleted.");
  }

  const filters = [{ id }];
  if (ObjectId.isValid(id)) {
    filters.push({ _id: new ObjectId(id) });
  }

  const result = await db.collection(WRITE_COLLECTION).deleteOne({ $or: filters });
  return result.deletedCount > 0;
}

async function loadUserSubmissions() {
  const db = await getDatabase();
  if (db) {
    return (await readSubmissionDocs(db)).map(normalizeQuestionDoc);
  }

  return [];
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
  // articles / conjunctions / prepositions
  "a", "an", "the", "and", "or", "but", "nor", "so", "yet",
  "for", "of", "to", "in", "on", "at", "by", "up", "as", "if", "it",
  "no", "is", "be", "do", "go", "am", "are", "was", "were", "been",
  "has", "had", "get", "got", "did", "its", "not", "nor",
  // pronouns
  "he", "she", "we", "me", "my", "us", "you", "all", "who", "his",
  "her", "him", "they", "them", "our", "your", "its",
  "this", "that", "these", "those",
  // question words
  "can", "how", "does", "what", "when", "where", "which", "why",
  // common adverbs / adjectives / misc
  "with", "from", "have", "into", "about", "there", "their",
  "will", "also", "more", "most", "very", "just", "only", "each",
  "other", "like", "then", "make", "made", "over", "much", "well",
  "give", "after", "year", "years", "here", "being", "between",
  "need", "used", "using", "use", "type", "types",
  "them", "than", "any", "some", "such", "while", "both", "through",
  "during", "before", "since", "first", "second", "called", "known",
  "name", "named", "refer", "often", "many", "same", "new", "old",
  "part", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten",
]);

// ─── BM25 index (built lazily on first search call) ────────────────────────
let bm25Index = null;

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Extract all unigrams + bigrams + trigrams from a token array */
function ngrams(tokens) {
  const out = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    out.push(tokens[i] + "_" + tokens[i + 1]);
  }
  for (let i = 0; i < tokens.length - 2; i++) {
    out.push(tokens[i] + "_" + tokens[i + 1] + "_" + tokens[i + 2]);
  }
  return out;
}

/**
 * Build a BM25 index over the question corpus.
 * Stores: idf per term, term-frequency per doc, avg doc length.
 */
function buildBm25Index(questions) {
  const k1 = 1.5;
  const b  = 0.75;

  // Step 1: tokenise every document
  const docs = questions.map((q) => {
    const tokens = ngrams(tokenize(q.searchText || q.text));
    const tf = {};
    for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
    return { id: q.id, tf, len: tokens.length };
  });

  const N   = docs.length;
  const avgL = docs.reduce((s, d) => s + d.len, 0) / (N || 1);

  // Step 2: document frequencies per term
  const df = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc.tf)) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  // Step 3: IDF (Robertson-Sparck Jones, smoothed)
  const idf = {};
  for (const [term, freq] of Object.entries(df)) {
    idf[term] = Math.log((N - freq + 0.5) / (freq + 0.5) + 1);
  }

  // Step 4: inverted index  term → [{docIdx, score}]  (pre-computed BM25 weight)
  const inv = {};
  docs.forEach((doc, idx) => {
    for (const [term, freq] of Object.entries(doc.tf)) {
      const tf_norm = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * doc.len / avgL));
      const score   = (idf[term] || 0) * tf_norm;
      if (!inv[term]) inv[term] = [];
      inv[term].push({ idx, score });
    }
  });

  return { inv, idf, N, docs };
}

function ensureBm25Index(questions) {
  if (!bm25Index || bm25Index.N !== questions.length) {
    bm25Index = buildBm25Index(questions);
  }
  return bm25Index;
}

const keywordMap = {
  Biology: [
    "plant", "plants", "cell", "cells", "photosynthesis", "animal", "animals",
    "dna", "rna", "organism", "organisms", "body", "blood", "heart",
    "brain", "lung", "lungs", "respiration", "respiratory", "breathing",
    "muscle", "muscles", "nerve", "nerves", "organ", "organs", "tissue",
    "tissues", "bone", "bones", "skeleton", "digest", "digestion",
    "stomach", "kidney", "kidneys", "liver", "gene", "genes", "genetic",
    "virus", "viruses", "bacteria", "protein", "enzyme", "ecosystem",
    "species", "evolution", "biology", "biological", "living", "life",
  ],
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
  const words = new Set(text.split(" ").filter(Boolean));
  const topicScores = new Map(topics.map((topic) => [topic, 0]));

  for (const topic of topics) {
    const topicWords = normalizeText(topic).split(" ");
    for (const word of topicWords) {
      if (word.length > 2 && words.has(word)) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 2);
      }
    }
  }

  for (const [topic, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      const isPhrase = normalizedKeyword.includes(" ");
      const matches = isPhrase ? text.includes(normalizedKeyword) : words.has(normalizedKeyword);
      if (matches) {
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
  const index = ensureBm25Index(questions);
  const { inv, idf, N, docs } = index;

  // ── Query processing ──────────────────────────────────────────────────────
  const rawTokens  = tokenize(question);
  const queryTerms = ngrams(rawTokens);

  if (queryTerms.length === 0) {
    // Absolute fallback: same-topic questions
    return questions
      .filter((q) => q.tag === assignedTopic && normalizeText(q.text) !== normalizeText(question))
      .slice(0, 6)
      .map((q, i) => ({
        id: q.id, text: q.text, tag: q.tag,
        userName: q.userName || "Question Finder",
        createdAt: q.createdAt,
        similarity: Number((0.55 - i * 0.03).toFixed(2)),
      }));
  }

  // ── BM25 accumulation ─────────────────────────────────────────────────────
  const scores = new Float64Array(docs.length);
  for (const term of queryTerms) {
    const postings = inv[term];
    if (!postings) continue;
    for (const { idx, score } of postings) {
      scores[idx] += score;
    }
  }

  // ── Normalise to [0, 1] and apply light topic bonus ──────────────────────
  const queryNorm = queryTerms.reduce((s, t) => s + (idf[t] || 0), 0) || 1;

  const normalizedQuestion = normalizeText(question);

  const results = [];
  for (let i = 0; i < docs.length; i++) {
    const q = questions[i];
    if (normalizeText(q.text) === normalizedQuestion) continue;

    const rawSim  = scores[i] / queryNorm;
    // Topic bonus: small boost (0.08) only when content score is already non-zero
    const topicBonus = (rawSim > 0 && q.tag === assignedTopic) ? 0.08 : 0;
    const similarity = Math.min(0.97, rawSim + topicBonus);

    if (similarity >= 0.05) {
      results.push({
        id: q.id, text: q.text, tag: q.tag,
        userName: q.userName || "Question Finder",
        createdAt: q.createdAt,
        similarity: Number(similarity.toFixed(2)),
        _rawSim: rawSim,
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  const top = results.slice(0, 6);

  // Strip internal _rawSim field before returning
  for (const r of top) delete r._rawSim;

  if (top.length > 0) return top;

  // ── Second-pass: partial substring match across ALL questions ─────────────
  // Use raw tokens (unigrams only) with substring search for proper nouns etc.
  if (rawTokens.length > 0) {
    const partialScored = questions
      .filter((q) => normalizeText(q.text) !== normalizedQuestion)
      .map((q) => {
        const qText = normalizeText(q.searchText || q.text);
        let hits = 0;
        for (const token of rawTokens) {
          if (token.length > 2 && qText.includes(token)) hits += 1;
        }
        const sim = hits / rawTokens.length;
        const topicBonus = sim > 0 && q.tag === assignedTopic ? 0.05 : 0;
        return { ...q, _sim: sim + topicBonus };
      })
      .filter((q) => q._sim >= 0.1)
      .sort((a, b) => b._sim - a._sim)
      .slice(0, 6)
      .map((q, i) => ({
        id: q.id, text: q.text, tag: q.tag,
        userName: q.userName || "Question Finder",
        createdAt: q.createdAt,
        similarity: Number(Math.min(0.65, q._sim).toFixed(2)),
      }));

    if (partialScored.length > 0) return partialScored;
  }

  // ── Hard fallback: same-topic questions ───────────────────────────────────
  // Shuffle so users don't always see the same first N questions
  if (rawTokens.length > 0) {
    return [];
  }

  const sameTopicPool = questions
    .filter((q) => q.tag === assignedTopic && normalizeText(q.text) !== normalizedQuestion);
  const shuffled = sameTopicPool
    .map((q) => ({ q, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ q }) => q)
    .slice(0, 6);

  return shuffled.map((q, i) => ({
    id: q.id, text: q.text, tag: q.tag,
    userName: q.userName || "Question Finder",
    createdAt: q.createdAt,
    similarity: Number((0.42 - i * 0.02).toFixed(2)),
  }));
}

async function saveSubmittedQuestion(question) {
  const db = await getDatabase();
  if (!db) {
    console.warn("MongoDB Atlas is not connected; skipping persistent save for this submission.");
    return;
  }

  const doc = {
    id:               question.id,
    text:             question.text,
    tag:              question.tag,
    userName:         question.userName || "Anonymous",
    similarQuestions: question.similarQuestions || [],
    createdAt:        question.createdAt || new Date().toISOString(),
    source:           "user-submission",
    searchText:       question.searchText || question.text,
  };

  await db.collection(WRITE_COLLECTION).insertOne(doc);
  console.log(`Saved submission to MongoDB: "${doc.text.slice(0, 60)}"`);
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
    try {
      const topics = await loadTopics();
      sendJson(response, 200, { topics });
    } catch (err) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stats") {
    const questions = await loadUserSubmissions();
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
    // Always read fresh from MongoDB — no cache, no limit cap
    const tag = url.searchParams.get("tag") || null;
    const allDocs = await loadUserSubmissions();
    const docs = tag ? allDocs.filter((item) => item.tag === tag) : allDocs;
    const total = docs.length;

    const submissions = docs.map((s) => ({
      id:               s.id || String(s._id),
      text:             s.text,
      tag:              s.tag,
      userName:         s.userName || "Anonymous",
      similarQuestions: Array.isArray(s.similarQuestions) ? s.similarQuestions : [],
      createdAt:        s.createdAt,
    }));

    sendJson(response, 200, { submissions, total });
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/api/submissions/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/submissions/", "")).trim();
    if (!id) {
      sendJson(response, 400, { error: "Submission id is required." });
      return;
    }

    try {
      const deleted = await deleteSubmissionDoc(id);
      if (!deleted) {
        sendJson(response, 404, { error: "Submission not found." });
        return;
      }

      sendJson(response, 200, { success: true, id });
    } catch (err) {
      sendJson(response, 500, { error: err.message || "Failed to delete submission." });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/questions/list") {
    const page  = Math.max(0, parseInt(url.searchParams.get("page")  || "0", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const tag   = url.searchParams.get("tag") || null;

    const db = await getDatabase();
    let docs;
    let total;

    if (db) {
      const filter = tag ? { tag } : {};
      const allDocs = await readSubmissionDocs(db, filter);
      total = allDocs.length;
      docs = allDocs.slice(page * limit, page * limit + limit);
    } else {
      const allDocs = await loadUserSubmissions();
      const filteredDocs = tag ? allDocs.filter((item) => item.tag === tag) : allDocs;
      total = filteredDocs.length;
      docs = filteredDocs.slice(page * limit, page * limit + limit);
    }

    const questions = docs.map((q) => ({
      id: q.id || String(q._id),
      text: q.text,
      tag: q.tag,
      userName: q.userName || "Anonymous",
      createdAt: q.createdAt,
      similarQuestions: q.similarQuestions || [],
    }));

    sendJson(response, 200, { questions, total, page, limit });
    return;
  }


  if (request.method === "POST" && url.pathname === "/api/questions/search") {
    const body = await readRequestBody(request);
    const text = String(body.question || "").trim();

    if (text.length < 8) {
      sendJson(response, 400, { error: "Question must be at least 8 characters." });
      return;
    }

    try {
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

      // Save to MongoDB
      await saveSubmittedQuestion(newQuestion);

      sendJson(response, 200, {
        id: newQuestion.id,
        text: newQuestion.text,
        tag: newQuestion.tag,
        createdAt: newQuestion.createdAt,
        similarQuestions,
      });
    } catch (err) {
      console.error("Search/save error:", err);
      sendJson(response, 500, { error: "Failed to process question: " + err.message });
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(projectRoot, "dist", safePath);
  const extension = extname(filePath);

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "Content-Type": staticTypes[extension] || "application/octet-stream" });
    response.end(file);
  } catch {
    const index = await readFile(join(projectRoot, "dist", "index.html"));
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
    const isApiRequest = (request.url || "").startsWith("/api/");
    sendJson(response, 500, { error: isApiRequest ? error.message : "Internal server error." });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Run this to fix it:  taskkill /IM node.exe /F`);
    console.error(`   Then start again:    npm run server\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});

async function startServer() {
  server.listen(PORT, HOST, () => {
    console.log(`Question Finder backend running at http://${HOST}:${PORT}`);
    if (USE_MONGODB) {
      console.log("   MongoDB check is running in the background...");
    } else {
      console.log("   ⚠️  MongoDB not configured. Using local JSON storage.");
    }
  });

  if (!USE_MONGODB) {
    console.log("\n📝 Running in LOCAL MODE (no MongoDB)");
    console.log("   • Questions stored in: backend/db-store.json");
    console.log("   • Data persists between restarts");
    console.log("   • To enable MongoDB: Update MONGODB_URI in .env\n");
    return;
  }

  // Try to connect to MongoDB in background
  try {
    const db = await getDatabase();
    if (!db) {
      console.log("\n⚠️  MongoDB Atlas connection failed (using local storage as fallback)");
      console.log("   To fix: Verify DNS and network connectivity");
      console.log("   • Run: nslookup questionfinder.r6hp7fi.mongodb.net");
      console.log("   • Check: ipconfig /all\n");
      return;
    }
    console.log("✅ MongoDB connection successful (MongoDB Atlas).");
    const count = (await readSubmissionDocs(db)).length;
    console.log(`   Total visible submissions in database: ${count}`);
  } catch (err) {
    mongoUnavailableReason = err.message;
    console.log("\n⚠️  MongoDB Atlas connection failed (using local storage as fallback)");
    if (err.message?.includes("ENOTFOUND")) {
      console.warn("   Error: DNS resolution failed");
      console.warn("   • Your network cannot resolve mongodb.net domains");
      console.warn("   • The app will work with local JSON storage");
      console.warn("   • To fix DNS:");
      console.warn("     1. Run: ipconfig /flushdns");
      console.warn("     2. Run: ipconfig /release && ipconfig /renew");
      console.warn("     3. Try different network or restart your computer");
    } else {
      console.warn(`   ${err.message}`);
    }
    console.log("   📝 Using local JSON storage for now...\n");
  }
}

startServer();
