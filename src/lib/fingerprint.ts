/**
 * Fingerprint extraction and legitimacy filter.
 * Implements FRAMEWORK.md §Stage 1A and §Stage 2.
 */

// Common English stop words — content words outside this set score higher
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","up","about","into","through","after","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","will","would","could",
  "should","may","might","shall","can","this","that","these","those","it","its",
  "i","we","you","he","she","they","my","our","your","his","her","their",
  "not","no","so","as","if","then","than","because","when","where","how",
  "what","which","who","whom","all","each","every","some","any","many","most",
  "also","just","more","very","too","only","even","still","here","there",
]);

/**
 * Score a sentence by how "distinctive" it is as a fingerprint.
 * Higher = more likely to uniquely identify plagiarism.
 */
function distinctivenessScore(sentence: string): number {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length < 6) return 0;

  const contentWords = words.filter(
    (w) => !STOP_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")) && w.length > 3
  );
  // Proper nouns (capitalised mid-sentence) — strong uniqueness signal
  const properNouns = words.slice(1).filter((w) => /^[A-Z]/.test(w)).length;
  // Presence of numbers, dates, percentages — specific claims are highly distinctive
  const specifics = (sentence.match(/\d+[%$]?|\b\d{4}\b/g) ?? []).length;
  // Long sentences are harder to accidentally reproduce
  const lengthBonus = Math.min(words.length / 20, 1);

  return contentWords.length * 1.5 + properNouns * 2 + specifics * 2 + lengthBonus;
}

/**
 * Extract the most distinctive fingerprint phrases from content.
 * Implements §Stage 1A: extract minimal distinctive signals, not the full text.
 */
export function extractFingerprints(
  text: string,
  domain: string,
  n = 3
): string[] {
  // For songs/lyrics: split on newlines first, then by punctuation
  const rawSentences =
    domain === "songs"
      ? text
          .split(/\n+/)
          .map((s) => s.trim())
          .filter((s) => s.split(/\s+/).length >= 5)
      : text
          .replace(/\n+/g, " ")
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.split(/\s+/).length >= 7);

  if (rawSentences.length === 0) {
    // Fallback: split by comma / newline
    return text
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 5)
      .slice(0, n);
  }

  // Score and sort by distinctiveness
  const scored = rawSentences
    .map((s) => ({ s, score: distinctivenessScore(s) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Pick top N, spreading across the text for coverage
  if (scored.length <= n) return scored.map((x) => x.s);

  // Take top 1 (highest distinctiveness), spread the rest evenly
  const top = scored[0].s;
  const rest = rawSentences
    .filter((s) => s !== top)
    .filter((s) => distinctivenessScore(s) > 0);

  const step = Math.floor(rest.length / (n - 1));
  const spread = Array.from({ length: n - 1 }, (_, i) => rest[i * step] ?? rest[rest.length - 1]);

  return [top, ...spread].slice(0, n);
}

// ─── Legitimacy Filter ─────────────────────────────────────────────────────────

export interface LegitimacyResult {
  isLegitimate: boolean;
  markers: string[];
  note: string;
}

const ATTRIBUTION_PATTERNS = [
  { pattern: /\bsource\s*:/i, label: "source citation" },
  { pattern: /\bcredit\s*:/i, label: "credit marker" },
  { pattern: /\bvia\s+@?\w+/i, label: "via attribution" },
  { pattern: /©|copyright\s+\d{4}/i, label: "copyright notice" },
  { pattern: /\b(CC0|CC BY|CC BY-SA|CC BY-NC|Creative Commons)\b/i, label: "Creative Commons license" },
  { pattern: /\b(MIT License|Apache License|GPL|BSD License|public domain)\b/i, label: "open source license" },
  { pattern: /\[\d+\]|\(\w[\w\s]*,\s*\d{4}\)/i, label: "academic citation" },
  { pattern: /\bdoi\s*:\s*10\.\d{4}/i, label: "DOI reference" },
  { pattern: /\bretweet\b|^RT\s+@/im, label: "platform retweet" },
  { pattern: /\boriginally published\b|\breprinted with permission\b/i, label: "reprint attribution" },
];

const DOMAIN_SPECIFIC: Record<string, Array<{ pattern: RegExp; label: string }>> = {
  songs: [
    { pattern: /\bcover\s+(of|version)\b/i, label: "cover song declaration" },
    { pattern: /\bremix\b/i, label: "remix declaration" },
    { pattern: /\bsampling\b|\bsampled\b/i, label: "sampling disclosure" },
  ],
  blog: [
    { pattern: /\bsyndicated\b|\boriginally appeared\b/i, label: "syndication marker" },
    { pattern: /\bguest post\b/i, label: "guest post" },
  ],
  research: [
    { pattern: /\bself-plagiarism\b|\bpreviously published\b/i, label: "self-citation note" },
    { pattern: /\bpeer.reviewed\b/i, label: "peer review marker" },
  ],
};

/**
 * Run the legitimacy filter before any TinyFish search.
 * Implements §Stage 2: eliminate legitimate reuse, avoid false positives.
 */
export function runLegitimacyFilter(
  content: string,
  domain: string
): LegitimacyResult {
  const markers: string[] = [];

  for (const { pattern, label } of ATTRIBUTION_PATTERNS) {
    if (pattern.test(content)) markers.push(label);
  }

  for (const { pattern, label } of DOMAIN_SPECIFIC[domain] ?? []) {
    if (pattern.test(content)) markers.push(label);
  }

  if (markers.length === 0) {
    return { isLegitimate: false, markers: [], note: "No attribution markers detected. Proceeding with search." };
  }

  const isStrong = markers.some((m) =>
    ["Creative Commons license", "open source license", "DOI reference", "academic citation", "platform retweet"].includes(m)
  );

  return {
    isLegitimate: isStrong,
    markers,
    note: isStrong
      ? `Legitimate reuse markers found (${markers.join(", ")}). Flagging as likely legitimate — search continues for verification.`
      : `Attribution markers present (${markers.join(", ")}). Reducing match weight.`,
  };
}
