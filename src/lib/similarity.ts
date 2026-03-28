/** Extract key sentences from content — up to maxSentences, skipping very short ones. */
export function extractKeySentences(text: string, maxSentences = 5): string[] {
  const raw = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 8); // at least 8 words

  if (raw.length === 0) {
    // fallback: split on newlines / commas for short inputs (lyrics, etc.)
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 5)
      .slice(0, maxSentences);
  }

  // Spread selection evenly across the text
  if (raw.length <= maxSentences) return raw;
  const step = Math.floor(raw.length / maxSentences);
  return Array.from({ length: maxSentences }, (_, i) => raw[i * step]);
}

/** Jaccard similarity on word tokens (0–1). */
export function jaccardSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
    );
  const setA = normalize(a);
  const setB = normalize(b);
  let intersection = 0;
  setA.forEach((w) => { if (setB.has(w)) intersection++; });
  const union = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Longest-common-subsequence ratio (word-level, 0–1). */
export function lcsRatio(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const wordsB = b.toLowerCase().split(/\s+/).filter(Boolean);
  const m = wordsA.length;
  const n = wordsB.length;
  if (m === 0 || n === 0) return 0;

  // Avoid O(m*n) for large texts — cap at 200 words each
  const wA = wordsA.slice(0, 200);
  const wB = wordsB.slice(0, 200);
  const dp: number[][] = Array.from({ length: wA.length + 1 }, () =>
    new Array(wB.length + 1).fill(0)
  );
  for (let i = 1; i <= wA.length; i++) {
    for (let j = 1; j <= wB.length; j++) {
      dp[i][j] =
        wA[i - 1] === wB[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return (2 * dp[wA.length][wB.length]) / (wA.length + wB.length);
}

/** Combined similarity score (0–100). */
export function combinedSimilarity(query: string, candidate: string): number {
  const j = jaccardSimilarity(query, candidate);
  const l = lcsRatio(query, candidate);
  return Math.round(((j * 0.4 + l * 0.6) * 100 * 100) / 100);
}

/** Compute overall plagiarism score from per-phrase results. */
export function overallScore(matchScores: number[]): number {
  if (matchScores.length === 0) return 0;
  const avg = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;
  return Math.min(100, Math.round(avg));
}

/** Risk label for a score. */
export function riskLabel(score: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (score < 15)
    return { label: "Original", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  if (score < 35)
    return { label: "Low Risk", color: "text-lime-400", bg: "bg-lime-500/10 border-lime-500/30" };
  if (score < 55)
    return { label: "Moderate Risk", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" };
  if (score < 75)
    return { label: "High Risk", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" };
  return { label: "Severe", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" };
}
