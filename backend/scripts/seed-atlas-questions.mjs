import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const rootDir = fileURLToPath(new URL("../..", import.meta.url));

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

const env = parseEnv(await readFile(join(rootDir, ".env"), "utf8"));
const uri = env.MONGODB_URI;
const dbName = env.MONGODB_DB || "questionfinder";

if (!uri) {
  throw new Error("MONGODB_URI is missing from .env");
}

const store = JSON.parse(await readFile(join(backendDir, "db-store.json"), "utf8"));
const questions = Array.isArray(store.questions) ? store.questions : [];

const seedDocs = questions.map((question) => ({
  ...question,
  source: question.source || "Academic dataset",
  searchText: question.searchText || question.text,
  createdAt: question.createdAt || new Date().toISOString(),
}));

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
});

try {
  await client.connect();
  await client.db("admin").command({ ping: 1 });

  const db = client.db(dbName);
  const questionCollection = db.collection("questions");
  const submissionCollection = db.collection("submissions");
  const before = await questionCollection.countDocuments();
  await questionCollection.deleteMany({});

  let inserted = 0;
  if (seedDocs.length > 0) {
    for (let i = 0; i < seedDocs.length; i += 500) {
      const result = await questionCollection.insertMany(seedDocs.slice(i, i + 500), { ordered: false });
      inserted += result.insertedCount;
    }
  }

  const after = await questionCollection.countDocuments();
  const submissions = await submissionCollection.countDocuments();

  console.log(JSON.stringify({ before, after, inserted, submissions }, null, 2));
} finally {
  await client.close().catch(() => {});
}
