import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const PG_TABLE_NAME = process.env.PG_TABLE_NAME || "question_submissions";
const PG_QUESTIONS_TABLE = process.env.PG_QUESTIONS_TABLE || "question_bank";

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
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

let pgPool = null;
let dbInitPromise = null;

function getSslConfig() {
  const mode = String(process.env.PGSSLMODE || "").toLowerCase();
  if (mode === "disable") return false;
  if (mode === "require" || mode === "no-verify") return { rejectUnauthorized: false };
  if (process.env.PGSSL === "true") return { rejectUnauthorized: false };
  return undefined;
}

function quoteIdentifier(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function getPool() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL storage.");
  }

  if (!pgPool) {
    const ssl = getSslConfig();
    pgPool = new pg.Pool({
      connectionString: DATABASE_URL,
      ...(ssl === undefined ? {} : { ssl }),
    });
  }

  return pgPool;
}

async function ensureDatabase() {
  if (!dbInitPromise) {
    const submissionsTable = quoteIdentifier(PG_TABLE_NAME);
    const questionsTable = quoteIdentifier(PG_QUESTIONS_TABLE);
    const submissionsTagIndex = quoteIdentifier(`${PG_TABLE_NAME}_tag_idx`);
    const submissionsCreatedIndex = quoteIdentifier(`${PG_TABLE_NAME}_created_at_idx`);
    const questionsTagIndex = quoteIdentifier(`${PG_QUESTIONS_TABLE}_tag_idx`);
    const questionsCreatedIndex = quoteIdentifier(`${PG_QUESTIONS_TABLE}_created_at_idx`);

    dbInitPromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${submissionsTable} (
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          tag TEXT NOT NULL,
          user_name TEXT NOT NULL DEFAULT 'Anonymous',
          similar_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
          source TEXT NOT NULL DEFAULT 'user-submission',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${questionsTable} (
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          tag TEXT NOT NULL,
          user_name TEXT NOT NULL DEFAULT 'Question Finder',
          search_text TEXT,
          source TEXT NOT NULL DEFAULT 'Academic dataset',
          similar_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${submissionsTagIndex} ON ${submissionsTable} (tag)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${submissionsCreatedIndex} ON ${submissionsTable} (created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${questionsTagIndex} ON ${questionsTable} (tag)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS ${questionsCreatedIndex} ON ${questionsTable} (created_at DESC)`);
      await seedQuestionBankIfEmpty(pool);
    })();
  }

  return dbInitPromise;
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapSubmissionRow(row) {
  return {
    id: row.id,
    text: row.text,
    tag: row.tag,
    userName: row.user_name || "Anonymous",
    similarQuestions: Array.isArray(row.similar_questions) ? row.similar_questions : [],
    source: row.source || "user-submission",
    createdAt: toIsoDate(row.created_at),
  };
}

function mapQuestionBankRow(row) {
  return normalizeQuestionDoc({
    id: row.id,
    text: row.text,
    tag: row.tag,
    userName: row.user_name || "Question Finder",
    similarQuestions: row.similar_questions,
    searchText: row.search_text || row.text,
    source: row.source || "Academic dataset",
    createdAt: row.created_at,
  });
}

async function seedQuestionBankIfEmpty(pool) {
  if (process.env.PG_SEED_QUESTION_BANK === "false") return;

  const table = quoteIdentifier(PG_QUESTIONS_TABLE);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  if ((rows[0]?.count || 0) > 0) return;

  const store = await readStoreData();
  const seedQuestions = store.questions
    .map(normalizeQuestionDoc)
    .filter((question) => question.text && isSearchCorpusQuestion(question));

  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < seedQuestions.length; i += batchSize) {
    const batch = seedQuestions.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((question, index) => {
      const offset = index * 8;
      values.push(
        question.id,
        question.text,
        question.tag || "General Knowledge",
        question.userName || "Question Finder",
        question.searchText || question.text,
        question.source || "Academic dataset",
        JSON.stringify(Array.isArray(question.similarQuestions) ? question.similarQuestions : []),
        question.createdAt || new Date().toISOString(),
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8}::timestamptz)`;
    });

    const result = await pool.query(
      `
        INSERT INTO ${table} (id, text, tag, user_name, search_text, source, similar_questions, created_at)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (id) DO NOTHING
      `,
      values,
    );
    inserted += result.rowCount || 0;
  }

  console.log(`   Seeded ${inserted} questions into PostgreSQL table "${PG_QUESTIONS_TABLE}".`);
}


async function readStoreData() {
  const data = await readJson("db-store.json", { users: [], questions: [] });
  return {
    users: Array.isArray(data.users) ? data.users : [],
    questions: Array.isArray(data.questions) ? data.questions : [],
  };
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
  return loadPostgresQuestionCorpus();
}

async function loadPostgresQuestionCorpus() {
  if (!cache.questions) {
    await ensureDatabase();
    const table = quoteIdentifier(PG_QUESTIONS_TABLE);
    const { rows } = await getPool().query(`
      SELECT id, text, tag, user_name, search_text, source, similar_questions, created_at
      FROM ${table}
      ORDER BY created_at DESC
    `);
    cache.questions = rows.map(mapQuestionBankRow).filter(isSearchCorpusQuestion);
  }

  return cache.questions;
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

async function loadUserSubmissions() {
  await ensureDatabase();
  const table = quoteIdentifier(PG_TABLE_NAME);
  const { rows } = await getPool().query(`
    SELECT id, text, tag, user_name, similar_questions, source, created_at
    FROM ${table}
    ORDER BY created_at DESC
  `);
  return rows.map(mapSubmissionRow);
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
  "term", "terms", "describe", "describes", "described",
  "world", "real", "knowledge", "practiced", "practice",
  "part", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten",
]);

// ─── BM25 index (built lazily on first search call) ────────────────────────
let bm25Index = null;

const subjectExpansionMap = {
  Biology: "biology biological life living organism cell cells plant plants animal animals dna gene genes photosynthesis chlorophyll chloroplast respiration ecosystem species",
  Chemistry: "chemistry chemical atom atoms molecule molecules element compound acid base reaction bond periodic solution ion electron proton neutron",
  Physics: "physics physical force energy motion gravity light sound wave heat electricity electric magnet current voltage speed velocity acceleration",
  Mathematics: "mathematics math equation algebra calculus geometry number fraction angle graph theorem probability statistics derivative integral",
  "Computer Science": "computer science computing algorithm data database code programming software network internet api binary memory processor",
  History: "history historical war revolution empire ancient medieval king queen dynasty battle civilization independence treaty",
  Geography: "geography country countries river mountain capital continent ocean climate map population city latitude longitude",
  Economics: "economics economy money market inflation trade supply demand price tax bank gdp business finance",
  Psychology: "psychology mental health mind behavior emotion stress anxiety memory learning personality cognition",
  "Art & Music": "art music painting photo photography image picture song instrument color design gallery artist",
  "Literature & Language": "literature language poem poetry story novel author grammar shakespeare essay writing word",
  "Earth Science": "earth science geology rock mineral volcano earthquake soil weather atmosphere ocean climate tectonic",
  "Environmental Science": "environment environmental pollution climate ecosystem conservation recycle warming sustainability biodiversity",
  "Political Science": "political science government politics democracy constitution election law parliament court policy rights",
  "Philosophy & Ethics": "philosophy ethics moral truth justice logic belief argument reason values",
  "Indian General Knowledge": "india indian bharat gandhi nehru isro rbi lok sabha rajya sabha constitution state",
  "General Science": "science experiment matter technology research energy observation hypothesis laboratory",
  "General Knowledge": "general knowledge facts current affairs world person place organization event",
};

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

function expandQueryText(text, assignedTopic) {
  const normalized = normalizeText(text);
  const expansions = {
    chlorophyll: "biology plant plants leaf leaves chloroplast chloroplasts photosynthesis light sunlight energy green pigment pigments",
    chloroplast: "biology plant plants leaf leaves photosynthesis chlorophyll light sunlight energy organelle",
    photosynthesis: "biology plant plants leaf leaves chloroplast chlorophyll sunlight carbon dioxide water glucose oxygen",
  };

  const extraTerms = [];
  for (const [term, extra] of Object.entries(expansions)) {
    if (normalized.includes(term)) extraTerms.push(extra);
  }

  return extraTerms.length ? `${text} ${extraTerms.join(" ")}` : text;
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
    // Plants
    "plant", "plants", "planta", "flora", "leaf", "leaves", "root", "roots", "stem", "stems",
    "flower", "flowers", "seed", "seeds", "pollen", "fruit", "fruits", "tree", "trees",
    "photosynthesis", "chlorophyll", "chloroplast", "chloroplasts", "pigment", "pigments",
    // Animals
    "animal", "animals", "fauna", "mammal", "mammals", "reptile", "reptiles",
    "bird", "birds", "fish", "insect", "insects", "amphibian", "amphibians",
    // Cells & Genetics
    "cell", "cells", "cellular", "membrane", "nucleus", "cytoplasm", "mitochondria",
    "dna", "rna", "chromosome", "chromosomes", "gene", "genes", "genetic", "genetics",
    "heredity", "mutation", "mutations", "allele", "alleles", "genotype", "phenotype",
    // Human Body
    "body", "blood", "heart", "cardiac", "heartbeat", "pulse",
    "brain", "neuron", "neurons", "neural", "nervous", "spinal",
    "lung", "lungs", "pulmonary", "respiratory", "respiration", "breathing", "breath",
    "muscle", "muscles", "muscular", "skeletal", "skeleton", "bone", "bones",
    "nerve", "nerves", "organ", "organs", "tissue", "tissues",
    "digest", "digestion", "digestive", "intestine", "intestines", "stomach", "esophagus",
    "kidney", "kidneys", "renal", "liver", "hepatic", "pancreas", "gallbladder",
    "skin", "dermis", "epidermis", "hair", "nail", "nails",
    "eye", "eyes", "retina", "cornea", "ear", "ears", "cochlea",
    "hormone", "hormones", "endocrine", "insulin", "adrenaline",
    "immune", "immunity", "antibody", "antibodies", "antigen", "antigens", "lymph",
    "artery", "arteries", "vein", "veins", "capillary", "capillaries", "circulatory",
    "uterus", "ovary", "ovaries", "sperm", "embryo", "fetus",
    // Microbes & Disease
    "virus", "viruses", "viral", "bacteria", "bacterial", "pathogen", "pathogens",
    "fungus", "fungi", "parasite", "parasites", "microbe", "microbes", "microorganism",
    "infection", "disease", "diseases", "vaccine", "vaccines", "epidemic", "pandemic",
    // Biochemistry
    "protein", "proteins", "enzyme", "enzymes", "amino", "lipid", "lipids",
    "carbohydrate", "carbohydrates", "glucose", "starch", "cellulose",
    // Ecology
    "ecosystem", "ecosystems", "ecology", "ecological", "habitat", "habitats",
    "species", "population", "populations", "food chain", "food web",
    "predator", "prey", "symbiosis", "parasite", "host",
    "biome", "biomes", "biodiversity", "extinct", "extinction",
    // Evolution
    "evolution", "evolutionary", "natural selection", "adaptation", "adaptations",
    "fossil", "fossils", "darwin", "species", "speciation",
    // General Biology
    "biology", "biological", "living", "life", "organism", "organisms", "biotic",
    "abiotic", "reproduction", "reproductive", "mitosis", "meiosis", "osmosis",
    "diffusion", "photosynthesis", "respiration", "metabolism", "anatomy",
    "physiology", "zoology", "botany", "microbiology", "genetics",
  ],
  Chemistry: [
    "atom", "atoms", "atomic", "molecule", "molecules", "molecular", "element", "elements",
    "compound", "compounds", "mixture", "mixtures", "substance", "substances",
    "acid", "acids", "acidic", "base", "basic", "alkali", "alkaline", "neutral", "neutralization",
    "pH", "salt", "salts",
    "reaction", "reactions", "reactant", "reactants", "product", "products",
    "oxidation", "reduction", "redox", "combustion", "decomposition",
    "bond", "bonds", "bonding", "covalent", "ionic", "metallic", "hydrogen bond",
    "electron", "electrons", "proton", "protons", "neutron", "neutrons", "nucleus",
    "ion", "ions", "cation", "anion", "electrolyte", "electrolytes",
    "periodic", "periodic table", "valence", "orbital", "orbitals", "isotope", "isotopes",
    "solution", "solutions", "solute", "solvent", "dissolve", "dissolved", "concentration",
    "mole", "moles", "molarity", "stoichiometry",
    "chemical", "chemistry", "polymer", "polymers", "hydrocarbon", "hydrocarbons",
    "organic", "inorganic", "catalyst", "catalysts", "enzyme",
    "gas", "liquid", "solid", "plasma", "state",
  ],
  Physics: [
    "force", "forces", "newton", "gravity", "gravitational", "weight", "mass",
    "motion", "velocity", "speed", "acceleration", "momentum", "inertia",
    "energy", "kinetic", "potential", "thermal", "mechanical", "nuclear",
    "work", "power", "joule", "watt",
    "light", "optics", "reflection", "refraction", "diffraction", "lens", "mirror",
    "wave", "waves", "wavelength", "frequency", "amplitude", "vibration",
    "sound", "acoustic", "acoustics", "decibel",
    "heat", "temperature", "thermodynamics", "conduction", "convection", "radiation",
    "electric", "electricity", "charge", "charges", "current", "voltage", "resistance",
    "circuit", "circuits", "conductor", "conductors", "insulator",
    "magnet", "magnetic", "magnetism", "electromagnetic",
    "pressure", "fluid", "buoyancy", "archimedes",
    "quantum", "relativity", "atom", "nuclear", "fission", "fusion",
    "physics", "physical", "mechanics", "dynamics", "kinematics",
  ],
  Mathematics: [
    "equation", "equations", "algebra", "algebraic", "calculus", "geometry", "geometric",
    "number", "numbers", "integer", "integers", "fraction", "fractions", "decimal",
    "percentage", "ratio", "ratios", "proportion", "proportions",
    "angle", "angles", "triangle", "triangles", "quadrilateral", "polygon", "polygons",
    "circle", "circles", "radius", "diameter", "circumference", "area", "volume",
    "graph", "graphs", "coordinate", "coordinates", "function", "functions",
    "theorem", "theorems", "proof", "proofs", "axiom",
    "probability", "statistics", "mean", "median", "mode", "variance",
    "matrix", "matrices", "vector", "vectors", "scalar",
    "derivative", "integral", "limit", "limits", "logarithm", "exponent",
    "prime", "factor", "factors", "multiple", "multiples", "divisor",
    "math", "mathematics", "arithmetic", "trigonometry", "sine", "cosine",
    "polynomial", "quadratic", "linear", "sequence", "series",
  ],
  "Computer Science": [
    "computer", "computers", "computing", "program", "programs", "programming",
    "algorithm", "algorithms", "data", "database", "databases", "code", "coding",
    "software", "hardware", "network", "networks", "internet", "web",
    "api", "binary", "bit", "byte", "memory", "processor", "cpu",
    "variable", "function", "loop", "array", "object", "class",
    "operating system", "compiler", "interpreter", "syntax", "runtime",
    "cybersecurity", "encryption", "machine learning", "artificial intelligence",
  ],
  History: [
    "war", "wars", "battle", "battles", "revolution", "revolutions",
    "king", "kings", "queen", "queens", "emperor", "emperors", "empire", "empires",
    "ancient", "medieval", "dynasty", "dynasties", "civilization", "civilizations",
    "independence", "colony", "colonial", "colonialism", "treaty", "treaties",
    "historical", "history", "century", "centuries",
    "world war", "invasion", "uprising", "rebellion",
  ],
  Geography: [
    "country", "countries", "nation", "nations", "continent", "continents",
    "river", "rivers", "mountain", "mountains", "valley", "valleys",
    "capital", "capitals", "city", "cities", "state", "province",
    "ocean", "oceans", "sea", "seas", "lake", "lakes", "island", "islands",
    "map", "maps", "latitude", "longitude", "equator", "hemisphere",
    "population", "populations", "climate", "geography", "geographical",
    "desert", "deserts", "forest", "forests", "border", "borders",
  ],
  Economics: [
    "money", "currency", "market", "markets", "trade", "trading",
    "economy", "economic", "economics", "inflation", "deflation",
    "supply", "demand", "price", "prices", "cost", "costs",
    "tax", "taxes", "taxation", "bank", "banks", "banking",
    "gdp", "income", "investment", "investments", "profit", "loss",
    "business", "businesses", "finance", "financial", "stock", "stocks",
    "poverty", "wealth", "labor", "employment", "unemployment",
  ],
  Psychology: [
    "mental", "mind", "brain", "behavior", "behaviour", "cognitive", "cognition",
    "emotion", "emotions", "emotional", "feeling", "feelings",
    "stress", "anxiety", "depression", "phobia", "disorder",
    "memory", "memories", "learning", "perception", "attention",
    "personality", "motivation", "intelligence", "iq",
    "therapy", "therapist", "counseling", "psychology", "psychological",
    "subconscious", "unconscious", "conscious", "psyche",
  ],
  "Art & Music": [
    "art", "arts", "artistic", "painting", "paintings", "sculpture", "sculptor",
    "music", "musical", "song", "songs", "melody", "rhythm", "harmony",
    "instrument", "instruments", "guitar", "piano", "violin", "drum",
    "photo", "photography", "photograph", "image", "picture", "pictures",
    "color", "colors", "colour", "colours", "design", "designs",
    "dance", "theater", "theatre", "film", "cinema", "artist", "artists",
  ],
  "Literature & Language": [
    "poem", "poems", "poetry", "poet", "poets",
    "story", "stories", "novel", "novels", "fiction", "nonfiction",
    "author", "authors", "writer", "writers", "book", "books",
    "language", "languages", "grammar", "syntax", "vocabulary",
    "shakespeare", "literature", "literary", "essay", "essays",
    "word", "words", "sentence", "sentences", "paragraph",
    "metaphor", "simile", "alliteration", "rhyme",
  ],
  "Earth Science": [
    "earth", "geology", "geological", "rock", "rocks", "mineral", "minerals",
    "volcano", "volcanoes", "volcanic", "earthquake", "earthquakes", "seismic",
    "soil", "erosion", "tectonic", "tectonics", "plate", "plates",
    "weather", "atmosphere", "atmospheric", "stratosphere", "ozone",
    "ocean", "oceanography", "tide", "tides", "tsunami",
  ],
  "Environmental Science": [
    "environment", "environmental", "pollution", "pollutant", "pollutants",
    "climate change", "global warming", "greenhouse", "carbon",
    "ecosystem", "ecosystems", "conservation", "conserve", "preserve",
    "recycle", "recycling", "renewable", "sustainability", "sustainable",
    "biodiversity", "deforestation", "habitat loss",
  ],
  "Political Science": [
    "government", "governments", "governance", "politics", "political",
    "democracy", "democratic", "republic", "monarchy", "dictatorship",
    "constitution", "constitutional", "election", "elections", "voting", "vote",
    "parliament", "congress", "senate", "legislation", "legislative",
    "policy", "policies", "civil rights", "freedom", "liberty",
    "prime minister", "cabinet", "legislature", "geopolitics",
  ],
  "Philosophy & Ethics": [
    "philosophy", "philosophical", "philosopher", "philosophers",
    "ethics", "ethical", "moral", "morality", "morals",
    "truth", "knowledge", "wisdom", "logic", "logical",
    "justice", "fairness", "rights", "duty", "virtue",
    "belief", "beliefs", "argument", "reasoning", "reason",
    "consciousness", "existence", "metaphysics",
  ],
  "Indian General Knowledge": [
    "india", "indian", "bharat", "gandhi", "nehru", "ambedkar",
    "isro", "rbi", "sebi", "upsc", "iit", "iim",
    "lok sabha", "rajya sabha", "parliament", "constitution",
    "state", "states", "delhi", "mumbai", "kolkata", "chennai",
    "hindi", "rupee", "cricket", "bollywood",
  ],
  "General Science": [
    "science", "scientific", "scientist", "scientists",
    "experiment", "experiments", "experimental", "laboratory", "lab",
    "hypothesis", "theory", "theories", "observation", "observations",
    "matter", "technology", "technological", "research",
    "energy", "engineering", "engineer", "engineers",
    "invention", "inventions", "discovery", "discoveries",
  ],
};

const genericTopicWords = new Set(["general", "knowledge", "science"]);

function classifyTopic(question, topics) {
  const text = normalizeText(question);
  const wordArr = text.split(" ").filter(Boolean);
  const words = new Set(wordArr);
  const topicScores = new Map(topics.map((topic) => [topic, 0]));

  // Pass 1 — topic name word overlap
  for (const topic of topics) {
    const topicWords = normalizeText(topic).split(" ");
    for (const word of topicWords) {
      if (genericTopicWords.has(word)) continue;
      if (word.length > 2 && words.has(word)) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 2);
      }
    }
  }

  // Pass 2 — keyword map: exact word match OR substring match (handles plurals/suffixes)
  for (const [topic, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      const isPhrase = normalizedKeyword.includes(" ");
      let matches = false;
      if (isPhrase) {
        matches = text.includes(normalizedKeyword);
      } else {
        // Exact word match first (high confidence)
        if (words.has(normalizedKeyword)) {
          matches = true;
        } else {
          // Substring/stem match: any word in the question starts with or contains the keyword
          // (e.g. "digestive" matches keyword "digest", "muscular" matches "muscle")
          for (const w of wordArr) {
            if (w.length > 3 && (w.startsWith(normalizedKeyword) || normalizedKeyword.startsWith(w))) {
              matches = true;
              break;
            }
          }
        }
      }
      if (matches) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 3);
      }
    }
  }

  let bestTopic = null;
  let bestScore = 0;
  for (const [topic, score] of topicScores.entries()) {
    if (score > bestScore) {
      bestTopic = topic;
      bestScore = score;
    }
  }

  // Default fallback: use General Science (better than General Knowledge for academic Qs)
  return bestTopic || "General Science";
}

function toSimilarQuestion(question, similarity) {
  return {
    id: question.id,
    text: question.text,
    tag: question.tag,
    userName: question.userName || "Question Finder",
    createdAt: question.createdAt,
    similarity,
  };
}

function fillSimilarQuestions(matches, sourceQuestion, assignedTopic, questions) {
  const normalizedQuestion = normalizeText(sourceQuestion);
  const seen = new Set(matches.map((match) => normalizeText(match.text)));
  const sourceTokens = new Set(tokenize(sourceQuestion));
  const filled = matches.slice(0, 6);

  const addFromPool = (pool, baseScore) => {
    for (const question of pool) {
      if (filled.length >= 6) break;

      const normalizedText = normalizeText(question.text);
      if (!normalizedText || normalizedText === normalizedQuestion || seen.has(normalizedText)) continue;
      const candidateTokens = new Set(tokenize(question.searchText || question.text));
      const sharedTerms = [...sourceTokens].filter((token) => candidateTokens.has(token));
      if (sharedTerms.length === 0) continue;
      if (assignedTopic === "General Science" && sourceTokens.size >= 3 && sharedTerms.length < 2) continue;
      if (sourceTokens.size >= 4 && sharedTerms.length < 2) continue;

      seen.add(normalizedText);
      filled.push(toSimilarQuestion(question, Number(Math.max(0.2, baseScore - filled.length * 0.02).toFixed(2))));
    }
  };

  addFromPool(questions.filter((question) => question.tag === assignedTopic), 0.58);

  return filled.slice(0, 6);
}

function findSimilarQuestions(question, assignedTopic, questions) {
  const index = ensureBm25Index(questions);
  const { inv, idf, N, docs } = index;

  // ── Query processing ──────────────────────────────────────────────────────
  const primaryTokens = tokenize(question);
  const rawTokens  = tokenize(expandQueryText(question, assignedTopic));
  const queryTerms = ngrams(rawTokens);

  const normalizedQuestion = normalizeText(question);

  if (queryTerms.length === 0) {
    // Absolute fallback: same-topic questions
    return questions
      .filter((q) => q.tag === assignedTopic && normalizeText(q.text) !== normalizedQuestion)
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

  // ── Normalise to [0, 1] and apply topic bonus ─────────────────────────────
  const queryNorm = queryTerms.reduce((s, t) => s + (idf[t] || 0), 0) || 1;

  const results = [];
  for (let i = 0; i < docs.length; i++) {
    const q = questions[i];
    if (normalizeText(q.text) === normalizedQuestion) continue;

    const rawSim    = scores[i] / queryNorm;
    const docTokens = new Set(tokenize(q.searchText || q.text));
    const primaryHits = primaryTokens.filter((token) => docTokens.has(token)).length;
    const sameTopic   = q.tag === assignedTopic;

    // Topic bonus: boost same-topic results
    const topicBonus = (rawSim > 0 && sameTopic) ? 0.08 : 0;
    const similarity = Math.min(0.97, rawSim + topicBonus);

    // For same-topic results apply quality filter
    if (sameTopic) {
      if (assignedTopic === "General Science" && primaryTokens.length >= 3 && primaryHits < 2) continue;
      if (primaryTokens.length >= 4 && primaryHits < 2) continue;
      if (primaryTokens.length > 0 && primaryHits === 0 && rawSim < 0.15) continue;
      if (similarity >= 0.18) {
        results.push({
          id: q.id, text: q.text, tag: q.tag,
          userName: q.userName || "Question Finder",
          createdAt: q.createdAt,
          similarity: Number(similarity.toFixed(2)),
          _rawSim: rawSim,
          _sameTopic: true,
        });
      }
    } else {
      // Cross-topic: only include if there's meaningful content overlap
      if (primaryHits >= 2 && rawSim >= 0.3) {
        results.push({
          id: q.id, text: q.text, tag: q.tag,
          userName: q.userName || "Question Finder",
          createdAt: q.createdAt,
          similarity: Number(Math.min(0.65, rawSim).toFixed(2)),
          _rawSim: rawSim,
          _sameTopic: false,
        });
      }
    }
  }

  // Sort: same-topic first, then by score
  results.sort((a, b) => {
    if (a._sameTopic !== b._sameTopic) return a._sameTopic ? -1 : 1;
    return b.similarity - a.similarity;
  });

  const top = results.slice(0, 6);
  for (const r of top) { delete r._rawSim; delete r._sameTopic; }

  if (top.length >= 6) return top;

  // ── Second-pass: partial substring match (same-topic priority) ────────────
  if (rawTokens.length > 0) {
    const seenTexts = new Set(top.map((r) => normalizeText(r.text)));
    seenTexts.add(normalizedQuestion);

    const partialScored = questions
      .filter((q) => !seenTexts.has(normalizeText(q.text)))
      .map((q) => {
        const qText = normalizeText(q.searchText || q.text);
        let hits = 0;
        for (const token of rawTokens) {
          if (token.length > 2 && qText.includes(token)) hits += 1;
        }
        const primaryHitsLocal = primaryTokens.filter((t) => qText.split(" ").includes(t)).length;
        const sim = hits / rawTokens.length;
        const sameTopic = q.tag === assignedTopic;
        const topicBonus = sim > 0 && sameTopic ? 0.05 : 0;
        return { ...q, _sim: sim + topicBonus, _primaryHits: primaryHitsLocal, _sameTopic: sameTopic };
      })
      .filter((q) => {
        if (q._sim < 0.15) return false;
        if (q._sameTopic) {
          if (assignedTopic === "General Science" && primaryTokens.length >= 3) return q._primaryHits >= 2;
          if (primaryTokens.length >= 4) return q._primaryHits >= 2;
          return q._primaryHits > 0 || q._sim >= 0.3;
        }
        // Cross-topic: require stronger match
        return q._primaryHits >= 2 && q._sim >= 0.3;
      })
      .sort((a, b) => {
        if (a._sameTopic !== b._sameTopic) return a._sameTopic ? -1 : 1;
        return b._sim - a._sim;
      })
      .slice(0, 6 - top.length)
      .map((q) => ({
        id: q.id, text: q.text, tag: q.tag,
        userName: q.userName || "Question Finder",
        createdAt: q.createdAt,
        similarity: Number(Math.min(0.65, q._sim).toFixed(2)),
      }));

    const combined = [...top, ...partialScored];
    if (combined.length >= 3) return combined.slice(0, 6);

    // Still not enough — fill from same-topic pool
    return fillSimilarQuestions(combined, question, assignedTopic, questions);
  }

  // ── Hard fallback: shuffled same-topic questions ──────────────────────────
  const sameTopicPool = questions
    .filter((q) => q.tag === assignedTopic && normalizeText(q.text) !== normalizedQuestion);
  const shuffled = [...sameTopicPool]
    .sort(() => Math.random() - 0.5)
    .slice(0, 6);

  const fallbackMatches = shuffled.map((q, i) => ({
    id: q.id, text: q.text, tag: q.tag,
    userName: q.userName || "Question Finder",
    createdAt: q.createdAt,
    similarity: Number((0.42 - i * 0.02).toFixed(2)),
  }));

  return fillSimilarQuestions([...top, ...fallbackMatches], question, assignedTopic, questions);
}

async function saveSubmittedQuestion(question) {
  await ensureDatabase();
  const table = quoteIdentifier(PG_TABLE_NAME);
  const createdAt = question.createdAt || new Date().toISOString();
  const similarQuestions = Array.isArray(question.similarQuestions) ? question.similarQuestions : [];
  const { rows } = await getPool().query(
    `
      INSERT INTO ${table} (id, text, tag, user_name, similar_questions, source, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, NOW())
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        tag = EXCLUDED.tag,
        user_name = EXCLUDED.user_name,
        similar_questions = EXCLUDED.similar_questions,
        source = EXCLUDED.source,
        updated_at = NOW()
      RETURNING id, text, tag, user_name, similar_questions, source, created_at
    `,
    [
      question.id,
      question.text,
      question.tag,
      question.userName || "Anonymous",
      JSON.stringify(similarQuestions),
      question.source || "user-submission",
      createdAt,
    ],
  );
  return mapSubmissionRow(rows[0]);
}

async function deleteSubmittedQuestion(id) {
  await ensureDatabase();
  const table = quoteIdentifier(PG_TABLE_NAME);
  const { rowCount } = await getPool().query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  return rowCount > 0;
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
    const tag = url.searchParams.get("tag") || null;
    const allDocs = await loadUserSubmissions();
    const docs = tag ? allDocs.filter((item) => item.tag === tag) : allDocs;
    const total = docs.length;

    const questions = await loadQuestions();
    const submissions = docs.map((s) => {
      const savedMatches = Array.isArray(s.similarQuestions) ? s.similarQuestions : [];
      const similarQuestions = savedMatches.length >= 6
        ? savedMatches.slice(0, 6)
        : fillSimilarQuestions(savedMatches, s.text, s.tag, questions);

      return {
        id:               s.id || String(s._id),
        text:             s.text,
        tag:              s.tag,
        userName:         s.userName || "Anonymous",
        similarQuestions,
        createdAt:        s.createdAt,
      };
    });

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
      const deleted = await deleteSubmittedQuestion(id);
      if (!deleted) {
        sendJson(response, 404, { error: "Submission not found." });
        return;
      }
      sendJson(response, 200, { success: true });
    } catch (err) {
      sendJson(response, 500, { error: err.message || "Failed to delete submission." });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/questions/list") {
    const page  = Math.max(0, parseInt(url.searchParams.get("page")  || "0", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const tag   = url.searchParams.get("tag") || null;

    const allDocs = await loadUserSubmissions();
    const filteredDocs = tag ? allDocs.filter((item) => item.tag === tag) : allDocs;
    const total = filteredDocs.length;
    const docs = filteredDocs.slice(page * limit, page * limit + limit);

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
  try {
    await ensureDatabase();
  } catch (err) {
    console.error("PostgreSQL startup error:", err.message);
    process.exit(1);
  }

  server.listen(PORT, HOST, () => {
    console.log(`Question Finder backend running at http://${HOST}:${PORT}`);
    console.log(`   Using PostgreSQL table "${PG_TABLE_NAME}" for submissions.`);
    console.log(`   Using PostgreSQL table "${PG_QUESTIONS_TABLE}" for similarity search.`);
  });
}

startServer();

