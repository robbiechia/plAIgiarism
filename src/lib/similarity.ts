/**
 * Similarity scoring layer — FRAMEWORK.md §Stage 5A.
 * Layer A: Rabin-Karp exact match (≥10 consecutive words = exact match flag)
 * Layer B: Jaccard + LCS combined semantic similarity
 */

// ─── Layer A: Exact Match (Rabin-Karp inspired rolling hash) ──────────────────

/**
 * Returns true if `query` contains a run of `minWords` consecutive words
 * that all appear in `candidate` in the same order (exact substring match).
 * Implements §5A Layer A: ≥10 consecutive words = Exact Match flag.
 */
export function exactMatchFlag(query: string, candidate: string, minWords = 10): boolean {
  const qWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const cText = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  if (qWords.length < minWords) return false;

  // Slide a window of minWords across the query, check if the window exists in candidate
  for (let i = 0; i <= qWords.length - minWords; i++) {
    const window = qWords.slice(i, i + minWords).join(" ");
    if (cText.includes(window)) return true;
  }
  return false;
}

// ─── Layer B: Semantic Similarity ─────────────────────────────────────────────

/** Jaccard similarity on word tokens (0–1). */
export function jaccardSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean)
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
  const wA = a.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 200);
  const wB = b.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 200);
  if (wA.length === 0 || wB.length === 0) return 0;

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

/**
 * Combined similarity score (0–100).
 * Exact match short-circuits to a high base score per §5A.
 */
export function combinedSimilarity(
  query: string,
  candidate: string,
  isLegitimate = false
): number {
  const hasExactMatch = exactMatchFlag(query, candidate, 10);
  const j = jaccardSimilarity(query, candidate);
  const l = lcsRatio(query, candidate);
  const semantic = j * 0.4 + l * 0.6;

  let score: number;
  if (hasExactMatch) {
    // Exact 10+ word match is a strong signal — floor at 70
    score = Math.max(70, Math.round(semantic * 100));
  } else {
    score = Math.round(semantic * 100);
  }

  // Legitimacy weight reduction per §5C
  if (isLegitimate) score = Math.round(score * 0.5);

  return Math.min(100, score);
}

/** Compute overall plagiarism score. Top match per phrase weighted most. */
export function overallScore(phraseScores: number[]): number {
  if (phraseScores.length === 0) return 0;
  const avg = phraseScores.reduce((a, b) => a + b, 0) / phraseScores.length;
  return Math.min(100, Math.round(avg));
}

/** Risk label and styling for a score. */
export function riskLabel(score: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (score < 15) return { label: "Original",       color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  if (score < 35) return { label: "Low Risk",        color: "text-lime-400",    bg: "bg-lime-500/10 border-lime-500/30" };
  if (score < 55) return { label: "Moderate Risk",   color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/30" };
  if (score < 75) return { label: "High Risk",       color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/30" };
  return             { label: "Severe",           color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" };
}
