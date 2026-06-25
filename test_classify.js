// Test script using the new server.js logic
import { readFileSync } from 'fs';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const genericTopicWords = new Set(['general', 'knowledge', 'science']);

// Copy of the NEW expanded keywordMap from server.js
const keywordMap = {
  Biology: [
    'plant','plants','leaf','leaves','digestive','digestion','digest',
    'heart','cardiac','blood','brain','neural','nervous','muscle','muscular',
    'skeletal','skeleton','bone','bones','organ','organs','tissue','tissues',
    'lung','lungs','respiratory','respiration','breathing',
    'gene','genes','genetic','genetics','dna','rna','cell','cells','cellular',
    'membrane','nucleus','cytoplasm','mitochondria','chromosome',
    'biology','biological','organism','organisms','anatomy','physiology',
    'metabolism','osmosis','diffusion','mitosis','meiosis',
    'virus','viruses','bacteria','bacterial','immune','immunity',
    'ecosystem','ecology','species','evolution','evolutionary',
  ],
  Chemistry: [
    'atom','atoms','atomic','molecule','molecules','molecular','element','elements',
    'compound','compounds','acid','acids','acidic','base','basic','alkali','alkaline',
    'reaction','reactions','bond','bonds','bonding','covalent','ionic',
    'electron','electrons','proton','protons','neutron','neutrons',
    'periodic','solution','solutions','chemical','chemistry',
  ],
  Physics: [
    'force','forces','newton','gravity','gravitational','weight','mass',
    'motion','velocity','speed','acceleration','momentum','energy','kinetic','potential',
    'light','optics','reflection','refraction','wave','waves','sound',
    'heat','temperature','thermodynamics','electric','electricity','charge','current','voltage',
    'magnet','magnetic','magnetism','physics','physical','mechanics',
  ],
  Mathematics: [
    'equation','equations','algebra','algebraic','calculus','geometry','geometric',
    'number','numbers','integer','fraction','fractions','decimal','percentage',
    'angle','angles','triangle','triangles','circle','circles','area','volume',
    'theorem','theorems','probability','statistics','mean','median','mode',
    'derivative','integral','logarithm','math','mathematics','arithmetic','trigonometry',
    'polynomial','quadratic','linear','sequence','series',
  ],
  'Political Science': [
    'government','governments','governance','politics','political',
    'democracy','democratic','republic','monarchy','dictatorship',
    'constitution','constitutional','election','elections','voting','vote',
    'law','laws','legal','parliament','congress','senate',
    'policy','policies','rights','freedom','liberty',
    'president','prime minister','cabinet','legislature',
  ],
  Geography: [
    'country','countries','nation','nations','continent','continents',
    'river','rivers','mountain','mountains','capital','capitals','city','cities',
    'ocean','oceans','sea','seas','lake','lakes','island','islands',
    'map','maps','latitude','longitude','geography','geographical',
    'desert','deserts','forest','forests',
  ],
};

const topics = JSON.parse(readFileSync('backend/topics.json', 'utf8'));

function classifyTopic(question, topics) {
  const text = normalizeText(question);
  const wordArr = text.split(' ').filter(Boolean);
  const words = new Set(wordArr);
  const topicScores = new Map(topics.map((topic) => [topic, 0]));

  // Pass 1 — topic name word overlap
  for (const topic of topics) {
    const topicWords = normalizeText(topic).split(' ');
    for (const word of topicWords) {
      if (genericTopicWords.has(word)) continue;
      if (word.length > 2 && words.has(word)) {
        topicScores.set(topic, (topicScores.get(topic) || 0) + 2);
      }
    }
  }

  // Pass 2 — keyword map: exact + substring match
  for (const [topic, keywords] of Object.entries(keywordMap)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeText(keyword);
      const isPhrase = normalizedKeyword.includes(' ');
      let matches = false;
      if (isPhrase) {
        matches = text.includes(normalizedKeyword);
      } else {
        if (words.has(normalizedKeyword)) {
          matches = true;
        } else {
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
    if (score > bestScore) { bestTopic = topic; bestScore = score; }
  }

  const nonZero = Object.fromEntries([...topicScores.entries()].filter(([,v])=>v>0));
  console.log('  Scores:', nonZero);
  return bestTopic || 'General Science';
}

const tests = [
  'functions of heart',
  'human digestive system',
  'what is photosynthesis',
  'types of chemical bonds',
  'newton laws of motion',
  'quadratic equation',
  'capital of france',
  'what is democracy',
  'cell membrane function',
  'muscular and skeletal system',
  'circulatory system in humans',
  'nervous system function',
  'laws of thermodynamics',
  'ecosystem and food chain',
  'election and voting process',
  'photosynthesis in plants',
];

for (const q of tests) {
  const result = classifyTopic(q, topics);
  const ok = result !== 'General Science' && result !== 'General Knowledge';
  console.log(`${ok ? '✅' : '⚠️'} "${q}" => ${result}\n`);
}
