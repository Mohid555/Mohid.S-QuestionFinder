/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Sparkles, Loader2, ArrowRight, BookOpen, AlertCircle, HelpCircle, Check, Compass, Award } from "lucide-react";
import { QuestionResponse } from "../types";
import { API_BASE_URL } from "../config/api";

interface QuestionBoxProps {
  onQuestionSubmitted: (newQuestion: QuestionResponse) => void;
  onResultChange?: (hasResult: boolean) => void;
}

// Map academic topics to specific theme colors
export const TOPIC_THEMES: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  "Biology": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-100", accent: "indigo" },
  "Chemistry": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-100", accent: "indigo" },
  "Physics": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100", accent: "amber" },
  "Mathematics": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-100", accent: "sky" },
  "Computer Science": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-100", accent: "indigo" },
  "History": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100", accent: "rose" },
  "Literature & Language": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-100", accent: "violet" },
  "Earth Science": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-100", accent: "orange" },
  "Geography": { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-100", accent: "cyan" },
  "General Science": { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-150", accent: "slate" },
  "Economics": { bg: "bg-lime-50", text: "text-lime-700", border: "border-lime-100", accent: "lime" },
  "Psychology": { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-100", accent: "pink" },
  "Political Science": { bg: "bg-red-50", text: "text-red-700", border: "border-red-100", accent: "red" },
  "Art & Music": { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-100", accent: "fuchsia" },
  "Philosophy & Ethics": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-100", accent: "purple" },
  "Environmental Science": { bg: "bg-green-50", text: "text-green-700", border: "border-green-100", accent: "green" },
  "Indian General Knowledge": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-100", accent: "orange" },
  "General Knowledge": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", accent: "blue" }
};

const SUGGESTED_IDEAS = [
  { text: "Why does photosynthesis require sunlight energy?", label: "Biology" },
  { text: "What is the key difference between ionic and covalent bonds?", label: "Chemistry" },
  { text: "Explain the fundamental theorem of calculus.", label: "Mathematics" },
  { text: "How do database indexes speed up query processing?", label: "CS" },
  { text: "What causes inflation in an economy?", label: "Economics" },
  { text: "What is the central theme of Shakespeare's Hamlet?", label: "Literature" },
  { text: "Who is known as the Father of the Nation in India?", label: "India GK" },
];

export default function QuestionBox({ onQuestionSubmitted, onResultChange }: QuestionBoxProps) {
  const [questionText, setQuestionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Storing the processed result from the backend
  const [result, setResult] = useState<QuestionResponse | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  // Pre-computed AI similarity data
  const [similarityData, setSimilarityData] = useState<{
    idMap: Record<string, string>;
    similarities: Record<string, { idx: number; score: number }[]>;
    topicCentroids: Record<string, number[]>;
    topicLabels: string[];
    aliases?: Record<string, string[]>;
  } | null>(null);
  const [allQuestions, setAllQuestions] = useState<any[]>([]);

  // Load similarity map and questions on mount
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const [simRes, dbRes] = await Promise.all([
          fetch("/similarity_map.json"),
          fetch("/db-store.json")
        ]);
        const simData = await simRes.json();
        const dbData = await dbRes.json();
        setSimilarityData(simData);
        if (Array.isArray(dbData.questions)) {
          setAllQuestions(dbData.questions);
        }
      } catch (err) {
        console.error("Could not load AI similarity data", err);
      }
    };
    loadData();
  }, []);

  // Rotation of academic messages for loading transparency
  const loaderMessages = [
    "Computing semantic embedding vector...",
    "Running cosine similarity against 10,000 question vectors...",
    "Identifying top semantic matches from dataset...",
    "Classifying topic using centroid embeddings...",
    "Registering question in knowledge base..."
  ];

  const handleIdeaClick = (idea: string) => {
    setQuestionText(idea);
    setError(null);
  };

  /**
   * AI Topic Classification — comprehensive keyword matching with 60+ terms per subject.
   */
  const classifyTopic = (text: string): string => {
    const lowercase = text.toLowerCase();
    const normalized = lowercase.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const indiaSignals = [
      "india", "indian", "bharat", "gandhi", "ghandhi", "gandhiji", "bapu",
      "nehru", "ambedkar", "netaji", "subhas chandra bose", "sardar patel",
      "father of nation", "father of the nation", "jana gana mana", "vande mataram",
      "lok sabha", "rajya sabha", "isro", "rbi", "tiranga", "bharat ratna"
    ];
    if (
      indiaSignals.some(signal => normalized.includes(signal)) ||
      Object.keys(similarityData?.aliases || {}).some(alias => normalized.includes(alias))
    ) {
      return "Indian General Knowledge";
    }
    // Extract individual words for accurate whole-word matching
    // (avoids false positives like "ion" matching inside "nation")
    const queryWordSet = new Set(
      lowercase.split(/[\s,.?!;:'"()\[\]{}\/\\]+/)
        .map(w => w.replace(/^-+|-+$/g, ''))
        .filter(w => w.length > 0)
    );
    const topicKeywords: Record<string, string[]> = {
      "Biology": [
        "cell", "cells", "plant", "plants", "animal", "animals", "dna", "rna", "photosynthesis",
        "organism", "organisms", "gene", "genes", "genetic", "genetics", "evolution", "bacteria",
        "virus", "viruses", "ecosystem", "species", "protein", "proteins", "enzyme", "enzymes",
        "blood", "heart", "lung", "lungs", "muscle", "muscles", "nerve", "nerves", "nervous",
        "chromosome", "chromosomes", "mitosis", "meiosis", "fungi", "fungus", "algae",
        "habitat", "predator", "prey", "respiration", "digest", "digestion", "digestive",
        "ecology", "biome", "reproduction", "heredity", "mutation", "natural selection",
        "food chain", "food web", "organ", "organs", "tissue", "tissues", "membrane",
        "skeleton", "skeletal", "bone", "bones", "skull", "spine", "rib", "joint", "joints",
        "brain", "neuron", "synapse", "immune", "antibody", "antigen", "vaccine",
        "mitochondria", "nucleus", "cytoplasm", "ribosome", "chloroplast", "organelle",
        "biotic", "abiotic", "symbiosis", "parasite", "host", "pollination", "seed",
        "embryo", "fetus", "pregnancy", "birth", "puberty", "hormone", "hormones",
        "insulin", "adrenaline", "thyroid", "pituitary", "endocrine", "exocrine",
        "artery", "vein", "capillary", "plasma", "platelet", "hemoglobin",
        "photosynthetic", "cellular", "biology", "biological", "living", "life",
        "extinct", "extinction", "fossil", "darwin", "adaptation", "trait", "traits",
        "dominant", "recessive", "allele", "genotype", "phenotype", "punnett",
        "taxonomy", "kingdom", "phylum", "class", "order", "family", "genus",
        "vertebrate", "invertebrate", "mammal", "reptile", "amphibian", "insect",
        "marine", "aquatic", "terrestrial", "carnivore", "herbivore", "omnivore"
      ],
      "Chemistry": [
        "reaction", "reactions", "molecule", "molecules", "molecular", "covalent", "ionic",
        "acid", "acids", "base", "bases", "element", "elements", "compound", "compounds",
        "periodic", "periodic table", "ion", "ions", "solution", "solutions", "chemical",
        "metal", "metals", "nonmetal", "oxygen", "carbon", "hydrogen", "nitrogen",
        "valence", "oxidation", "reduction", "redox", "mole", "moles", "isotope", "isotopes",
        "catalyst", "catalysis", "polymer", "polymers", "organic chemistry", "inorganic",
        "titration", "ph", "salt", "salts", "alkali", "alkaline", "bond", "bonds", "bonding",
        "electron shell", "atom", "atoms", "atomic", "proton", "neutron", "electron",
        "chemistry", "chemical equation", "stoichiometry", "molarity", "concentration",
        "precipitate", "solute", "solvent", "dissolve", "saturated", "unsaturated",
        "exothermic", "endothermic", "enthalpy", "entropy", "equilibrium",
        "noble gas", "halogen", "alkali metal", "transition metal",
        "combustion", "synthesis", "decomposition", "displacement",
        "electrolysis", "electrochemistry", "galvanic", "anode", "cathode",
        // Element names (all 30 most common)
        "sodium", "chlorine", "chloride", "potassium", "calcium", "magnesium",
        "iron", "copper", "zinc", "silver", "gold", "aluminum", "aluminium",
        "silicon", "phosphorus", "sulfur", "sulphur", "fluorine", "fluoride",
        "bromine", "bromide", "iodine", "iodide", "mercury", "lead", "tin",
        "chromium", "manganese", "cobalt", "nickel", "titanium", "platinum",
        "lithium", "barium", "strontium", "boron", "arsenic", "selenium",
        "helium", "neon", "argon", "krypton", "xenon", "radon",
        // Common compounds and ions
        "sodium chloride", "nacl", "water", "h2o", "ammonia", "methane",
        "ethanol", "alcohol", "glucose", "fructose", "sucrose", "lactose",
        "sulfuric acid", "hydrochloric acid", "nitric acid", "acetic acid",
        "vinegar", "baking soda", "sodium bicarbonate", "calcium carbonate",
        "hydroxide", "oxide", "sulfate", "sulphate", "nitrate", "nitrite",
        "carbonate", "bicarbonate", "phosphate", "chlorate", "acetate",
        "ammonium", "potassium chloride", "calcium chloride",
        "bleach", "rust", "corrosion", "alloy", "steel", "bronze", "brass",
        "petroleum", "alkane", "alkene", "alkyne", "benzene", "ethylene",
        "formaldehyde", "acetone", "ether", "ester", "ketone", "aldehyde",
        "soap", "detergent", "saponification", "fermentation", "distillation",
        "crystallization", "sublimation", "vaporization", "condensation",
        "mixture", "pure substance", "homogeneous", "heterogeneous",
        "solubility", "miscible", "immiscible", "emulsion", "suspension",
        "radioactive", "radioactivity", "half life", "nuclear fission", "nuclear fusion"
      ],
      "Physics": [
        "motion", "relativity", "gravity", "gravitational", "force", "forces", "energy",
        "velocity", "acceleration", "mass", "wave", "waves", "light", "electric", "electrical",
        "magnetic", "magnetism", "quantum", "nuclear", "heat", "thermal", "pressure",
        "current", "voltage", "resistance", "frequency", "momentum", "friction",
        "thermodynamics", "optics", "optical", "photon", "photons", "radiation",
        "sound", "inertia", "kinetic", "potential", "physics", "physical",
        "newton", "newtons", "joule", "watt", "ampere", "ohm", "hertz",
        "electromagnetic", "spectrum", "wavelength", "amplitude", "refraction",
        "reflection", "diffraction", "interference", "polarization",
        "circuit", "circuits", "capacitor", "inductor", "transformer",
        "speed", "distance", "displacement", "torque", "angular",
        "centripetal", "centrifugal", "orbit", "orbital", "satellite",
        "density", "buoyancy", "archimedes", "pascal", "bernoulli",
        "pendulum", "oscillation", "resonance", "harmonics",
        "fission", "fusion", "radioactive", "decay", "half-life",
        "einstein", "planck", "bohr", "schrodinger"
      ],
      "Mathematics": [
        "equation", "equations", "integral", "calculus", "derivative", "derivatives",
        "algebra", "algebraic", "geometry", "geometric", "solve", "calculate", "calculation",
        "fraction", "fractions", "angle", "angles", "triangle", "triangles", "circle",
        "graph", "graphs", "function", "functions", "matrix", "matrices",
        "probability", "theorem", "polynomial", "polynomials", "integer", "integers",
        "ratio", "ratios", "percentage", "variable", "variables", "coefficient",
        "quadratic", "logarithm", "logarithmic", "statistics", "statistical",
        "median", "mean", "average", "mode", "prime", "factorial",
        "proof", "proofs", "math", "mathematics", "mathematical",
        "arithmetic", "addition", "subtraction", "multiplication", "division",
        "exponent", "exponents", "power", "powers", "root", "roots", "sqrt",
        "sine", "cosine", "tangent", "trigonometry", "trigonometric",
        "pythagorean", "hypotenuse", "perimeter", "area", "volume",
        "circumference", "diameter", "radius", "pi", "infinity",
        "set", "sets", "union", "intersection", "subset",
        "linear", "nonlinear", "slope", "intercept", "parabola",
        "asymptote", "limit", "limits", "convergence", "divergence",
        "differential", "integration", "series", "sequence", "sequences",
        "permutation", "combination", "binomial", "normal distribution"
      ],
      "Computer Science": [
        "algorithm", "algorithms", "sort", "sorting", "database", "databases",
        "programming", "program", "programs", "computer", "computers", "computing",
        "software", "internet", "code", "coding", "data", "network", "networks",
        "binary", "hardware", "cpu", "processor", "memory", "ram", "storage",
        "encryption", "machine learning", "artificial intelligence", "ai", "ml",
        "recursion", "recursive", "loop", "loops", "array", "arrays",
        "server", "servers", "cloud", "api", "apis", "compiler", "compilers",
        "operating system", "os", "linux", "windows", "web", "website",
        "python", "java", "javascript", "html", "css", "sql",
        "boolean", "string", "integer", "float", "variable",
        "class", "object", "inheritance", "polymorphism", "encapsulation",
        "stack", "queue", "tree", "hash", "linked list",
        "complexity", "big o", "runtime", "optimization",
        "bug", "debug", "debugging", "testing", "test",
        "frontend", "backend", "fullstack", "framework",
        "cybersecurity", "firewall", "malware", "phishing",
        "blockchain", "cryptocurrency", "bitcoin",
        "robot", "robotics", "automation", "iot"
      ],
      "History": [
        "revolution", "revolutions", "war", "wars", "warfare", "battle", "battles",
        "history", "historical", "historian", "empire", "empires", "imperial",
        "king", "kings", "queen", "queens", "monarch", "monarchy", "royal",
        "century", "centuries", "ancient", "medieval", "modern", "era",
        "civilization", "civilizations", "treaty", "treaties", "peace",
        "democracy", "democratic", "colony", "colonies", "colonial", "colonialism",
        "independence", "freedom", "liberation", "dynasty", "dynasties",
        "pharaoh", "pharaohs", "egypt", "egyptian", "rome", "roman", "greek", "greece",
        "renaissance", "reformation", "enlightenment", "industrial revolution",
        "crusade", "crusades", "slavery", "abolition", "emancipation",
        "constitution", "constitutional", "parliament", "parliamentary",
        "republic", "republics", "election", "elections", "vote", "voting",
        "amendment", "congress", "senate", "president", "presidents",
        "world war", "wwi", "wwii", "cold war", "vietnam", "korea",
        "napoleon", "hitler", "churchill", "lincoln", "washington",
        "civil war", "rebellion", "revolt", "uprising", "protest",
        "feudal", "feudalism", "knight", "castle", "medieval",
        "silk road", "trade route", "exploration", "discovery",
        "declaration", "manifesto", "charter", "magna carta"
      ],
      "Earth Science": [
        "earth", "rock", "rocks", "mineral", "minerals", "volcano", "volcanoes", "volcanic",
        "earthquake", "earthquakes", "seismic", "ocean", "oceans", "oceanic",
        "atmosphere", "atmospheric", "climate", "weather", "meteorology",
        "soil", "soils", "fossil", "fossils", "paleontology",
        "plate", "plates", "tectonic", "tectonics", "continental drift",
        "erosion", "weathering", "deposition", "sediment", "sedimentary",
        "glacier", "glaciers", "glacial", "ice age",
        "canyon", "canyons", "tide", "tides", "tidal",
        "hurricane", "hurricanes", "tornado", "tornadoes", "cyclone",
        "tsunami", "tsunamis", "crust", "mantle", "core",
        "magma", "lava", "igneous", "metamorphic", "geologic",
        "geology", "geological", "geologist",
        "ozone", "greenhouse", "global warming", "climate change",
        "water cycle", "evaporation", "condensation", "precipitation",
        "aquifer", "groundwater", "watershed", "river basin",
        "fault", "faults", "fault line", "richter", "magnitude"
      ],
      "Geography": [
        "country", "countries", "continent", "continents", "mountain", "mountains",
        "river", "rivers", "capital", "capitals", "population", "demographic",
        "latitude", "longitude", "coordinate", "equator", "meridian",
        "peninsula", "peninsulas", "island", "islands", "archipelago",
        "border", "borders", "boundary", "boundaries",
        "region", "regions", "territory", "territories",
        "coast", "coastal", "coastline", "shore", "beach",
        "valley", "valleys", "plateau", "plateaus", "plain", "plains",
        "lake", "lakes", "gulf", "bay", "strait", "channel",
        "map", "maps", "cartography", "atlas", "globe",
        "nation", "nations", "state", "states", "province",
        "geography", "geographical", "geographer",
        "urban", "rural", "suburban", "city", "cities",
        "desert", "deserts", "savanna", "tundra", "taiga",
        "rainforest", "jungle", "forest", "woodland",
        "immigration", "emigration", "migration", "refugee",
        "gdp", "economy", "economic", "trade", "export", "import"
      ],
      "Economics": [
        "economy", "economic", "economics", "gdp", "inflation", "deflation",
        "supply", "demand", "market", "markets", "stock", "stocks", "bond", "bonds",
        "trade", "tariff", "tariffs", "import", "export", "fiscal", "monetary",
        "tax", "taxes", "taxation", "budget", "deficit", "surplus", "debt",
        "interest rate", "central bank", "federal reserve", "recession",
        "depression", "unemployment", "employment", "labor", "wage", "wages",
        "income", "wealth", "poverty", "inequality", "capitalism", "socialism",
        "communism", "profit", "loss", "revenue", "cost", "price", "pricing",
        "monopoly", "oligopoly", "competition", "subsidy", "subsidies",
        "entrepreneur", "entrepreneurship", "investment", "investor",
        "currency", "exchange rate", "forex", "banking", "bank", "loan",
        "mortgage", "credit", "debit", "asset", "liability", "equity",
        "dividend", "shareholder", "corporation", "microeconomics", "macroeconomics",
        "scarcity", "opportunity cost", "comparative advantage", "absolute advantage",
        "elasticity", "marginal", "utility", "consumer", "producer",
        "aggregate", "keynesian", "adam smith", "free market", "laissez faire"
      ],
      "Literature & Language": [
        "novel", "novels", "poem", "poems", "poetry", "poet", "poets",
        "author", "authors", "writer", "writers", "fiction", "nonfiction",
        "literature", "literary", "narrative", "narrator", "protagonist",
        "antagonist", "character", "characters", "plot", "theme", "themes",
        "metaphor", "simile", "allegory", "symbolism", "imagery",
        "shakespeare", "dickens", "twain", "austen", "hemingway", "orwell",
        "drama", "tragedy", "comedy", "sonnet", "stanza", "verse",
        "prose", "essay", "memoir", "biography", "autobiography",
        "grammar", "syntax", "vocabulary", "rhetoric", "linguistics",
        "language", "dialect", "phonetics", "morphology", "semantics",
        "genre", "genres", "fable", "myth", "mythology", "legend",
        "fairy tale", "short story", "novella", "epic", "saga",
        "irony", "satire", "parody", "hyperbole", "alliteration",
        "onomatopoeia", "personification", "oxymoron", "paradox",
        "clause", "sentence", "paragraph", "punctuation", "spelling",
        "adjective", "adverb", "noun", "verb", "preposition", "conjunction",
        "syllable", "prefix", "suffix", "root word", "etymology"
      ],
      "Psychology": [
        "psychology", "psychological", "psychologist", "behavior", "behaviour",
        "cognitive", "cognition", "perception", "memory", "learning",
        "emotion", "emotions", "emotional", "motivation", "personality",
        "consciousness", "unconscious", "subconscious", "dream", "dreams",
        "freud", "jung", "pavlov", "skinner", "piaget", "maslow",
        "therapy", "therapist", "counseling", "counselor", "psychiatry",
        "mental health", "mental illness", "disorder", "disorders",
        "anxiety", "depression", "phobia", "trauma", "ptsd", "stress",
        "intelligence", "iq", "aptitude", "temperament", "instinct",
        "conditioning", "reinforcement", "punishment", "stimulus", "response",
        "neuroscience", "neurology", "cortex", "hippocampus", "amygdala",
        "attachment", "development", "developmental", "adolescence",
        "social psychology", "conformity", "obedience", "prejudice", "stereotype",
        "self-esteem", "identity", "ego", "superego", "id",
        "psychoanalysis", "behaviorism", "humanism", "gestalt"
      ],
      "Political Science": [
        "government", "governance", "political", "politics", "policy", "policies",
        "legislation", "legislature", "law", "laws", "legal", "judicial",
        "diplomacy", "diplomat", "diplomatic", "ambassador", "embassy",
        "sovereignty", "sovereign", "federal", "federalism", "confederation",
        "autocracy", "dictatorship", "dictator", "totalitarian", "authoritarian",
        "liberal", "conservative", "progressive", "libertarian",
        "ideology", "ideological", "propaganda", "censorship",
        "constitution", "bill of rights", "civil rights", "human rights",
        "suffrage", "franchise", "referendum", "plebiscite", "ballot",
        "campaign", "candidate", "incumbent", "opposition", "coalition",
        "united nations", "nato", "european union", "treaty", "sanctions",
        "geopolitics", "geopolitical", "hegemony", "imperialism",
        "nationalism", "patriotism", "populism", "fascism",
        "bureaucracy", "cabinet", "minister", "prime minister", "chancellor",
        "supreme court", "judiciary", "executive", "legislative"
      ],
      "Art & Music": [
        "art", "arts", "artist", "artists", "artistic", "artwork",
        "painting", "paintings", "painter", "portrait", "landscape",
        "sculpture", "sculptor", "statue", "carving", "ceramic",
        "music", "musical", "musician", "musicians", "composer", "composers",
        "symphony", "orchestra", "concerto", "sonata", "opera",
        "melody", "harmony", "rhythm", "tempo", "pitch", "tone",
        "instrument", "instruments", "piano", "violin", "guitar", "drum",
        "flute", "trumpet", "cello", "saxophone", "clarinet",
        "gallery", "museum", "exhibition", "collection", "curator",
        "renaissance art", "baroque", "impressionism", "expressionism",
        "cubism", "surrealism", "abstract", "realism", "romanticism",
        "canvas", "palette", "brush", "sketch", "drawing", "illustration",
        "architecture", "architect", "design", "aesthetic", "aesthetics",
        "photography", "photograph", "photographer", "film", "cinema",
        "theater", "theatre", "performance", "dance", "ballet",
        "beethoven", "mozart", "bach", "chopin", "vivaldi",
        "da vinci", "michelangelo", "picasso", "van gogh", "monet", "rembrandt"
      ],
      "Philosophy & Ethics": [
        "philosophy", "philosophical", "philosopher", "philosophers",
        "ethics", "ethical", "moral", "morality", "morals", "virtue", "virtues",
        "logic", "logical", "reasoning", "argument", "fallacy", "fallacies",
        "epistemology", "ontology", "metaphysics", "metaphysical",
        "existentialism", "existential", "nihilism", "nihilist",
        "aristotle", "plato", "socrates", "kant", "nietzsche", "descartes",
        "hegel", "locke", "rousseau", "hobbes", "confucius", "buddha",
        "utilitarianism", "deontology", "consequentialism",
        "justice", "fairness", "equality", "liberty", "freedom",
        "truth", "knowledge", "wisdom", "belief", "faith", "doubt",
        "consciousness", "free will", "determinism", "dualism",
        "empiricism", "rationalism", "pragmatism", "idealism",
        "stoicism", "skepticism", "relativism", "absolutism",
        "dilemma", "paradox", "thought experiment", "trolley problem",
        "categorical imperative", "social contract", "natural law",
        "aesthetics", "beauty", "sublime", "meaning of life", "purpose"
      ],
      "Environmental Science": [
        "environment", "environmental", "ecology", "ecological",
        "pollution", "pollutant", "pollutants", "contamination",
        "sustainability", "sustainable", "renewable", "nonrenewable",
        "biodiversity", "conservation", "preservation", "endangered",
        "carbon", "carbon dioxide", "co2", "carbon footprint", "emissions",
        "greenhouse gas", "greenhouse effect", "global warming", "climate change",
        "deforestation", "reforestation", "afforestation",
        "recycling", "recycle", "waste", "landfill", "composting",
        "solar energy", "wind energy", "hydropower", "geothermal",
        "fossil fuel", "fossil fuels", "coal", "petroleum", "natural gas",
        "ozone layer", "ozone depletion", "acid rain", "smog",
        "water pollution", "air pollution", "soil pollution",
        "ecosystem services", "habitat loss", "habitat destruction",
        "wildlife", "species", "extinction", "threatened",
        "organic farming", "pesticide", "pesticides", "herbicide",
        "aquifer", "watershed", "wetland", "coral reef", "mangrove",
        "carbon neutral", "net zero", "paris agreement", "kyoto protocol",
        "environmental impact", "ecological footprint", "earth day"
      ],
    };

    // ── TIER 1: Short-alias / abbreviation lookup ──────────────────────────────
    // Instantly resolves the most common partial/abbreviated words to a subject.
    const shortAliasMap: Record<string, string> = {
      // Biology
      "photo": "Biology", "chloro": "Biology",
      "bio": "Biology", "cell": "Biology", "cells": "Biology",
      "gene": "Biology", "genes": "Biology", "dna": "Biology", "rna": "Biology",
      "sperm": "Biology", "ovum": "Biology", "ovary": "Biology", "uterus": "Biology",
      "repro": "Biology", "fetus": "Biology", "embryo": "Biology",
      "mito": "Biology", "meiosis": "Biology", "mitosis": "Biology",
      "organ": "Biology", "organs": "Biology", "blood": "Biology",
      "lung": "Biology", "lungs": "Biology",
      "virus": "Biology", "viral": "Biology", "bact": "Biology",
      "evol": "Biology", "darwin": "Biology", "nerve": "Biology",
      "neuro": "Biology", "brain": "Biology", "digest": "Biology",
      "respir": "Biology", "immun": "Biology", "hormone": "Biology",
      "insulin": "Biology", "thyroid": "Biology",
      "mammal": "Biology", "reptile": "Biology", "amphibian": "Biology",
      "ecosystem": "Biology",
      // Chemistry — element names, compounds, ions
      "chem": "Chemistry", "atom": "Chemistry", "atoms": "Chemistry",
      "molecule": "Chemistry", "electron": "Chemistry", "proton": "Chemistry",
      "acid": "Chemistry", "base": "Chemistry",
      "react": "Chemistry", "bond": "Chemistry", "ionic": "Chemistry",
      "covalent": "Chemistry", "oxid": "Chemistry", "redox": "Chemistry",
      "periodic": "Chemistry", "element": "Chemistry", "compound": "Chemistry",
      "catalyst": "Chemistry", "polymer": "Chemistry", "titrat": "Chemistry",
      "electrolys": "Chemistry",
      // Element names — every common one
      "sodium": "Chemistry", "chlorine": "Chemistry", "chloride": "Chemistry",
      "potassium": "Chemistry", "calcium": "Chemistry", "magnesium": "Chemistry",
      "iron": "Chemistry", "copper": "Chemistry", "zinc": "Chemistry",
      "silver": "Chemistry", "gold": "Chemistry", "aluminum": "Chemistry",
      "aluminium": "Chemistry", "silicon": "Chemistry", "phosphorus": "Chemistry",
      "sulfur": "Chemistry", "sulphur": "Chemistry", "fluorine": "Chemistry",
      "fluoride": "Chemistry", "bromine": "Chemistry", "bromide": "Chemistry",
      "iodine": "Chemistry", "iodide": "Chemistry", "mercury": "Chemistry",
      "lead": "Chemistry", "tin": "Chemistry", "chromium": "Chemistry",
      "manganese": "Chemistry", "cobalt": "Chemistry", "nickel": "Chemistry",
      "titanium": "Chemistry", "platinum": "Chemistry", "lithium": "Chemistry",
      "barium": "Chemistry", "strontium": "Chemistry", "boron": "Chemistry",
      "arsenic": "Chemistry", "helium": "Chemistry", "neon": "Chemistry",
      "argon": "Chemistry", "krypton": "Chemistry", "xenon": "Chemistry",
      // Common compounds and ion names
      "nacl": "Chemistry", "ammonia": "Chemistry", "methane": "Chemistry",
      "ethanol": "Chemistry", "alcohol": "Chemistry", "glucose": "Chemistry",
      "sucrose": "Chemistry", "lactose": "Chemistry", "fructose": "Chemistry",
      "hydroxide": "Chemistry", "oxide": "Chemistry", "sulfate": "Chemistry",
      "sulphate": "Chemistry", "nitrate": "Chemistry", "nitrite": "Chemistry",
      "carbonate": "Chemistry", "bicarbonate": "Chemistry", "phosphate": "Chemistry",
      "chlorate": "Chemistry", "acetate": "Chemistry", "ammonium": "Chemistry",
      "bleach": "Chemistry", "rust": "Chemistry", "corrosion": "Chemistry",
      "alloy": "Chemistry", "steel": "Chemistry", "bronze": "Chemistry",
      "benzene": "Chemistry", "acetone": "Chemistry", "ketone": "Chemistry",
      "alkane": "Chemistry", "alkene": "Chemistry", "ester": "Chemistry",
      "saponification": "Chemistry", "fermentation": "Chemistry",
      "distillation": "Chemistry", "sublimation": "Chemistry",
      "solubility": "Chemistry", "miscible": "Chemistry", "emulsion": "Chemistry",
      // Physics
      "phys": "Physics", "force": "Physics", "motion": "Physics",
      "grav": "Physics", "wave": "Physics",
      "optic": "Physics", "quantum": "Physics",
      "electric": "Physics", "magnet": "Physics", "thermo": "Physics",
      "nuclear": "Physics", "newton": "Physics", "velocity": "Physics",
      "accel": "Physics", "friction": "Physics", "momentum": "Physics",
      "circuit": "Physics", "voltage": "Physics",
      "photon": "Physics", "radiat": "Physics",
      // Mathematics
      "math": "Mathematics", "algebra": "Mathematics", "calcul": "Mathematics",
      "geomet": "Mathematics", "trig": "Mathematics",
      "statist": "Mathematics", "matrix": "Mathematics",
      "deriv": "Mathematics", "equat": "Mathematics", "fract": "Mathematics",
      "prime": "Mathematics", "theorem": "Mathematics",
      "pythagor": "Mathematics", "polynomia": "Mathematics",
      // Computer Science
      "algo": "Computer Science", "code": "Computer Science",
      "program": "Computer Science", "software": "Computer Science",
      "cyber": "Computer Science", "binary": "Computer Science",
      "encrypt": "Computer Science", "python": "Computer Science",
      "java": "Computer Science", "sql": "Computer Science",
      // History
      "hist": "History", "battle": "History",
      "empire": "History", "revolution": "History", "ancient": "History",
      "dynasty": "History", "napoleon": "History",
      // Geography
      "continent": "Geography", "capital": "Geography",
      "mountain": "Geography", "latitude": "Geography", "longitude": "Geography",
      // Economics
      "econ": "Economics", "gdp": "Economics", "inflation": "Economics",
      "invest": "Economics", "supply": "Economics", "demand": "Economics",
      // Psychology
      "psych": "Psychology", "mental": "Psychology", "behav": "Psychology",
      "cognit": "Psychology", "anxiety": "Psychology",
      "freud": "Psychology", "trauma": "Psychology", "therapy": "Psychology",
      // Political Science
      "polit": "Political Science", "govern": "Political Science",
      "democr": "Political Science", "constitut": "Political Science",
      // Earth Science
      "geolog": "Earth Science", "volcano": "Earth Science",
      "seismic": "Earth Science", "tectonic": "Earth Science",
      "atmosphere": "Earth Science", "glacier": "Earth Science",
      // Environmental Science
      "environ": "Environmental Science", "pollut": "Environmental Science",
      "sustain": "Environmental Science", "recycl": "Environmental Science",
      "biodiver": "Environmental Science", "conserv": "Environmental Science",
      "deforest": "Environmental Science", "emission": "Environmental Science",
      // Art & Music
      "photog": "Art & Music", "paint": "Art & Music", "sculpt": "Art & Music",
      "symphony": "Art & Music", "beethov": "Art & Music", "mozart": "Art & Music",
      "picasso": "Art & Music", "cinema": "Art & Music",
      // Philosophy & Ethics
      "philos": "Philosophy & Ethics", "ethic": "Philosophy & Ethics",
      "moral": "Philosophy & Ethics", "aristotle": "Philosophy & Ethics",
      "plato": "Philosophy & Ethics", "socrates": "Philosophy & Ethics",
    };

    const queryWords = Array.from(queryWordSet);

    // Check each query word against the alias table (exact key OR query word is a prefix of alias key OR alias key is a prefix of query word)
    for (const qw of queryWords) {
      if (shortAliasMap[qw]) return shortAliasMap[qw];
      for (const alias of Object.keys(shortAliasMap)) {
        if (alias.length >= 4 && qw.startsWith(alias)) return shortAliasMap[alias];
        if (qw.length >= 4 && alias.startsWith(qw)) return shortAliasMap[alias];
      }
    }

    // ── TIER 2 & 3: Full keyword scoring (exact word + prefix stem + multi-word phrase) ──
    let bestTopic: string | null = null;
    let bestScore = 0;
    let longestMatchLen = 0;
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      let matchCount = 0;
      let maxKeyLen = 0;
      for (const kw of keywords) {
        let matched = false;
        if (kw.includes(' ')) {
          if (lowercase.includes(kw)) matched = true;
        } else {
          if (queryWordSet.has(kw)) {
            matched = true;
          } else {
            // Prefix/stem: query word starts keyword or keyword starts query word (min 4 chars each)
            for (const qw of queryWords) {
              if (qw.length >= 4 && kw.startsWith(qw)) { matched = true; break; }
              if (kw.length >= 4 && qw.startsWith(kw)) { matched = true; break; }
            }
          }
        }
        if (matched) {
          matchCount++;
          if (kw.length > maxKeyLen) maxKeyLen = kw.length;
        }
      }
      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestTopic = topic;
        longestMatchLen = maxKeyLen;
      }
    }

    // Confidence gate: 2+ matches, OR 1 match with a 5-char+ specific term
    if (bestScore >= 2) return bestTopic;
    if (bestScore === 1 && longestMatchLen >= 5) return bestTopic;
    return "General Knowledge";
  };


  /**
   * Find semantically similar questions using pre-computed embedding similarities.
   * Strategy: classify topic first → search within same-topic questions → 
   * find best keyword match → pull its pre-computed semantic neighbors.
   */
  const findSemanticMatches = (text: string, topic: string): { id: string; text: string; tag: string; userName: string; createdAt: string; similarity: number }[] => {
    if (!similarityData || allQuestions.length === 0) return [];

    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const normalizedQuery = normalize(text);
    const aliasTerms: string[] = [];
    const aliases = (similarityData.aliases || {}) as Record<string, string[]>;
    for (const [alias, expansions] of Object.entries(aliases)) {
      if (normalizedQuery.includes(alias)) aliasTerms.push(...expansions);
    }
    const queryWords = `${normalizedQuery} ${aliasTerms.join(" ")}`
      .split(/\s+/)
      .filter(w => w.length > 2);
    const stopWords = new Set([
      "the", "and", "for", "are", "but", "not", "you", "all", "can", "has", "her",
      "was", "one", "our", "out", "how", "does", "what", "when", "where", "which",
      "who", "why", "this", "that", "with", "from", "they", "been", "have", "many",
      "some", "them", "than", "its", "into", "could", "would", "about", "there",
      "their", "will", "also", "more", "most", "very", "just", "only", "each",
      "other", "such", "like", "then", "make", "made", "over", "much", "well",
      "back", "even", "give", "after", "year", "years", "take", "come", "these",
      "know", "see", "way", "look", "first", "new", "now", "find", "here",
      "thing", "things", "being", "between", "need", "system", "systems",
      "called", "used", "using", "use", "part", "parts", "type", "types",
      "following", "example", "different", "same", "another", "form", "forms"
    ]);
    const queryTerms = queryWords.filter(w => !stopWords.has(w));

    if (queryTerms.length === 0) return [];

    // STEP 1: Filter candidates to same topic first for relevance
    const sameTopicIndices: number[] = [];
    const otherIndices: number[] = [];
    for (let i = 0; i < allQuestions.length; i++) {
      if (allQuestions[i].tag === topic) {
        sameTopicIndices.push(i);
      } else {
        otherIndices.push(i);
      }
    }

    // STEP 2: Score candidates — search same-topic first, fallback to all
    const scoreCandidates = (indices: number[]): { idx: number; score: number }[] => {
      const scored: { idx: number; score: number }[] = [];
      for (const i of indices) {
        const qText = normalize(allQuestions[i].searchText || allQuestions[i].text);
        const qWords = qText.split(/\s+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
        const qWordSet = new Set(qWords);
        let matchScore = 0;

        for (const term of queryTerms) {
          // Exact word match — higher weight for longer words (more specific)
          if (qWordSet.has(term)) {
            matchScore += 1 + (term.length > 5 ? 0.5 : 0);
          }
          // Stem/substring match — only for words 4+ chars to avoid false positives
          if (term.length >= 4) {
            for (const qw of qWords) {
              if (qw !== term && (qw.startsWith(term.slice(0, -1)) || term.startsWith(qw.slice(0, -1)))) {
                matchScore += 0.5;
                break;
              }
            }
          }
        }

        if (normalizedQuery.length >= 5 && qText.includes(normalizedQuery)) {
          matchScore += 2.5;
        }
        const normalizedScore = queryTerms.length > 0 ? matchScore / queryTerms.length : 0;
        const topicBonus = allQuestions[i].tag === topic ? 0.12 : 0;
        if (normalizedScore > 0.1) {
          scored.push({ idx: i, score: normalizedScore + topicBonus });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored;
    };

    let topCandidates = scoreCandidates([...sameTopicIndices, ...otherIndices]);

    // Never reject a query. If overlap is weak, show questions from the
    // classified topic and favor Indian GK for broad general queries.
    if (topCandidates.length === 0) {
      topCandidates = allQuestions
        .map((question, index) => ({ question, index }))
        .filter(({ question }) =>
          question.tag === topic ||
          (topic === "General Knowledge" && question.tag === "Indian General Knowledge")
        )
        .slice(0, 6)
        .map(({ index }) => ({ idx: index, score: 0.2 }));
    }

    if (topCandidates.length === 0) return [];

    // STEP 3: Take the best match and pull its pre-computed semantic neighbors
    const bestMatch = topCandidates[0];
    const neighbors = similarityData.similarities[String(bestMatch.idx)];

    const results: { id: string; text: string; tag: string; userName: string; createdAt: string; similarity: number }[] = [];
    
    // Include the best keyword match
    const bestQ = allQuestions[bestMatch.idx];
    if (bestQ) {
      results.push({
        id: bestQ.id,
        text: bestQ.text,
        tag: bestQ.tag,
        userName: bestQ.userName || "Academia AI",
        createdAt: bestQ.createdAt,
        similarity: Math.min(0.96, 0.55 + bestMatch.score * 0.35)
      });
    }

    // Add pre-computed semantic neighbors (from real cosine similarity)
    for (const neighbor of neighbors || []) {
      const nq = allQuestions[neighbor.idx];
      if (nq && nq.text.toLowerCase() !== text.toLowerCase()) {
        results.push({
          id: nq.id,
          text: nq.text,
          tag: nq.tag,
          userName: nq.userName || "Academia AI",
          createdAt: nq.createdAt,
          similarity: neighbor.score
        });
      }
    }

    // Also add other top keyword matches from same topic
    for (let k = 1; k < Math.min(8, topCandidates.length); k++) {
      const cq = allQuestions[topCandidates[k].idx];
      if (cq && !results.find(r => r.id === cq.id)) {
        results.push({
          id: cq.id,
          text: cq.text,
          tag: cq.tag,
          userName: cq.userName || "Academia AI",
          createdAt: cq.createdAt,
          similarity: Math.min(0.90, 0.42 + topCandidates[k].score * 0.32)
        });
      }
    }

    // Deduplicate and sort by similarity
    const seen = new Set<string>();
    const unique = results.filter(r => {
      const key = r.text.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return key !== text.toLowerCase().trim();
    });

    unique.sort((a, b) => b.similarity - a.similarity);
    return unique.slice(0, 6);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (questionText.trim().length < 8) {
      setError("Please write a longer, complete study question (minimum 8 characters).");
      return;
    }

    setError(null);
    setLoading(true);
    setResult(null);
    setLoadingStep(0);
    onResultChange?.(false);

    // Increment loading step at regular intervals for micro-interaction feedback
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < loaderMessages.length - 1 ? prev + 1 : prev));
    }, 800);

    try {
      // Simulate AI processing time (the real computation was done offline)
      await new Promise((r) => setTimeout(r, 1500));

      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/api/questions/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: questionText.trim(), userName: "Sir" }),
        });
      } catch {
        throw new Error("Backend is not running. Open another terminal and run: npm run server");
      }
      const apiResult = await response.json();

      if (!response.ok) {
        throw new Error(apiResult.error || "Backend could not process this question.");
      }

      setResult(apiResult);
      onResultChange?.(true);
      onQuestionSubmitted({ ...apiResult, similarQuestions: apiResult.similarQuestions || [] });
      setQuestionText("");
    } catch (err: any) {
      setError(err.message || "Unable to process question. Make sure the backend is running with npm run server.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Search Submission Panel */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-md shadow-slate-50 relative overflow-hidden">
        
        {/* Background gradient border effect */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 through-indigo-600 via-violet-600 to-amber-400"></div>

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 tracking-tight">Ask a Question</h3>
              <p className="text-xs text-slate-400">Our semantic classification engine will auto-tag and match with prior student data.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-bold uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>System Online</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl text-red-700 text-sm font-medium flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <textarea
              value={questionText}
              onChange={(e) => {
                setQuestionText(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="e.g. How does photosynthesis work in plants and what role does sunlight have?"
              disabled={loading}
              rows={4}
              className="w-full bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-150 hover:border-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100/50 p-4 rounded-2xl text-sm transition-all outline-none resize-none placeholder:text-slate-400 font-medium"
            />
            <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100 select-none">
              {questionText.length} chars
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Suggested prompts list */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full sm:max-w-[70%]">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0">Ideas:</span>
              <div className="flex gap-1.5 pl-1">
                {SUGGESTED_IDEAS.map((idea, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleIdeaClick(idea.text)}
                    disabled={loading}
                    className="text-xs bg-slate-100 hover:bg-slate-200 active:bg-indigo-50 active:text-indigo-700 text-slate-600 px-3 py-1.5 rounded-full transition-all cursor-pointer truncate max-w-[160px] font-medium"
                    title={idea.text}
                  >
                    {idea.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || questionText.trim().length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-100 flex-shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <span>Submit Question</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Dynamic loading screen */}
        {loading && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-30 flex flex-col items-center justify-center p-8 animate-fade-in">
            <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl mb-4 relative">
              <Loader2 className="w-8 h-8 animate-spin" />
              <div className="absolute inset-0 bg-indigo-100/30 rounded-3xl animate-ping opacity-40"></div>
            </div>
            <h4 className="text-base font-bold text-slate-800 tracking-tight">AI Assessment in Progress</h4>
            <p className="text-xs text-slate-400 font-mono mt-1.5 tracking-tight animate-pulse text-center">
              {loaderMessages[loadingStep]}
            </p>
            <div className="w-48 bg-slate-100 h-1 rounded-full overflow-hidden mt-5">
              <div 
                className="bg-indigo-650 h-full rounded-full transition-all duration-1000"
                style={{ width: `${((loadingStep + 1) / loaderMessages.length) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

      </div>

      {/* Processed Results Page (Shows ONLY when a question has been analyzed) */}
      {result && (
        <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 sm:p-8 border border-slate-800/65 shadow-xl shadow-slate-950/20 animate-fade-in relative overflow-hidden">
          
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl -mr-20 -mt-20"></div>

          {/* Result Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6 relative z-10">
            <div>
              <div className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider uppercase font-semibold ${result.tag === "Not in trained syllabus" ? "bg-amber-500/10 text-amber-300 border-amber-500/25" : "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"}`}>
                {result.tag === "Not in trained syllabus" ? <AlertCircle className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                <span>{result.tag === "Not in trained syllabus" ? "Topic Not Recognized" : "Question Categorized"}</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-400 mt-2">Analyzed Inquiry</h4>
              <p className="text-base font-bold text-white mt-1 leading-relaxed italic">
                “{result.text}”
              </p>
            </div>

            <div className="flex-shrink-0 self-start sm:self-center">
              <div className={`px-4 py-2 rounded-2xl border text-sm font-bold tracking-tight inline-flex items-center gap-2 ${
                TOPIC_THEMES[result.tag] ? `${TOPIC_THEMES[result.tag].bg} ${TOPIC_THEMES[result.tag].text} ${TOPIC_THEMES[result.tag].border}` : "bg-indigo-950 text-indigo-300 border-indigo-900/50"
              }`}>
                <Compass className="w-4 h-4" />
                <span>{result.tag}</span>
              </div>
            </div>
          </div>

          {/* Semantic Similarity Section */}
          {result.tag === "Not in trained syllabus" ? (
            <div className="relative z-10">
              <div className="p-8 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-4">
                  <AlertCircle className="w-7 h-7 text-amber-400" />
                </div>
                <h5 className="text-lg font-bold text-white mb-2 tracking-tight">Not in the Trained Syllabus</h5>
                <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  This question doesn't match any of our trained academic subjects. Our system currently covers:
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-lg mx-auto">
                  {["Biology", "Chemistry", "Physics", "Mathematics", "Computer Science", "History", "Literature & Language", "Economics", "Psychology", "Earth Science", "Geography", "Political Science", "Art & Music", "Philosophy & Ethics", "Environmental Science"].map((subject) => (
                    <span key={subject} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50">
                      {subject}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-4 font-medium">
                  Try rephrasing your question with specific academic terminology for better results.
                </p>
              </div>
              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => { setResult(null); onResultChange?.(false); }}
                  className="text-xs bg-slate-850 hover:bg-slate-800 hover:text-white px-4 py-2 rounded-xl transition-all font-semibold border border-slate-805 cursor-pointer"
                >
                  Clear Screen & Ask Another
                </button>
              </div>
            </div>
          ) : (
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              <h5 className="text-xs font-bold uppercase tracking-wider">Semantic Match Finder results</h5>
            </div>

            {result.similarQuestions.length === 0 ? (
              <div className="p-6 bg-slate-800/40 border border-slate-800 rounded-2xl text-center">
                <p className="text-sm text-slate-400">
                  No semantic overlaps found in past question records. This is the first question of its kind stored under <strong className="text-white">{result.tag}</strong>!
                </p>
                <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-medium mt-3 border border-emerald-500/20">
                  <Award className="w-3.5 h-3.5" />
                  <span>Library database updated</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {result.similarQuestions.map((match) => {
                  const percent = Math.round(match.similarity * 100);
                  
                  // Color code similarity ratio
                  let colorClass = "from-emerald-500/20 to-emerald-600/5 text-emerald-300 border-emerald-500/30";
                  if (percent < 60) {
                    colorClass = "from-slate-700/50 to-slate-800/5 text-slate-300 border-slate-700";
                  } else if (percent < 85) {
                    colorClass = "from-amber-500/20 to-amber-600/5 text-amber-300 border-amber-500/30";
                  }

                  return (
                    <div 
                      key={match.id}
                      className={`p-4 bg-gradient-to-r rounded-2xl border flex flex-col justify-between gap-3 shadow-md transition-all ${colorClass}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="text-sm leading-relaxed text-slate-100 font-medium">
                          “{match.text}”
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="text-xs font-mono font-bold tracking-tight px-2 py-1 bg-black/35 rounded-lg border border-white/5 whitespace-nowrap">
                            {percent}% Match
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/5 pt-2.5 text-[11px] text-slate-400 font-normal">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-300">{match.userName}</span>
                          <span>•</span>
                          <span>{match.tag}</span>
                        </div>
                        <div>
                          {new Date(match.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => { setResult(null); onResultChange?.(false); }}
                className="text-xs bg-slate-850 hover:bg-slate-800 hover:text-white px-4 py-2 rounded-xl transition-all font-semibold border border-slate-805 cursor-pointer"
              >
                Clear Screen & Ask Another
              </button>
            </div>
          </div>
          )}

        </div>
      )}

    </div>
  );
}
