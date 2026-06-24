# ============================================================
#   COMPLETE ALL-IN-ONE DATASET PREPARATION  (v2 — EXPANDED)
#   - Loads 10,000 study questions from 13+ pretrained datasets
#   - 16 academic subjects with improved AI classifier
#   - Generates embeddings using all-MiniLM-L6-v2
#   - Saves everything to embeddings.npy + questions.json
#   - Updates db-store.json for the frontend
#   - Pre-computes similarity map with TOP_K=12
# ============================================================

# ── STEP 0: Install required libraries ───────────────────────
# Run this in terminal before running this script:
# pip install sentence-transformers datasets scikit-learn numpy pymongo python-dotenv

import json
import random
import uuid
import os
import re
import numpy as np
from collections import Counter
from datetime import datetime, timedelta
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from pymongo import MongoClient
from dotenv import load_dotenv

# Fix Windows console encoding for Unicode characters
import sys
import io
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Project paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Load environment variables from the repo root .env file.
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

# MongoDB Atlas Configuration
MONGODB_URI = os.getenv('MONGODB_URI', '')
MONGODB_DB = os.getenv('MONGODB_DB', 'questionfinder')
MONGODB_COLLECTION = os.getenv('MONGODB_COLLECTIONS', 'questions').split(',')[1] if ',' in os.getenv('MONGODB_COLLECTIONS', 'submissions,questions') else 'questions'
USE_MONGODB = MONGODB_URI and '<' not in MONGODB_URI  # Check if configured (not placeholder)

# Paths to generated data files.
PUBLIC_DIR = os.path.join(SCRIPT_DIR, "public")
os.makedirs(PUBLIC_DIR, exist_ok=True)
DB_STORE_PATH = os.path.join(PUBLIC_DIR, "db-store.json")
# Keep root copies for local backend fallback and existing scripts.
DB_STORE_ROOT_PATH = os.path.join(SCRIPT_DIR, "db-store.json")
EMBEDDINGS_PATH = os.path.join(SCRIPT_DIR, "embeddings.npy")
QUESTIONS_PATH = os.path.join(SCRIPT_DIR, "questions.json")
TOPICS_PATH = os.path.join(SCRIPT_DIR, "topics.json")

# Total questions to sample and number of similar neighbors to pre-compute
TARGET_TOTAL = 10000
TOP_K_SIMILAR = 12
MIN_PER_SUBJECT = 400   # Minimum questions per subject for balanced sampling
INDIA_GK_TOPIC = "Indian General Knowledge"

# Stable Indian GK facts used by the Python dataset pipeline. Each row stores:
# (question, answer, related clue/aliases). The answer and clue are written to
# searchText, so title-based queries such as "father of nation" and spelling
# variants such as "ghandhi" can find Gandhi questions without displaying the
# answer as part of the question.
INDIA_GK_FACTS = [
    ("Who is popularly known as the Father of the Nation in India?", "Mahatma Gandhi", "Mohandas Karamchand Gandhi Gandhiji Bapu father of nation ghandhi"),
    ("What was Mahatma Gandhi's full name?", "Mohandas Karamchand Gandhi", "Gandhiji Bapu ghandhi"),
    ("Where was Mahatma Gandhi born?", "Porbandar, Gujarat", "Gandhi birthplace"),
    ("On which date is Gandhi Jayanti observed?", "2 October", "Mahatma Gandhi birthday non violence"),
    ("Which movement did Mahatma Gandhi launch in 1942?", "Quit India Movement", "Bharat Chhodo Do or Die"),
    ("Which march did Gandhi lead against the British salt tax in 1930?", "Dandi March", "Salt March Salt Satyagraha"),
    ("Where did Gandhi begin his first satyagraha in India?", "Champaran, Bihar", "Champaran Satyagraha indigo farmers"),
    ("Who gave Mahatma Gandhi the title 'Mahatma'?", "Rabindranath Tagore", "Gandhi Gurudev title"),
    ("Who called Gandhi the Father of the Nation in a 1944 radio address?", "Subhas Chandra Bose", "Netaji father of our nation"),
    ("Who assassinated Mahatma Gandhi?", "Nathuram Godse", "Gandhi death 30 January 1948"),
    ("Who was the first Prime Minister of independent India?", "Jawaharlal Nehru", "Pandit Nehru Chacha Nehru"),
    ("Who was the first President of India?", "Dr. Rajendra Prasad", "Indian president"),
    ("Who is known as the Iron Man of India?", "Sardar Vallabhbhai Patel", "unification princely states Statue of Unity"),
    ("Who is known as the Missile Man of India?", "Dr. A. P. J. Abdul Kalam", "APJ Kalam scientist president"),
    ("Who is known as the Nightingale of India?", "Sarojini Naidu", "Bharat Kokila poet"),
    ("Who is known as the Grand Old Man of India?", "Dadabhai Naoroji", "drain theory"),
    ("Who founded the Indian National Congress?", "Allan Octavian Hume", "A O Hume INC 1885"),
    ("In which year was the Indian National Congress founded?", "1885", "INC Bombay A O Hume"),
    ("Who gave the slogan 'Swaraj is my birthright and I shall have it'?", "Bal Gangadhar Tilak", "Lokmanya Tilak"),
    ("Who gave the slogan 'Jai Hind'?", "Subhas Chandra Bose", "Netaji INA"),
    ("Who gave the slogan 'Jai Jawan Jai Kisan'?", "Lal Bahadur Shastri", "soldiers farmers"),
    ("Who wrote India's national anthem 'Jana Gana Mana'?", "Rabindranath Tagore", "Gurudev national anthem"),
    ("Who wrote India's national song 'Vande Mataram'?", "Bankim Chandra Chattopadhyay", "Anandamath national song"),
    ("Who designed the present national flag of India?", "Pingali Venkayya", "Tiranga tricolour"),
    ("What is the national emblem of India adapted from?", "Lion Capital of Ashoka at Sarnath", "Ashoka lions"),
    ("What is India's national motto?", "Satyameva Jayate", "Truth Alone Triumphs"),
    ("What is the national animal of India?", "Bengal tiger", "Royal Bengal Tiger"),
    ("What is the national bird of India?", "Indian peacock", "peafowl"),
    ("What is the national flower of India?", "Lotus", "national symbols"),
    ("What is the national tree of India?", "Indian banyan", "Ficus benghalensis"),
    ("What is the national aquatic animal of India?", "Ganges river dolphin", "Gangetic dolphin"),
    ("On which date did India become independent?", "15 August 1947", "Independence Day"),
    ("When did the Constitution of India come into effect?", "26 January 1950", "Republic Day"),
    ("When was the Constitution of India adopted?", "26 November 1949", "Constitution Day Samvidhan Divas"),
    ("Who chaired the Drafting Committee of the Indian Constitution?", "Dr. B. R. Ambedkar", "Babasaheb father of Indian constitution"),
    ("Which part of the Indian Constitution contains Fundamental Rights?", "Part III", "Articles 12 to 35"),
    ("Which part contains the Directive Principles of State Policy?", "Part IV", "DPSP Articles 36 to 51"),
    ("Which amendment added Fundamental Duties to the Constitution?", "42nd Amendment Act, 1976", "Part IVA Article 51A"),
    ("What is the lower house of India's Parliament called?", "Lok Sabha", "House of the People"),
    ("What is the upper house of India's Parliament called?", "Rajya Sabha", "Council of States"),
    ("What is the highest court in India?", "Supreme Court of India", "apex court judiciary"),
    ("What is the minimum voting age in India?", "18 years", "adult franchise 61st amendment"),
    ("Which body conducts national and state elections in India?", "Election Commission of India", "ECI Article 324"),
    ("What is the capital of India?", "New Delhi", "national capital"),
    ("Which is the largest Indian state by area?", "Rajasthan", "largest state"),
    ("Which is the smallest Indian state by area?", "Goa", "smallest state"),
    ("Which is the most populous Indian state according to the 2011 Census?", "Uttar Pradesh", "population census"),
    ("Which is the longest river entirely within India?", "Godavari", "Dakshin Ganga"),
    ("Which is the highest peak located entirely within India?", "Kangchenjunga", "Kanchenjunga Sikkim"),
    ("Which is the largest desert in India?", "Thar Desert", "Great Indian Desert Rajasthan"),
    ("Which is the largest freshwater lake in India?", "Wular Lake", "Jammu and Kashmir"),
    ("Which Indian state has the longest coastline?", "Gujarat", "Arabian Sea coast"),
    ("Which Indian city is called the Pink City?", "Jaipur", "Rajasthan"),
    ("Which Indian city is called the Silicon Valley of India?", "Bengaluru", "Bangalore IT hub"),
    ("Which Indian state is known as God's Own Country?", "Kerala", "tourism nickname"),
    ("Where is the Taj Mahal located?", "Agra, Uttar Pradesh", "Shah Jahan Mumtaz Mahal"),
    ("Who founded the Maurya Empire?", "Chandragupta Maurya", "Mauryan dynasty Chanakya"),
    ("Which Mauryan emperor embraced Buddhism after the Kalinga War?", "Ashoka", "Emperor Ashoka"),
    ("Who founded the Mughal Empire in India?", "Babur", "Panipat 1526"),
    ("Who was the last Mughal emperor?", "Bahadur Shah II", "Bahadur Shah Zafar 1857"),
    ("In which year did the Revolt of 1857 begin?", "1857", "First War of Independence Sepoy Mutiny"),
    ("Who was the Rani of Jhansi during the Revolt of 1857?", "Rani Lakshmibai", "Jhansi ki Rani"),
    ("In which year did the Jallianwala Bagh massacre occur?", "1919", "Amritsar General Dyer"),
    ("Who founded the Brahmo Samaj?", "Raja Ram Mohan Roy", "social reform"),
    ("Who founded the Arya Samaj?", "Swami Dayanand Saraswati", "Satyarth Prakash"),
    ("Who founded the Ramakrishna Mission?", "Swami Vivekananda", "Belur Math"),
    ("Who was the first Indian to win a Nobel Prize?", "Rabindranath Tagore", "Literature 1913 Gitanjali"),
    ("Who was the first Indian to travel into space?", "Rakesh Sharma", "Soyuz T-11 1984"),
    ("What was India's first satellite?", "Aryabhata", "ISRO 1975"),
    ("What was India's first mission to the Moon?", "Chandrayaan-1", "ISRO lunar mission"),
    ("What was India's first mission to Mars?", "Mars Orbiter Mission", "Mangalyaan ISRO"),
    ("What is the name of India's space agency?", "Indian Space Research Organisation", "ISRO"),
    ("Who is regarded as the father of the Indian space programme?", "Dr. Vikram Sarabhai", "ISRO scientist"),
    ("Who is known as the father of India's nuclear programme?", "Dr. Homi J. Bhabha", "atomic energy"),
    ("Who is known as the father of the Green Revolution in India?", "Dr. M. S. Swaminathan", "agriculture"),
    ("Who is known as the father of the White Revolution in India?", "Dr. Verghese Kurien", "Operation Flood Amul"),
    ("Where is the headquarters of the Reserve Bank of India?", "Mumbai", "RBI central bank"),
    ("In which year was the Reserve Bank of India established?", "1935", "RBI"),
    ("What is the currency of India?", "Indian rupee", "INR rupee symbol"),
    ("Who designed the Indian rupee symbol?", "D. Udaya Kumar", "INR sign"),
    ("What does GST stand for in India?", "Goods and Services Tax", "indirect tax"),
    ("Which classical dance form originated in Tamil Nadu?", "Bharatanatyam", "Indian classical dance"),
    ("Which classical dance form from Kerala uses elaborate makeup?", "Kathakali", "Indian classical dance"),
    ("Which festival is known as the Festival of Lights?", "Diwali", "Deepavali"),
    ("Which is the highest civilian award in India?", "Bharat Ratna", "civilian honour"),
    ("Which is India's highest wartime gallantry award?", "Param Vir Chakra", "military award"),
    ("Which sport is associated with the Ranji Trophy?", "Cricket", "first class cricket"),
    ("Who was the first Indian chess grandmaster?", "Viswanathan Anand", "Vishy chess"),
    ("Who was the first Indian to win an individual Olympic gold medal?", "Abhinav Bindra", "shooting Beijing 2008"),
]

INDIA_GK_ALIASES = {
    "father of nation": ["mahatma gandhi", "mohandas karamchand gandhi", "gandhiji", "bapu"],
    "father of the nation": ["mahatma gandhi", "mohandas karamchand gandhi", "gandhiji", "bapu"],
    "ghandhi": ["gandhi", "mahatma gandhi", "mohandas karamchand gandhi"],
    "gandhiji": ["gandhi", "mahatma gandhi", "mohandas karamchand gandhi", "bapu"],
    "bapu": ["gandhi", "mahatma gandhi", "mohandas karamchand gandhi"],
    "iron man of india": ["sardar vallabhbhai patel"],
    "missile man of india": ["apj abdul kalam", "a p j abdul kalam"],
    "nightingale of india": ["sarojini naidu", "bharat kokila"],
    "father of indian constitution": ["b r ambedkar", "babasaheb ambedkar"],
    "netaji": ["subhas chandra bose", "subhash chandra bose"],
}


# ============================================================
#   MongoDB Atlas Helper Functions
# ============================================================

def connect_to_mongodb():
    """Connect to MongoDB Atlas using credentials from .env file."""
    if not USE_MONGODB:
        print("⚠️  MongoDB Atlas not configured. Skipping MongoDB upload.")
        return None
    
    try:
        print("🔌 Connecting to MongoDB Atlas...")
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
        client.admin.command('ping')
        print("✅ Connected to MongoDB Atlas successfully!")
        return client
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB Atlas: {e}")
        print("   Check your MONGODB_URI in .env file and network connectivity.")
        return None


def save_questions_to_mongodb(questions):
    """Save questions to MongoDB Atlas."""
    if not USE_MONGODB:
        print("⚠️  MongoDB saving skipped (not configured).")
        return
    
    client = connect_to_mongodb()
    if not client:
        return
    
    try:
        db = client[MONGODB_DB]
        collection = db[MONGODB_COLLECTION]
        
        # Clear existing seed questions (keep user submissions)
        collection.delete_many({"source": {"$ne": "user-submission"}})
        
        # Prepare documents with required fields
        documents = []
        for q in questions:
            doc = {
                "id": q.get("id", f"seed-{uuid.uuid4()}"),
                "text": q.get("text"),
                "tag": q.get("tag"),
                "userName": "Question Finder",
                "createdAt": q.get("createdAt", datetime.utcnow().isoformat() + "Z"),
                "source": "seed-data",
                "searchText": q.get("searchText", q.get("text", "")),
                "similarQuestions": []
            }
            documents.append(doc)
        
        if documents:
            result = collection.insert_many(documents, ordered=False)
            print(f"✅ Saved {len(result.inserted_ids)} questions to MongoDB Atlas")
        
    except Exception as e:
        print(f"❌ Error saving to MongoDB: {e}")
    finally:
        client.close()


def build_india_gk_questions():
    """Create searchable India-GK records from verified, stable facts."""
    records = []
    for question, answer, clues in INDIA_GK_FACTS:
        records.append({
            "question": question,
            "topic": INDIA_GK_TOPIC,
            "answer": answer,
            "searchText": f"{question} {answer} {clues}".lower(),
            "source": "Curated India GK",
        })
    return records


def augment_existing_files_with_india_gk():
    """
    Add the curated India-GK records to existing frontend JSON artifacts.

    Usage:
        python modal.py --augment-india-gk

    This fast mode avoids downloading the external datasets again. A normal
    full run remains the preferred way to rebuild embeddings and all cosine
    neighbors from scratch.
    """
    if not os.path.exists(DB_STORE_ROOT_PATH):
        raise FileNotFoundError("db-store.json was not found; run the full pipeline first.")

    with open(DB_STORE_ROOT_PATH, "r", encoding="utf-8") as f:
        db_store = json.load(f)

    frontend_questions = db_store.setdefault("questions", [])
    existing_texts = {
        re.sub(r"\s+", " ", item.get("text", "").lower()).strip()
        for item in frontend_questions
    }
    generated = build_india_gk_questions()
    base_time = datetime.utcnow()
    added = 0

    for index, item in enumerate(generated):
        normalized = re.sub(r"\s+", " ", item["question"].lower()).strip()
        if normalized in existing_texts:
            continue
        frontend_questions.append({
            "id": f"india-gk-{index + 1:03d}",
            "userId": "system-ai-user",
            "userEmail": "system.edu@aistudio.com",
            "userName": "India GK Library",
            "text": item["question"],
            "tag": item["topic"],
            "searchText": item["searchText"],
            "answer": item["answer"],
            "source": item["source"],
            "embedding": [],
            "createdAt": base_time.isoformat() + "Z",
        })
        existing_texts.add(normalized)
        added += 1

    with open(DB_STORE_ROOT_PATH, "w", encoding="utf-8") as f:
        json.dump(db_store, f, ensure_ascii=False, indent=2)
    with open(DB_STORE_PATH, "w", encoding="utf-8") as f:
        json.dump(db_store, f, ensure_ascii=False, indent=2)

    if os.path.exists(QUESTIONS_PATH):
        with open(QUESTIONS_PATH, "r", encoding="utf-8") as f:
            questions = json.load(f)
        question_texts = {
            re.sub(r"\s+", " ", item.get("question", "").lower()).strip()
            for item in questions
        }
        questions.extend(
            item for item in generated
            if re.sub(r"\s+", " ", item["question"].lower()).strip() not in question_texts
        )
        with open(QUESTIONS_PATH, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)

    similarity_path = os.path.join(SCRIPT_DIR, "similarity_map.json")
    if os.path.exists(similarity_path):
        with open(similarity_path, "r", encoding="utf-8") as f:
            similarity_data = json.load(f)
        similarity_data["aliases"] = INDIA_GK_ALIASES
        id_map = similarity_data.setdefault("idMap", {})
        similarities = similarity_data.setdefault("similarities", {})
        for index, question in enumerate(frontend_questions):
            id_map[str(index)] = question["id"]
            similarities.setdefault(str(index), [])
        labels = similarity_data.setdefault("topicLabels", [])
        if INDIA_GK_TOPIC not in labels:
            labels.append(INDIA_GK_TOPIC)
        with open(similarity_path, "w", encoding="utf-8") as f:
            json.dump(similarity_data, f, ensure_ascii=False)
        public_similarity_path = os.path.join(PUBLIC_DIR, "similarity_map.json")
        with open(public_similarity_path, "w", encoding="utf-8") as f:
            json.dump(similarity_data, f, ensure_ascii=False)

    topics = []
    if os.path.exists(TOPICS_PATH):
        with open(TOPICS_PATH, "r", encoding="utf-8") as f:
            topics = json.load(f)
    if INDIA_GK_TOPIC not in topics:
        topics.append(INDIA_GK_TOPIC)
    with open(TOPICS_PATH, "w", encoding="utf-8") as f:
        json.dump(sorted(topics), f, ensure_ascii=False, indent=2)

    print(f"[OK] Added {added} Indian GK questions from modal.py")
    print("[OK] Updated db-store.json, questions.json, topics.json, and similarity aliases")


if "--augment-india-gk" in sys.argv:
    augment_existing_files_with_india_gk()
    raise SystemExit(0)


# ============================================================
#   STEP 1: COMPREHENSIVE SUBJECT DETECTOR (16 SUBJECTS)
#   150+ keywords per subject, weighted scoring, phrase
#   matching, and negative keywords to prevent misclassification
# ============================================================

# ── Master keyword dictionaries ──────────────────────────────
# Each subject has:
#   • "keywords": terms that strongly indicate the subject
#   • "phrases": multi-word phrases (matched as substrings)
#   • "negative": terms that should DISQUALIFY the match even
#                 if other keywords are present

SUBJECT_RULES = {
    "Biology": {
        "keywords": {
            "cell", "cells", "cellular", "plant", "plants", "animal", "animals",
            "dna", "rna", "photosynthesis", "photosynthetic", "organism", "organisms",
            "gene", "genes", "genetic", "genetics", "genome", "genomics",
            "evolution", "evolutionary", "bacteria", "bacterium", "bacterial",
            "virus", "viruses", "viral", "ecosystem", "ecosystems",
            "species", "speciation", "protein", "proteins", "enzyme", "enzymes",
            "blood", "heart", "lung", "lungs", "muscle", "muscles",
            "nerve", "nerves", "nervous", "neuron", "neurons", "synapse",
            "chromosome", "chromosomes", "mitosis", "meiosis", "cytokinesis",
            "fungi", "fungus", "fungal", "algae", "algal",
            "habitat", "habitats", "predator", "prey", "predation",
            "respiration", "respiratory", "digest", "digestion", "digestive",
            "ecology", "ecological", "ecologist", "biome", "biomes",
            "reproduction", "reproductive", "heredity", "hereditary",
            "mutation", "mutations", "mutant", "allele", "alleles",
            "genotype", "phenotype", "punnett", "mendel", "mendelian",
            "organ", "organs", "tissue", "tissues", "membrane", "membranes",
            "skeleton", "skeletal", "bone", "bones", "skull", "spine",
            "brain", "immune", "immunity", "antibody", "antibodies", "antigen",
            "vaccine", "vaccination", "immunization",
            "mitochondria", "mitochondrion", "nucleus", "nuclei",
            "cytoplasm", "ribosome", "ribosomes", "chloroplast", "chloroplasts",
            "organelle", "organelles", "endoplasmic", "golgi",
            "biotic", "abiotic", "symbiosis", "symbiotic", "mutualism",
            "parasite", "parasitic", "parasitism", "commensalism",
            "pollination", "pollinator", "seed", "seeds", "germination",
            "embryo", "fetus", "pregnancy", "puberty", "adolescence",
            "hormone", "hormones", "hormonal", "insulin", "adrenaline",
            "thyroid", "pituitary", "endocrine", "exocrine",
            "artery", "arteries", "vein", "veins", "capillary", "capillaries",
            "plasma", "platelet", "hemoglobin", "erythrocyte", "leukocyte",
            "taxonomy", "taxonomic", "kingdom", "phylum", "genus",
            "vertebrate", "vertebrates", "invertebrate", "invertebrates",
            "mammal", "mammals", "reptile", "reptiles", "amphibian", "amphibians",
            "insect", "insects", "arthropod", "arthropods",
            "marine", "aquatic", "terrestrial",
            "carnivore", "herbivore", "omnivore",
            "biology", "biological", "biologist", "biomedical",
            "darwin", "darwinian", "adaptation", "adaptations",
            "trait", "traits", "dominant", "recessive",
            "extinct", "extinction", "fossil", "fossils",
            "photoreceptor", "chlorophyll", "stomata", "xylem", "phloem",
            "osmosis", "diffusion", "homeostasis",
        },
        "phrases": [
            "natural selection", "food chain", "food web", "cell division",
            "cell membrane", "cell wall", "stem cell", "blood cell",
            "white blood cell", "red blood cell", "immune system",
            "nervous system", "digestive system", "circulatory system",
            "respiratory system", "endocrine system", "reproductive system",
            "amino acid", "nucleic acid", "double helix",
            "genetic engineering", "genetic code", "gene expression",
            "binary fission", "asexual reproduction", "sexual reproduction",
            "krebs cycle", "calvin cycle", "electron transport chain",
            "atp synthase", "active transport", "passive transport",
        ],
        "negative": set(),
    },
    "Physics": {
        "keywords": {
            "motion", "relativity", "gravity", "gravitational", "force", "forces",
            "velocity", "acceleration", "deceleration", "mass", "inertia",
            "wave", "waves", "wavelength", "amplitude",
            "electric", "electrical", "electricity",
            "magnetic", "magnetism", "electromagnetism", "electromagnetic",
            "quantum", "nuclear", "subatomic",
            "heat", "thermal", "thermodynamic", "thermodynamics",
            "pressure", "current", "voltage", "resistance", "resistor",
            "frequency", "hertz", "momentum", "impulse",
            "friction", "drag", "torque", "angular",
            "optics", "optical", "refraction", "reflection", "diffraction",
            "photon", "photons", "radiation", "radioactive", "radioactivity",
            "sound", "acoustic", "acoustics", "ultrasound",
            "kinetic", "potential",
            "newton", "joule", "watt", "ampere", "ohm", "coulomb", "tesla",
            "spectrum", "spectra", "spectroscopy",
            "interference", "polarization", "polarized",
            "circuit", "circuits", "capacitor", "capacitance",
            "inductor", "inductance", "transformer",
            "displacement", "projectile",
            "centripetal", "centrifugal", "orbit", "orbital", "satellite",
            "density", "buoyancy", "archimedes", "pascal", "bernoulli",
            "pendulum", "oscillation", "oscillations", "resonance", "harmonics",
            "fission", "fusion",
            "decay", "half-life",
            "einstein", "planck", "bohr", "schrodinger", "heisenberg",
            "mechanics", "kinematics", "dynamics", "statics",
            "physics", "physicist", "physical",
            "superconductor", "superconductivity",
            "laser", "fiber", "lens", "prism", "mirror",
            "doppler", "entropy",
            "proton", "neutron", "electron", "positron", "quark", "lepton",
            "gluon", "boson", "fermion", "hadron", "meson", "baryon",
            "antimatter", "annihilation",
        },
        "phrases": [
            "newton's law", "newton's laws", "law of motion", "laws of motion",
            "speed of light", "speed of sound",
            "electromagnetic spectrum", "electromagnetic wave",
            "electric field", "magnetic field", "gravitational field",
            "conservation of energy", "conservation of momentum",
            "first law of thermodynamics", "second law of thermodynamics",
            "ohm's law", "kirchhoff's law",
            "special relativity", "general relativity",
            "wave-particle duality", "uncertainty principle",
            "standard model", "particle physics", "nuclear physics",
            "string theory", "dark matter", "dark energy", "black hole",
            "big bang", "cosmic rays", "gamma rays",
        ],
        "negative": set(),
    },
    "Chemistry": {
        "keywords": {
            "reaction", "reactions", "reactant", "reactants", "reagent",
            "molecule", "molecules", "molecular",
            "covalent", "ionic",
            "acid", "acids", "acidic", "acidity",
            "base", "bases", "basic", "alkaline", "alkalinity",
            "element", "elements", "elemental",
            "compound", "compounds",
            "periodic", "ion", "ions", "ionization", "ionize",
            "solution", "solutions", "solubility", "soluble", "insoluble",
            "chemical", "chemicals",
            "metal", "metals", "metallic", "metalloid",
            "nonmetal", "nonmetals",
            "oxygen", "hydrogen", "nitrogen", "helium", "neon",
            "chlorine", "fluorine", "bromine", "iodine",
            "sodium", "potassium", "calcium", "magnesium", "iron",
            "copper", "zinc", "silver", "gold", "platinum",
            "valence", "oxidation", "reduction", "redox",
            "mole", "moles", "molar", "molarity",
            "isotope", "isotopes",
            "catalyst", "catalysis", "catalytic",
            "polymer", "polymers", "polymerization", "monomer",
            "organic", "inorganic", "organometallic",
            "titration", "titrate",
            "salt", "salts", "precipitate", "precipitation",
            "alkali", "alkalis",
            "bond", "bonds", "bonding",
            "atom", "atoms", "atomic", "subatomic",
            "chemistry", "chemist",
            "stoichiometry", "stoichiometric",
            "concentration", "dilution", "dilute",
            "solute", "solvent", "dissolve", "dissolution",
            "saturated", "unsaturated", "supersaturated",
            "exothermic", "endothermic",
            "enthalpy", "entropy", "equilibrium",
            "halogen", "halogens",
            "combustion", "synthesis", "decomposition",
            "electrolysis", "electrochemistry", "electrochemical",
            "galvanic", "voltaic", "anode", "cathode", "electrode",
            "ph", "litmus", "indicator", "buffer",
            "alloy", "alloys", "corrosion", "rusting",
            "distillation", "chromatography", "filtration", "evaporation",
            "crystallization", "sublimation",
            "hydrocarbon", "hydrocarbons", "alkane", "alkene", "alkyne",
            "ester", "ether", "aldehyde", "ketone", "alcohol",
            "carboxylic", "amine", "amide",
            "benzene", "aromatic",
        },
        "phrases": [
            "periodic table", "chemical equation", "chemical reaction",
            "chemical bond", "chemical formula", "electron shell",
            "noble gas", "noble gases", "alkali metal", "transition metal",
            "lewis structure", "electron configuration",
            "le chatelier", "avogadro's number", "boyle's law",
            "charles's law", "ideal gas law", "gas law",
            "acid-base", "strong acid", "weak acid", "ph scale",
            "rate of reaction", "activation energy",
            "molecular formula", "empirical formula", "structural formula",
        ],
        "negative": set(),
    },
    "Earth Science": {
        "keywords": {
            "rock", "rocks", "rocky", "mineral", "minerals", "mineralogy",
            "volcano", "volcanoes", "volcanic", "volcanism",
            "earthquake", "earthquakes", "seismic", "seismology", "seismograph",
            "ocean", "oceans", "oceanic", "oceanography",
            "atmosphere", "atmospheric", "stratosphere", "troposphere",
            "mesosphere", "thermosphere", "exosphere", "ionosphere",
            "climate", "climatic", "climatology",
            "weather", "meteorology", "meteorological", "meteorologist",
            "soil", "soils", "sediment", "sedimentary", "sedimentation",
            "tectonic", "tectonics",
            "erosion", "weathering", "deposition",
            "glacier", "glaciers", "glacial", "glaciation",
            "canyon", "canyons", "gorge",
            "tide", "tides", "tidal",
            "hurricane", "hurricanes", "typhoon", "typhoons",
            "tornado", "tornadoes", "cyclone", "cyclones",
            "tsunami", "tsunamis",
            "crust", "mantle", "magma", "lava",
            "igneous", "metamorphic", "sedimentary",
            "geology", "geological", "geologic", "geologist",
            "ozone", "greenhouse",
            "evaporation", "condensation", "precipitation",
            "aquifer", "groundwater", "watershed",
            "fault", "faults", "faulting",
            "richter", "magnitude",
            "stalactite", "stalagmite", "cavern", "cave",
            "stratum", "strata", "stratigraphy",
            "paleontology", "paleontologist",
            "geode", "crystal", "quartz", "feldspar", "mica",
            "granite", "basalt", "limestone", "sandstone", "shale", "marble",
            "obsidian", "pumice",
            "moraine", "fjord", "delta", "alluvial",
            "lithosphere", "hydrosphere", "biosphere", "geosphere",
            "pangaea", "supercontinent", "continental",
            "subduction", "rift", "trench", "ridge",
            "monsoon", "drought", "flood", "blizzard",
            "barometer", "anemometer", "hygrometer",
            "isobar", "isotherm", "front",
        },
        "phrases": [
            "plate tectonics", "continental drift", "tectonic plates",
            "ice age", "glacial period", "interglacial",
            "water cycle", "hydrological cycle", "rock cycle",
            "global warming", "climate change",
            "fault line", "san andreas", "ring of fire",
            "richter scale", "mercalli scale",
            "ocean floor", "ocean current", "deep sea",
            "el nino", "la nina",
            "earth science", "earth's core", "earth's crust",
            "magnetic pole", "magnetic field reversal",
            "carbon cycle", "nitrogen cycle",
        ],
        "negative": set(),
    },
    "History": {
        "keywords": {
            "revolution", "revolutions", "revolutionary",
            "war", "wars", "warfare", "wartime",
            "battle", "battles", "siege", "sieges",
            "history", "historical", "historian", "historians", "historiography",
            "empire", "empires", "imperial", "imperialism",
            "king", "kings", "queen", "queens", "monarch", "monarchy", "royal",
            "prince", "princess", "duke", "duchess", "earl", "baron",
            "century", "centuries", "ancient", "medieval", "modern",
            "era", "epoch", "period", "age",
            "civilization", "civilizations",
            "treaty", "treaties", "armistice", "ceasefire",
            "colony", "colonies", "colonial", "colonialism", "colonization",
            "independence", "liberation", "emancipation",
            "dynasty", "dynasties", "dynastic",
            "pharaoh", "pharaohs",
            "renaissance", "reformation", "enlightenment",
            "crusade", "crusades", "crusader",
            "slavery", "slaves", "abolition", "abolitionist",
            "parliament", "parliamentary",
            "republic", "republics", "republican",
            "amendment", "amendments",
            "congress", "congressional",
            "napoleon", "napoleonic",
            "caesar", "augustus", "cleopatra",
            "rebellion", "revolt", "uprising", "insurrection",
            "feudal", "feudalism", "serfdom",
            "knight", "knights", "chivalry",
            "castle", "fortress", "citadel",
            "conquest", "conqueror",
            "ottoman", "byzantine", "persian", "mongol",
            "samurai", "shogun", "shogunate",
            "gladiator", "colosseum", "parthenon",
            "pyramid", "pyramids", "sphinx",
            "mesopotamia", "sumerian", "babylonian", "assyrian",
            "viking", "vikings", "norse",
            "aztec", "aztecs", "maya", "mayan", "inca", "incas",
            "mughal", "mughal",
            "apartheid", "segregation",
            "holocaust", "genocide",
            "reconstruction", "antebellum",
            "suffrage", "suffragette",
            "prohibition",
            "industrialization",
        },
        "phrases": [
            "world war", "wwi", "wwii", "world war i", "world war ii",
            "cold war", "civil war", "civil rights",
            "industrial revolution", "french revolution", "american revolution",
            "russian revolution", "chinese revolution",
            "roman empire", "british empire", "ottoman empire",
            "silk road", "trade route",
            "iron age", "bronze age", "stone age",
            "declaration of independence", "bill of rights",
            "magna carta", "treaty of versailles",
            "berlin wall", "iron curtain",
            "pearl harbor", "d-day", "normandy",
            "hiroshima", "nagasaki",
            "manifest destiny", "monroe doctrine",
            "boston tea party", "stamp act",
            "black death", "bubonic plague",
            "great depression", "roaring twenties",
            "bay of pigs", "cuban missile crisis",
        ],
        "negative": set(),
    },
    "Geography": {
        "keywords": {
            "country", "countries", "continent", "continents",
            "mountain", "mountains", "peak", "summit", "ridge",
            "river", "rivers", "tributary", "tributaries",
            "capital", "capitals",
            "population", "demographic", "demographics",
            "latitude", "longitude", "coordinate", "coordinates",
            "equator", "meridian", "tropics",
            "peninsula", "peninsulas",
            "island", "islands", "archipelago",
            "border", "borders", "boundary", "boundaries",
            "region", "regions", "territory", "territories",
            "coast", "coastal", "coastline", "shore", "beach",
            "valley", "valleys", "plateau", "plateaus", "plain", "plains",
            "lake", "lakes", "lagoon", "lagoons",
            "gulf", "bay", "bays", "strait", "straits", "channel",
            "map", "maps", "cartography", "cartographer", "atlas", "globe",
            "nation", "nations", "national",
            "geography", "geographical", "geographer",
            "urban", "rural", "suburban", "metropolitan",
            "city", "cities", "town", "village",
            "savanna", "savannas", "tundra", "taiga",
            "immigration", "emigration", "migration", "refugee",
            "topography", "topographic",
            "hemisphere", "hemispheres",
            "terrain", "landscape", "landform", "landforms",
            "fjord", "fjords", "atoll", "atolls",
            "cape", "isthmus",
            "steppe", "steppes", "prairie", "prairies", "pampas",
            "sahara", "gobi", "amazon", "nile", "ganges", "yangtze",
            "danube", "mississippi", "congo", "niger",
            "himalaya", "himalayas", "alps", "andes", "rockies",
            "everest", "kilimanjaro", "fuji",
            "pacific", "atlantic", "indian", "arctic", "antarctic",
            "mediterranean", "caribbean", "baltic", "adriatic",
            "census", "urbanization",
        },
        "phrases": [
            "sea level", "time zone", "time zones",
            "tectonic plate", "ring of fire",
            "prime meridian", "international date line",
            "north pole", "south pole", "tropic of cancer", "tropic of capricorn",
            "continental shelf", "ocean current",
            "great barrier reef", "grand canyon",
            "panama canal", "suez canal",
            "natural resource", "natural resources",
            "population density", "birth rate", "death rate",
            "developing country", "developed country",
        ],
        "negative": set(),
    },
    "Mathematics": {
        "keywords": {
            "equation", "equations", "integral", "integrals",
            "calculus", "derivative", "derivatives", "differentiation",
            "algebra", "algebraic",
            "geometry", "geometric", "geometrical",
            "trigonometry", "trigonometric",
            "solve", "calculate", "calculation", "compute", "computation",
            "fraction", "fractions", "decimal", "decimals",
            "angle", "angles", "triangle", "triangles", "polygon", "polygons",
            "circle", "circles", "sphere", "cylinder", "cone", "cube",
            "graph", "graphs", "graphing",
            "function", "functions", "functional",
            "matrix", "matrices", "determinant",
            "probability", "probabilities", "combinatorics",
            "theorem", "theorems", "lemma", "corollary",
            "polynomial", "polynomials", "binomial", "trinomial",
            "integer", "integers", "rational", "irrational",
            "ratio", "ratios", "proportion", "proportions",
            "percentage", "percentages", "percent",
            "variable", "variables", "coefficient", "coefficients",
            "quadratic", "cubic", "quartic",
            "logarithm", "logarithmic", "logarithms",
            "statistics", "statistical",
            "median", "mean", "average", "mode",
            "prime", "primes", "factorial", "factorials",
            "proof", "proofs", "axiom", "postulate",
            "math", "mathematics", "mathematical", "mathematician",
            "arithmetic", "number", "numbers", "numeral",
            "addition", "subtraction", "multiplication", "division",
            "exponent", "exponents", "exponential",
            "root", "roots", "sqrt", "square root",
            "sine", "cosine", "tangent", "secant", "cosecant", "cotangent",
            "pythagorean", "hypotenuse",
            "perimeter", "area", "volume", "circumference",
            "diameter", "radius", "pi",
            "infinity", "infinite", "infinitesimal",
            "set", "sets", "union", "intersection", "subset",
            "linear", "nonlinear", "slope", "intercept",
            "parabola", "hyperbola", "ellipse", "conic",
            "asymptote", "asymptotic",
            "limit", "limits", "convergence", "divergence",
            "differential", "integration",
            "series", "sequence", "sequences",
            "permutation", "permutations", "combination", "combinations",
            "vector", "vectors", "scalar",
            "eigenvalue", "eigenvector",
            "topology", "topological",
            "fibonacci", "euler", "gauss", "euclid",
        },
        "phrases": [
            "prime number", "prime numbers", "natural number",
            "real number", "complex number", "imaginary number",
            "number theory", "graph theory", "set theory",
            "linear algebra", "abstract algebra",
            "differential equation", "partial differential",
            "fundamental theorem", "pythagorean theorem",
            "binomial theorem", "remainder theorem",
            "standard deviation", "normal distribution",
            "central limit theorem", "law of large numbers",
            "greatest common divisor", "least common multiple",
            "order of operations", "distributive property",
            "associative property", "commutative property",
        ],
        "negative": set(),
    },
    "Computer Science": {
        "keywords": {
            "algorithm", "algorithms", "algorithmic",
            "sort", "sorting", "search", "searching",
            "database", "databases",
            "programming", "program", "programs", "programmer",
            "computer", "computers", "computing", "computational",
            "software", "hardware", "firmware",
            "internet", "intranet", "ethernet", "wifi",
            "code", "coding", "coder",
            "network", "networks", "networking",
            "binary", "hexadecimal", "octal",
            "cpu", "gpu", "processor", "processors",
            "ram", "rom", "cache",
            "encryption", "decryption", "cipher", "cryptography",
            "recursion", "recursive", "iteration", "iterative",
            "loop", "loops", "array", "arrays",
            "server", "servers", "client",
            "cloud", "api", "apis", "microservice",
            "compiler", "compilers", "interpreter",
            "linux", "unix", "kernel",
            "python", "java", "javascript", "typescript", "ruby",
            "html", "css", "sql", "nosql",
            "boolean", "string", "float",
            "class", "classes", "object", "objects",
            "inheritance", "polymorphism", "encapsulation", "abstraction",
            "stack", "queue", "tree", "trees", "heap",
            "hash", "hashing", "hashtable",
            "complexity", "runtime", "optimization",
            "bug", "debug", "debugging", "debugger",
            "testing", "unittest",
            "frontend", "backend", "fullstack",
            "framework", "library", "module", "package",
            "cybersecurity", "firewall", "malware", "phishing", "ransomware",
            "blockchain", "cryptocurrency", "bitcoin", "ethereum",
            "robot", "robotics", "automation",
            "iot", "embedded",
            "pixel", "pixels", "resolution",
            "bandwidth", "latency", "throughput",
            "virtualization", "containerization", "docker", "kubernetes",
            "devops", "agile", "scrum",
            "syntax", "semantics", "parsing", "lexer",
        },
        "phrases": [
            "operating system", "operating systems",
            "machine learning", "deep learning", "neural network",
            "artificial intelligence", "natural language processing",
            "computer vision", "reinforcement learning",
            "big o", "big o notation", "time complexity", "space complexity",
            "data structure", "data structures",
            "linked list", "linked lists", "binary tree", "binary search",
            "hash table", "hash map", "priority queue",
            "object oriented", "object-oriented programming",
            "functional programming", "procedural programming",
            "version control", "source code",
            "web development", "mobile app",
            "virtual machine", "virtual reality", "augmented reality",
            "internet of things",
        ],
        "negative": set(),
    },
    "Economics": {
        "keywords": {
            "economy", "economic", "economics", "economist",
            "gdp", "gnp",
            "inflation", "deflation", "stagflation", "hyperinflation",
            "supply", "demand",
            "market", "markets", "marketplace",
            "stock", "stocks", "equity", "equities",
            "trade", "trading", "trader",
            "tariff", "tariffs", "quota", "quotas",
            "fiscal", "monetary",
            "tax", "taxes", "taxation",
            "budget", "budgetary", "budgeting",
            "deficit", "surplus",
            "debt", "debts", "creditor",
            "recession", "recessionary",
            "unemployment", "employment",
            "labor", "labour", "workforce",
            "wage", "wages", "salary", "salaries",
            "income", "earnings", "revenue",
            "wealth", "prosperity",
            "poverty", "destitution",
            "inequality", "inequity",
            "capitalism", "capitalist",
            "socialism", "socialist",
            "communism", "communist",
            "profit", "profits", "profitability",
            "loss", "losses",
            "cost", "costs", "expense",
            "price", "prices", "pricing",
            "monopoly", "oligopoly", "duopoly",
            "competition", "competitive",
            "subsidy", "subsidies", "subsidize",
            "entrepreneur", "entrepreneurship", "startup",
            "investment", "investments", "investor", "investors",
            "currency", "currencies",
            "forex", "devaluation",
            "banking", "bank", "banks", "banker",
            "loan", "loans", "lending",
            "mortgage", "mortgages",
            "credit", "debit",
            "asset", "assets", "liability", "liabilities",
            "dividend", "dividends",
            "shareholder", "shareholders", "stockholder",
            "corporation", "corporations", "conglomerate",
            "microeconomics", "macroeconomics",
            "scarcity", "scarce",
            "elasticity", "elastic", "inelastic",
            "marginal", "marginalism",
            "utility", "consumer", "consumers",
            "producer", "producers",
            "aggregate",
            "keynesian", "monetarist", "neoclassical",
            "commodity", "commodities",
            "depreciation", "appreciation",
            "privatization", "nationalization",
            "cartel", "oligarchy",
            "austerity", "stimulus",
        },
        "phrases": [
            "interest rate", "interest rates",
            "central bank", "federal reserve", "reserve bank",
            "stock market", "stock exchange",
            "wall street", "dow jones", "nasdaq",
            "exchange rate", "exchange rates",
            "adam smith", "john maynard keynes", "milton friedman",
            "free market", "free trade", "fair trade",
            "laissez faire", "invisible hand",
            "opportunity cost", "sunk cost",
            "comparative advantage", "absolute advantage",
            "balance of trade", "balance of payments",
            "supply chain", "supply and demand",
            "gross domestic product",
            "consumer price index", "cost of living",
            "minimum wage", "living wage",
            "business cycle", "boom and bust",
            "public good", "public goods",
        ],
        "negative": set(),
    },
    "Literature & Language": {
        "keywords": {
            "novel", "novels", "novella", "novellas",
            "poem", "poems", "poetry", "poetic", "poet", "poets",
            "author", "authors", "writer", "writers", "playwright",
            "fiction", "nonfiction", "prose",
            "literature", "literary", "literati",
            "narrative", "narrator", "narration",
            "protagonist", "antagonist", "antihero",
            "character", "characters", "characterization",
            "plot", "subplot", "climax", "denouement",
            "theme", "themes", "thematic", "motif", "motifs",
            "metaphor", "metaphors", "metaphorical",
            "simile", "similes",
            "allegory", "allegorical",
            "symbolism", "symbolic", "symbol", "symbols",
            "imagery", "vivid",
            "shakespeare", "shakespearean",
            "dickens", "twain", "austen", "hemingway", "orwell",
            "tolstoy", "dostoevsky", "kafka", "chekhov",
            "homer", "virgil", "dante", "chaucer", "milton",
            "wordsworth", "keats", "shelley", "byron",
            "drama", "dramatic", "dramatist",
            "tragedy", "tragic", "tragicomedy",
            "comedy", "comedic", "farce",
            "sonnet", "sonnets", "stanza", "stanzas",
            "verse", "verses", "couplet", "quatrain",
            "rhyme", "rhyming", "rhythm", "meter",
            "essay", "essays", "essayist",
            "memoir", "memoirs", "biography", "autobiography",
            "grammar", "grammatical", "syntax", "syntactic",
            "vocabulary", "lexicon", "diction",
            "rhetoric", "rhetorical",
            "linguistics", "linguistic", "linguist",
            "language", "languages", "multilingual",
            "dialect", "dialects", "slang", "jargon",
            "phonetics", "phonology", "morphology",
            "genre", "genres",
            "fable", "fables", "myth", "myths", "mythology", "mythological",
            "legend", "legends", "legendary",
            "epic", "epics", "saga", "sagas",
            "irony", "ironic", "sarcasm",
            "satire", "satirical", "satirist",
            "parody", "pastiche",
            "hyperbole", "alliteration", "assonance", "consonance",
            "onomatopoeia", "personification", "apostrophe",
            "oxymoron", "paradox", "juxtaposition",
            "clause", "sentence", "paragraph",
            "punctuation", "spelling",
            "adjective", "adverb", "noun", "verb", "pronoun",
            "preposition", "conjunction", "interjection",
            "syllable", "prefix", "suffix",
            "etymology", "etymological",
            "anthology", "canon", "literary",
        },
        "phrases": [
            "short story", "short stories",
            "fairy tale", "fairy tales", "folk tale",
            "root word", "root words",
            "figure of speech", "figures of speech",
            "point of view", "first person", "third person",
            "stream of consciousness", "unreliable narrator",
            "gothic literature", "romantic era",
            "victorian literature", "modernist literature",
            "postmodern", "magic realism", "magical realism",
            "creative writing", "literary criticism", "literary analysis",
            "parts of speech", "sentence structure",
        ],
        "negative": set(),
    },
    "Psychology": {
        "keywords": {
            "psychology", "psychological", "psychologist", "psychologists",
            "behavior", "behaviour", "behavioral", "behavioural",
            "cognitive", "cognition", "metacognition",
            "perception", "perceptual",
            "memory", "memories", "amnesia", "recall", "recognition",
            "learning", "learner",
            "emotion", "emotions", "emotional", "affect", "affective",
            "motivation", "motivational",
            "personality", "temperament", "disposition",
            "consciousness", "unconscious", "subconscious",
            "dream", "dreams", "dreaming",
            "freud", "freudian",
            "jung", "jungian",
            "pavlov", "pavlovian",
            "skinner", "skinnerism",
            "piaget", "vygotsky",
            "maslow", "erikson", "rogers",
            "therapy", "therapist", "therapies",
            "counseling", "counselor",
            "psychiatry", "psychiatrist", "psychiatric",
            "disorder", "disorders",
            "anxiety", "anxious",
            "phobia", "phobias", "phobic",
            "trauma", "traumatic", "ptsd",
            "stress", "stressor", "stressful",
            "intelligence", "iq",
            "aptitude", "instinct", "instinctive",
            "conditioning", "conditioned",
            "reinforcement", "reinforcer",
            "punishment", "punisher",
            "stimulus", "stimuli", "response",
            "neuroscience", "neuroscientist",
            "cortex", "cerebral", "cerebellum",
            "hippocampus", "amygdala", "prefrontal",
            "attachment", "bonding",
            "developmental", "psychosocial",
            "conformity", "obedience", "compliance",
            "prejudice", "stereotype", "stereotyping", "discrimination",
            "psychoanalysis", "psychoanalytic",
            "behaviorism", "behavioristic",
            "humanism", "humanistic",
            "gestalt",
            "hallucination", "delusion", "psychosis",
            "schizophrenia", "bipolar", "mania",
            "narcissism", "narcissistic",
            "introvert", "extrovert", "ambivert",
            "empathy", "empathetic", "sympathy",
            "catharsis", "sublimation", "repression", "suppression",
            "transference", "projection", "rationalization",
            "placebo", "nocebo",
        },
        "phrases": [
            "mental health", "mental illness", "mental disorder",
            "social psychology", "clinical psychology",
            "developmental psychology", "cognitive psychology",
            "self-esteem", "self-concept", "self-efficacy",
            "defense mechanism", "defense mechanisms",
            "classical conditioning", "operant conditioning",
            "nature vs nurture", "nature versus nurture",
            "fight or flight", "fight-or-flight",
            "cognitive dissonance", "confirmation bias",
            "stanford prison experiment", "milgram experiment",
            "hierarchy of needs", "stages of development",
            "bystander effect", "halo effect",
            "short-term memory", "long-term memory", "working memory",
            "eating disorder", "panic attack",
        ],
        "negative": set(),
    },
    "Political Science": {
        "keywords": {
            "government", "governments", "governance", "governing",
            "political", "politics", "politician", "politicians",
            "policy", "policies", "policymaker",
            "legislation", "legislative", "legislator", "legislature",
            "law", "laws", "legal", "illegal", "judicial", "judiciary",
            "diplomacy", "diplomat", "diplomatic",
            "ambassador", "ambassadors", "embassy", "embassies",
            "sovereignty", "sovereign",
            "federal", "federalism", "federation",
            "confederation", "confederacy",
            "autocracy", "autocratic",
            "dictatorship", "dictator", "dictatorial",
            "totalitarian", "totalitarianism",
            "authoritarian", "authoritarianism",
            "liberal", "liberalism",
            "conservative", "conservatism",
            "progressive", "progressivism",
            "libertarian", "libertarianism",
            "ideology", "ideological", "ideologies",
            "propaganda", "propagandist",
            "censorship", "censor",
            "ballot", "ballots", "voting", "vote", "votes", "voter",
            "campaign", "campaigning",
            "candidate", "candidates",
            "incumbent", "incumbency",
            "opposition", "bipartisan",
            "coalition", "coalitions",
            "sanctions", "sanction",
            "geopolitics", "geopolitical",
            "hegemony", "hegemon",
            "nationalism", "nationalist",
            "patriotism", "patriotic",
            "populism", "populist",
            "fascism", "fascist",
            "bureaucracy", "bureaucratic", "bureaucrat",
            "cabinet", "ministry",
            "minister", "ministers",
            "senator", "senators",
            "representative", "representatives",
            "veto", "filibuster",
            "impeachment", "impeach",
            "constitution", "constitutional", "unconstitutional",
            "referendum", "referenda",
            "plebiscite",
            "secession", "separatism",
            "coup", "junta",
            "lobbyist", "lobbying",
            "gerrymandering",
            "welfare", "social security",
        },
        "phrases": [
            "political science", "political theory",
            "bill of rights", "civil rights", "human rights",
            "civil liberties", "civil law", "criminal law",
            "united nations", "european union", "african union",
            "supreme court", "high court",
            "executive branch", "legislative branch", "judicial branch",
            "separation of powers", "checks and balances",
            "rule of law", "due process",
            "international relations", "foreign policy", "foreign affairs",
            "political party", "political parties",
            "prime minister", "head of state",
            "electoral college", "popular vote",
            "social contract", "state of nature",
        ],
        "negative": set(),
    },
    "Art & Music": {
        "keywords": {
            "art", "arts", "artist", "artists", "artistic", "artwork", "artworks",
            "painting", "paintings", "painter", "painters",
            "portrait", "portraits", "landscape", "landscapes",
            "sculpture", "sculptures", "sculptor", "sculptors",
            "statue", "statues", "carving",
            "ceramic", "ceramics", "pottery",
            "music", "musical", "musician", "musicians",
            "composer", "composers", "composition", "compositions",
            "symphony", "symphonies", "symphonic",
            "orchestra", "orchestral", "orchestras",
            "concerto", "concertos", "sonata", "sonatas",
            "opera", "operas", "operatic",
            "melody", "melodies", "melodic",
            "harmony", "harmonies", "harmonic",
            "rhythm", "rhythmic",
            "tempo", "allegro", "adagio", "andante",
            "pitch", "tone", "tonal", "tonality",
            "instrument", "instruments", "instrumental",
            "piano", "violin", "viola", "guitar", "drum", "drums",
            "flute", "trumpet", "trombone", "tuba",
            "cello", "saxophone", "clarinet", "oboe", "bassoon",
            "harp", "organ", "accordion",
            "gallery", "galleries",
            "museum", "museums",
            "exhibition", "exhibitions", "exhibit",
            "curator", "curators",
            "baroque", "rococo",
            "impressionism", "impressionist",
            "expressionism", "expressionist",
            "cubism", "cubist",
            "surrealism", "surrealist",
            "realism", "realist",
            "romanticism", "romantic",
            "canvas", "palette", "brush", "brushstroke",
            "sketch", "sketches", "drawing", "drawings", "illustration",
            "architecture", "architect", "architects", "architectural",
            "aesthetic", "aesthetics",
            "photography", "photograph", "photographer",
            "cinema", "cinematic", "cinematography",
            "theater", "theatre", "theatrical",
            "performance", "performer", "performers",
            "dance", "dancer", "dancers",
            "ballet", "ballerina",
            "beethoven", "mozart", "bach",
            "chopin", "vivaldi", "tchaikovsky", "handel", "haydn",
            "debussy", "stravinsky", "brahms", "wagner",
            "picasso", "monet", "renoir", "cezanne",
            "rembrandt", "vermeer", "caravaggio",
            "warhol", "pollock", "kandinsky", "mondrian",
            "fresco", "mural", "mosaic", "tapestry",
            "chord", "chords", "scale", "scales", "octave",
            "soprano", "alto", "tenor", "baritone", "bass",
            "choir", "chorus", "ensemble", "quartet", "trio", "duet",
        },
        "phrases": [
            "da vinci", "leonardo da vinci",
            "van gogh", "vincent van gogh",
            "fine art", "fine arts", "visual arts",
            "performing arts", "liberal arts",
            "art history", "art nouveau", "art deco",
            "pop art", "modern art", "contemporary art",
            "oil painting", "watercolor painting",
            "classical music", "jazz music", "rock music",
            "music theory", "sheet music",
            "musical notation", "time signature",
            "major key", "minor key",
        ],
        "negative": set(),
    },
    "Philosophy & Ethics": {
        "keywords": {
            "philosophy", "philosophical", "philosopher", "philosophers",
            "ethics", "ethical", "unethical", "ethicist",
            "moral", "morality", "morals", "immoral", "amoral",
            "virtue", "virtues", "virtuous", "vice", "vices",
            "logic", "logical", "illogical", "logician",
            "reasoning", "reason", "rational", "rationality",
            "argument", "arguments", "argumentation",
            "fallacy", "fallacies", "fallacious",
            "epistemology", "epistemological",
            "ontology", "ontological",
            "metaphysics", "metaphysical",
            "existentialism", "existential", "existentialist",
            "nihilism", "nihilist", "nihilistic",
            "aristotle", "aristotelian",
            "plato", "platonic", "platonism",
            "socrates", "socratic",
            "kant", "kantian",
            "nietzsche", "nietzschean",
            "descartes", "cartesian",
            "hegel", "hegelian",
            "locke", "lockean",
            "rousseau",
            "hobbes", "hobbesian",
            "confucius", "confucian", "confucianism",
            "utilitarianism", "utilitarian",
            "deontology", "deontological",
            "consequentialism", "consequentialist",
            "justice", "injustice",
            "fairness", "unfairness",
            "equality", "inequality",
            "liberty", "freedom",
            "truth", "truthfulness",
            "knowledge", "knowledgeable",
            "wisdom", "wise",
            "belief", "beliefs",
            "faith", "faithless",
            "doubt", "skeptic", "skepticism", "skeptical",
            "determinism", "deterministic",
            "dualism", "dualistic", "monism",
            "empiricism", "empiricist",
            "rationalism", "rationalist",
            "pragmatism", "pragmatic", "pragmatist",
            "idealism", "idealist",
            "stoicism", "stoic",
            "relativism", "relativist",
            "absolutism", "absolutist",
            "dilemma", "dilemmas",
            "paradox", "paradoxes", "paradoxical",
            "sublime",
            "hedonism", "hedonistic",
            "altruism", "altruistic",
            "egoism", "egoist",
            "teleology", "teleological",
            "bioethics", "neuroethics",
            "autonomy", "beneficence", "nonmaleficence",
        },
        "phrases": [
            "free will", "free choice",
            "thought experiment", "thought experiments",
            "trolley problem",
            "categorical imperative",
            "social contract",
            "natural law", "natural rights",
            "meaning of life", "purpose of life",
            "golden rule", "golden mean",
            "veil of ignorance",
            "allegory of the cave",
            "cogito ergo sum", "i think therefore i am",
            "moral philosophy", "political philosophy",
            "philosophy of mind", "philosophy of science",
            "philosophy of language", "philosophy of religion",
        ],
        "negative": set(),
    },
    "Environmental Science": {
        "keywords": {
            "environment", "environmental", "environmentalist",
            "ecology", "ecological", "ecologist",
            "pollution", "pollutant", "pollutants", "pollute", "polluted",
            "contamination", "contaminated", "contaminant",
            "sustainability", "sustainable", "unsustainable",
            "renewable", "nonrenewable",
            "biodiversity", "biodiverse",
            "conservation", "conservationist",
            "preservation", "preserve",
            "endangered", "threatened",
            "emissions", "emission",
            "deforestation", "reforestation", "afforestation",
            "recycling", "recycle", "recyclable",
            "waste", "wastes", "wastewater",
            "landfill", "landfills",
            "composting", "compost",
            "hydropower", "geothermal",
            "smog", "haze",
            "pesticide", "pesticides", "herbicide", "herbicides",
            "insecticide", "insecticides", "fungicide",
            "mangrove", "mangroves",
            "wetland", "wetlands",
            "wildlife", "wildfire", "wildfires",
            "poaching", "poacher",
            "biomass", "biofuel", "bioenergy",
            "permafrost", "methane",
            "desertification", "salinization",
            "eutrophication", "algal bloom",
            "microplastic", "microplastics",
            "carbon neutral", "decarbonization",
        },
        "phrases": [
            "carbon dioxide", "carbon footprint", "carbon emissions",
            "greenhouse gas", "greenhouse gases", "greenhouse effect",
            "global warming", "climate change", "climate crisis",
            "ozone layer", "ozone depletion",
            "acid rain",
            "water pollution", "air pollution", "soil pollution",
            "noise pollution", "light pollution",
            "solar energy", "solar power", "solar panel",
            "wind energy", "wind power", "wind turbine", "wind farm",
            "fossil fuel", "fossil fuels",
            "natural gas", "coal mining",
            "ecosystem services",
            "habitat loss", "habitat destruction", "habitat fragmentation",
            "coral reef", "coral bleaching",
            "organic farming", "sustainable agriculture",
            "carbon neutral", "net zero", "zero waste",
            "paris agreement", "kyoto protocol", "cop26", "cop27", "cop28",
            "environmental impact", "ecological footprint",
            "earth day", "earth hour",
            "endangered species", "invasive species",
            "food security", "water security",
            "circular economy",
            "environmental protection", "epa",
        ],
        "negative": set(),
    },
    "General Science": {
        "keywords": set(),
        "phrases": [],
        "negative": set(),
    },
}


def detect_subject(question):
    """
    Improved keyword-based subject detection with:
    - 150+ keywords per subject
    - Multi-word phrase matching
    - Weighted scoring (longer keyword matches score higher)
    - Confidence threshold
    """
    q = question.lower()
    india_signals = {
        "india", "indian", "bharat", "gandhi", "ghandhi", "gandhiji", "bapu",
        "nehru", "ambedkar", "netaji", "isro", "rbi", "lok sabha", "rajya sabha",
        "jana gana mana", "vande mataram", "tiranga", "bharat ratna",
    }
    if any(signal in q for signal in india_signals) or any(alias in q for alias in INDIA_GK_ALIASES):
        return INDIA_GK_TOPIC
    q_words = set(re.findall(r'\b[a-z]{2,}\b', q))

    best_topic = "General Science"
    best_score = 0.0

    for topic, rules in SUBJECT_RULES.items():
        if topic == "General Science":
            continue

        score = 0.0

        # Check negative keywords first — if any match, skip this topic
        if rules["negative"] and rules["negative"] & q_words:
            continue

        # Score keyword matches (single words)
        keyword_matches = rules["keywords"] & q_words
        for kw in keyword_matches:
            # Longer keywords are more specific → higher weight
            score += 1.0 + (0.3 if len(kw) > 6 else 0.0)

        # Score phrase matches (multi-word, matched as substrings)
        for phrase in rules["phrases"]:
            if phrase in q:
                # Phrases are very specific → high weight
                score += 2.5

        # Normalize by question length to avoid long questions always winning
        word_count = max(len(q_words), 1)
        normalized = score / (word_count ** 0.3)

        if normalized > best_score:
            best_score = normalized
            best_topic = topic

    # Confidence threshold: if the score is too low, default to General Science
    if best_score < 0.15:
        return "General Science"

    return best_topic


# ============================================================
#   STEP 2: LOAD ALL DATASETS (13+ sources)
# ============================================================

all_questions = []
print("\n" + "=" * 60)
print("  SIMILAR QUESTION FINDER — DATASET PREPARATION (v2)")
print("  Target: 10,000 questions | 17 subjects including Indian GK")
print("=" * 60)

dataset_counter = 0
total_datasets = 14

def load_with_status(name, loader_fn):
    """Helper to load a dataset with nice status messages."""
    global dataset_counter
    dataset_counter += 1
    print(f"\n[{dataset_counter}/{total_datasets}] Loading {name}...")
    try:
        count_before = len(all_questions)
        loader_fn()
        count_after = len(all_questions)
        added = count_after - count_before
        print(f"      [OK] {name}: +{added} questions")
        return True
    except Exception as e:
        print(f"      [FAIL] {name}: {e}")
        return False


# ── Dataset 1: SciQ (11,679 questions) ───────────────────────
def load_india_general_knowledge():
    """Load the built-in India GK bank before external datasets."""
    all_questions.extend(build_india_gk_questions())


load_with_status("Curated Indian General Knowledge", load_india_general_knowledge)


def load_sciq():
    sciq = load_dataset("allenai/sciq")
    for split in ['train', 'validation', 'test']:
        for q in sciq[split]['question']:
            if q and len(q.strip()) > 10:
                all_questions.append({
                    "question": q.strip(),
                    "topic": detect_subject(q)
                })

load_with_status("SciQ (Science QA)", load_sciq)


# ── Dataset 2: OpenBookQA (4,957 questions) ──────────────────
def load_openbookqa():
    openbookqa = load_dataset("allenai/openbookqa")
    for split in ['train', 'validation', 'test']:
        for q in openbookqa[split]['question_stem']:
            if q and len(q.strip()) > 10:
                all_questions.append({
                    "question": q.strip(),
                    "topic": detect_subject(q)
                })

load_with_status("OpenBookQA", load_openbookqa)


# ── Dataset 3: ARC Easy (2,251 questions) ────────────────────
def load_arc_easy():
    arc_easy = load_dataset("allenai/ai2_arc", "ARC-Easy")
    for split in ['train', 'validation', 'test']:
        for q in arc_easy[split]['question']:
            if q and len(q.strip()) > 10:
                all_questions.append({
                    "question": q.strip(),
                    "topic": detect_subject(q)
                })

load_with_status("ARC Easy", load_arc_easy)


# ── Dataset 4: ARC Challenge (1,119 questions) ───────────────
def load_arc_challenge():
    arc_hard = load_dataset("allenai/ai2_arc", "ARC-Challenge")
    for split in ['train', 'validation', 'test']:
        for q in arc_hard[split]['question']:
            if q and len(q.strip()) > 10:
                all_questions.append({
                    "question": q.strip(),
                    "topic": detect_subject(q)
                })

load_with_status("ARC Challenge", load_arc_challenge)


# ── Dataset 5: SQuAD (87,599 questions) ──────────────────────
def load_squad():
    squad = load_dataset("rajpurkar/squad")
    for q in squad['train']['question']:
        if q and len(q.strip()) > 10:
            all_questions.append({
                "question": q.strip(),
                "topic": detect_subject(q)
            })

load_with_status("SQuAD v1", load_squad)


# ── Dataset 6: SQuAD v2 (130,319 questions) ──────────────────
def load_squad_v2():
    squad_v2 = load_dataset("rajpurkar/squad_v2")
    for q in squad_v2['train']['question']:
        if q and len(q.strip()) > 10:
            all_questions.append({
                "question": q.strip(),
                "topic": detect_subject(q)
            })

load_with_status("SQuAD v2", load_squad_v2)


# ── Dataset 7: MathQA (37,200 questions) ─────────────────────
def load_mathqa():
    mathqa = load_dataset("math_qa")
    for split in ['train', 'validation', 'test']:
        if split in mathqa:
            for item in mathqa[split]:
                q = item.get('Problem', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": "Mathematics"
                    })

load_with_status("MathQA (Mathematics)", load_mathqa)


# ── Dataset 8: PIQA (16,113 questions) ───────────────────────
def load_piqa():
    piqa = load_dataset("piqa")
    for split in ['train', 'validation']:
        if split in piqa:
            for item in piqa[split]:
                q = item.get('goal', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": detect_subject(q)
                    })

load_with_status("PIQA (Physical Intuition)", load_piqa)


# ── Dataset 9: CommonsenseQA (12,102 questions) ──────────────
def load_commonsenseqa():
    cqa = load_dataset("commonsense_qa")
    for split in ['train', 'validation']:
        if split in cqa:
            for item in cqa[split]:
                q = item.get('question', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": detect_subject(q)
                    })

load_with_status("CommonsenseQA", load_commonsenseqa)


# ── Dataset 10: Social IQA (33,410 questions) ────────────────
def load_social_iqa():
    siqa = load_dataset("social_i_qa")
    for split in ['train', 'validation']:
        if split in siqa:
            for item in siqa[split]:
                q = item.get('question', '') or ''
                ctx = item.get('context', '') or ''
                full = f"{ctx} {q}".strip()
                if full and len(full) > 10:
                    all_questions.append({
                        "question": full,
                        "topic": detect_subject(full)
                    })

load_with_status("Social IQA (Social Intelligence)", load_social_iqa)


# ── Dataset 11: TriviaQA (87,622 questions) ──────────────────
def load_triviaqa():
    tqa = load_dataset("trivia_qa", "unfiltered.nocontext")
    for split in ['train', 'validation']:
        if split in tqa:
            for item in tqa[split]:
                q = item.get('question', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": detect_subject(q)
                    })

load_with_status("TriviaQA (Trivia & General)", load_triviaqa)


# ── Dataset 12: Web Questions (6,642 questions) ──────────────
def load_web_questions():
    wq = load_dataset("web_questions")
    for split in ['train', 'test']:
        if split in wq:
            for item in wq[split]:
                q = item.get('question', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": detect_subject(q)
                    })

load_with_status("Web Questions", load_web_questions)


# ── Dataset 13: WikiQA (3,047 questions) ─────────────────────
def load_wikiqa():
    wikiqa = load_dataset("wiki_qa")
    for split in ['train', 'validation', 'test']:
        if split in wikiqa:
            for item in wikiqa[split]:
                q = item.get('question', '') or ''
                if q and len(q.strip()) > 10:
                    all_questions.append({
                        "question": q.strip(),
                        "topic": detect_subject(q)
                    })

load_with_status("WikiQA", load_wikiqa)


# ============================================================
#   STEP 3: CLEAN, DEDUPLICATE & STRATIFIED SAMPLE
# ============================================================

print("\n" + "=" * 60)
print("  PROCESSING & BALANCING DATA")
print("=" * 60)

print(f"\n  Total raw questions collected: {len(all_questions)}")

# Remove duplicates (case-insensitive)
seen = set()
unique_questions = []
for item in all_questions:
    q_normalized = re.sub(r'\s+', ' ', item['question'].lower().strip())
    if q_normalized not in seen and len(q_normalized) > 10:
        seen.add(q_normalized)
        unique_questions.append(item)

print(f"  After removing duplicates: {len(unique_questions)}")

# Group by topic for stratified sampling
topic_groups = {}
for item in unique_questions:
    topic = item['topic']
    if topic not in topic_groups:
        topic_groups[topic] = []
    topic_groups[topic].append(item)

print(f"\n  Detected {len(topic_groups)} subjects:")
for topic, items in sorted(topic_groups.items(), key=lambda x: -len(x[1])):
    print(f"    {topic:25} → {len(items):6} raw questions")

# ── Stratified sampling ──────────────────────────────────────
# Strategy:
# 1. Guarantee MIN_PER_SUBJECT from each subject that has enough
# 2. Fill remaining quota proportionally from larger subjects
# 3. Total target: TARGET_TOTAL questions

random.seed(42)
final_questions = []
remaining_quota = TARGET_TOTAL

# Phase 1: Guarantee minimum per subject
subjects_with_data = {t: items for t, items in topic_groups.items() if len(items) >= 5}

for topic, items in subjects_with_data.items():
    random.shuffle(items)
    take = min(len(items), MIN_PER_SUBJECT)
    final_questions.extend(items[:take])
    remaining_quota -= take

print(f"\n  Phase 1 (min {MIN_PER_SUBJECT}/subject): {len(final_questions)} questions selected")

# Phase 2: Fill remaining slots proportionally from unused questions
already_used = set(id(q) for q in final_questions)
remaining_pool = []
for topic, items in subjects_with_data.items():
    for item in items:
        if id(item) not in already_used:
            remaining_pool.append(item)

random.shuffle(remaining_pool)

if remaining_quota > 0 and remaining_pool:
    extra = remaining_pool[:remaining_quota]
    final_questions.extend(extra)
    print(f"  Phase 2 (fill remaining): +{len(extra)} questions")

# Final shuffle
random.shuffle(final_questions)
print(f"\n  Final dataset: {len(final_questions)} questions")

# Show distribution
topics = [q['topic'] for q in final_questions]
distribution = Counter(topics)
print(f"\n  Subject Distribution:")
for topic, count in sorted(distribution.items(), key=lambda x: -x[1]):
    pct = count / len(final_questions) * 100
    bar = "█" * (count // 40)
    print(f"    {topic:25} → {count:5} ({pct:5.1f}%)  {bar}")


# ============================================================
#   STEP 4: GENERATE EMBEDDINGS
# ============================================================

print("\n" + "=" * 60)
print("  GENERATING EMBEDDINGS")
print("=" * 60)

print("\n  Loading model: all-MiniLM-L6-v2 ...")
model = SentenceTransformer('all-MiniLM-L6-v2')
print("  [OK] Model loaded!")

questions_text = [q['question'] for q in final_questions]

print(f"\n  Encoding {len(questions_text)} questions...")
print("  This will take ~2-4 minutes...\n")

embeddings = model.encode(
    questions_text,
    batch_size=64,
    show_progress_bar=True,
    convert_to_numpy=True
)

print(f"\n  [OK] Embeddings generated!")
print(f"  Shape: {embeddings.shape}")


# ============================================================
#   STEP 5: SAVE EMBEDDING FILES
# ============================================================

print("\n" + "=" * 60)
print("  SAVING EMBEDDING FILES")
print("=" * 60)

# Save embeddings
np.save(EMBEDDINGS_PATH, embeddings)
print(f"\n  [OK] Saved: {EMBEDDINGS_PATH}")

# Save questions with topics
with open(QUESTIONS_PATH, "w", encoding="utf-8") as f:
    json.dump(final_questions, f, ensure_ascii=False, indent=2)
print(f"  [OK] Saved: {QUESTIONS_PATH}")

# Save topic list
topics_list = sorted(list(set(q['topic'] for q in final_questions)))
with open(TOPICS_PATH, "w") as f:
    json.dump(topics_list, f, indent=2)
print(f"  [OK] Saved: {TOPICS_PATH}")

print(f"\n  Topics available ({len(topics_list)}): {topics_list}")


# ============================================================
#   STEP 6: PRE-COMPUTE SIMILARITY MAP FOR FRONTEND
# ============================================================

print("\n" + "=" * 60)
print("  PRE-COMPUTING SIMILARITY MAP")
print("=" * 60)

# For every question, find the top K most similar questions using
# real cosine similarity on the embeddings. This lets the frontend
# show genuine AI-powered matches without needing a backend.

SIMILARITY_MAP_PATH = os.path.join(SCRIPT_DIR, "similarity_map.json")

print(f"\n  Computing pairwise cosine similarity for {len(final_questions)} questions...")
print(f"  TOP_K = {TOP_K_SIMILAR}")
print("  This may take a few minutes...\n")

# Compute full similarity matrix
# For 10,000 questions: 10000 x 10000 matrix ≈ 400MB float32
# Process in batches to avoid memory issues
BATCH_SIZE = 1000
similarity_map = {}

for batch_start in range(0, len(final_questions), BATCH_SIZE):
    batch_end = min(batch_start + BATCH_SIZE, len(final_questions))
    batch_sims = cosine_similarity(embeddings[batch_start:batch_end], embeddings)

    for local_i, global_i in enumerate(range(batch_start, batch_end)):
        scores = batch_sims[local_i]
        # Exclude self
        scores[global_i] = -1
        top_indices = np.argsort(scores)[::-1][:TOP_K_SIMILAR]
        similarity_map[str(global_i)] = [
            {"idx": int(j), "score": round(float(scores[j]), 4)}
            for j in top_indices
        ]

    print(f"  Processed {batch_end}/{len(final_questions)} questions...")

print(f"  [OK] Similarity map computed for all {len(final_questions)} questions")

# Also compute topic centroids for AI-powered topic classification in frontend
print("\n  Computing topic centroid embeddings for frontend classification...")
topic_centroids = {}
for topic in topics_list:
    indices = [i for i, q in enumerate(final_questions) if q['topic'] == topic]
    if indices:
        centroid = embeddings[indices].mean(axis=0)
        topic_centroids[topic] = centroid.tolist()

print(f"  [OK] Computed centroids for {len(topic_centroids)} topics")


# ============================================================
#   STEP 7: UPDATE db-store.json WITH ALL QUESTIONS
# ============================================================

print("\n" + "=" * 60)
print(f"  UPDATING FRONTEND db-store.json ({len(final_questions)} QUESTIONS)")
print("=" * 60)

# Seed ALL questions into db-store.json for the frontend
frontend_questions = []
base_time = datetime.utcnow()

for idx, q in enumerate(final_questions):
    question_id = f"seed-{uuid.uuid4().hex[:8]}"
    # Spread creation times across last 180 days for realistic history
    hours_offset = idx * (180 * 24 / len(final_questions))
    created_at = (base_time - timedelta(hours=hours_offset)).isoformat() + "Z"
    frontend_questions.append({
        "id": question_id,
        "userId": "system-ai-user",
        "userEmail": "system.edu@aistudio.com",
        "userName": "Academia AI",
        "text": q['question'],
        "tag": q['topic'],
        "searchText": q.get("searchText", q['question'].lower()),
        "answer": q.get("answer"),
        "source": q.get("source", "Academic dataset"),
        "embedding": [],
        "createdAt": created_at
    })

# Build the db-store structure
db_store = {
    "users": [
        {
            "id": "system-ai-user",
            "email": "system.edu@aistudio.com",
            "passwordHash": "system-secured",
            "name": "Academia AI",
            "createdAt": base_time.isoformat() + "Z"
        }
    ],
    "questions": frontend_questions,
    "sessions": []
}

# Save to root (Vite serves static files from root)
with open(DB_STORE_ROOT_PATH, "w", encoding="utf-8") as f:
    json.dump(db_store, f, ensure_ascii=False, indent=2)
print(f"\n  [OK] Saved: {DB_STORE_ROOT_PATH}")
print(f"     -> {len(frontend_questions)} questions loaded for frontend")

# Also save to public/ so Vite copies it into dist/ for deployment.
with open(DB_STORE_PATH, "w", encoding="utf-8") as f:
    json.dump(db_store, f, ensure_ascii=False, indent=2)
print(f"  [OK] Saved: {DB_STORE_PATH}")

# Save questions to MongoDB Atlas
print("\n" + "=" * 60)
print("  UPLOADING TO MONGODB ATLAS")
print("=" * 60)
save_questions_to_mongodb(frontend_questions)

# Save the similarity map (index-based, frontend maps via question order)
# Include question ID mapping so frontend can look up by ID
id_map = {str(i): frontend_questions[i]["id"] for i in range(len(frontend_questions))}

similarity_data = {
    "idMap": id_map,
    "similarities": similarity_map,
    "topicCentroids": topic_centroids,
    "topicLabels": topics_list,
    "aliases": INDIA_GK_ALIASES,
}

with open(SIMILARITY_MAP_PATH, "w", encoding="utf-8") as f:
    json.dump(similarity_data, f, ensure_ascii=False)
print(f"  [OK] Saved: {SIMILARITY_MAP_PATH}")

# Copy to public for deployment.
public_sim_path = os.path.join(PUBLIC_DIR, "similarity_map.json")
with open(public_sim_path, "w", encoding="utf-8") as f:
    json.dump(similarity_data, f, ensure_ascii=False)
print(f"  [OK] Saved: {public_sim_path}")


# ============================================================
#   STEP 8: TEST — Find Similar Questions
# ============================================================

print("\n" + "=" * 60)
print("  TESTING SIMILARITY SEARCH")
print("=" * 60)


def find_similar(new_question, top_k=5):
    """Find the top-k most similar questions using cosine similarity."""
    new_vec = model.encode([new_question])
    scores = cosine_similarity(new_vec, embeddings)[0]
    top_indices = np.argsort(scores)[::-1][:top_k]
    return [
        {
            "question": final_questions[i]['question'],
            "topic": final_questions[i]['topic'],
            "score": round(float(scores[i]) * 100, 1)
        }
        for i in top_indices
    ]


def get_topic(new_question):
    """Assign a topic using embedding similarity against topic centroids."""
    # First try keyword-based detection
    keyword_topic = detect_subject(new_question)
    if keyword_topic != "General Science":
        return keyword_topic

    # Fallback: use centroid embeddings
    q_vec = model.encode([new_question])
    best_topic = "General Science"
    best_sim = -1
    for topic, centroid in topic_centroids.items():
        centroid_vec = np.array(centroid).reshape(1, -1)
        sim = cosine_similarity(q_vec, centroid_vec)[0][0]
        if sim > best_sim:
            best_sim = sim
            best_topic = topic
    return best_topic


# Test questions covering all subjects
test_questions = [
    "Why does photosynthesis need light?",
    "What is Newton's second law of motion?",
    "How do you solve a quadratic equation?",
    "What caused World War 2?",
    "How does the internet work?",
    "What is the pH of hydrochloric acid?",
    "What are tectonic plates and how do they move?",
    "Which country has the largest population in Africa?",
    "What causes inflation in an economy?",
    "What is the central theme of Shakespeare's Hamlet?",
    "How does classical conditioning work in psychology?",
    "What is the role of the United Nations in global diplomacy?",
    "Who composed the Moonlight Sonata?",
    "What is Kant's categorical imperative?",
    "How does deforestation contribute to climate change?",
    "When did Beyonce release Lemonade?",
]

for test_q in test_questions:
    print(f"\n  Question : {test_q}")
    print(f"  AI Topic : {get_topic(test_q)}")
    print(f"  Similar  :")
    results = find_similar(test_q, top_k=3)
    for r in results:
        print(f"    [{r['score']}%] ({r['topic']}) {r['question'][:80]}")


# ============================================================
#   DONE
# ============================================================

print("\n" + "=" * 60)
print("  ALL DONE!")
print("=" * 60)
print(f"""
  Files created/updated:
    questions.json      -> {len(final_questions)} study questions with topics
    embeddings.npy      -> vector embeddings (shape: {embeddings.shape})
    topics.json         -> list of all {len(topics_list)} subject names
    db-store.json       -> {len(frontend_questions)} questions for frontend
    similarity_map.json -> pre-computed semantic matches (TOP_K={TOP_K_SIMILAR})
                           + topic centroids for AI classification

  Your frontend now has:
    - {len(frontend_questions)} real academic questions from {total_datasets} datasets
    - Pre-computed AI similarity for instant matching
    - Topic centroid vectors for smart classification
    - Coverage across {len(topics_list)} subjects worldwide
    - Balanced stratified sampling (min {MIN_PER_SUBJECT}/subject)
""")
