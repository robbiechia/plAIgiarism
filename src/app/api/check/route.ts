import { NextRequest } from "next/server";
import { searchPhraseStream, parseSearchHits } from "@/lib/tinyfish";
import { combinedSimilarity, overallScore, exactMatchFlag } from "@/lib/similarity";
import { extractFingerprints, runLegitimacyFilter } from "@/lib/fingerprint";
import { getTargets } from "@/lib/targets";

export const maxDuration = 300;

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { content, domain } = await req.json();

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return new Response("Content too short", { status: 400 });
  }

  const text = content.trim();
  const dom = domain ?? "general";

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (type: string, data: unknown) => {
        try { controller.enqueue(enc.encode(sseEvent(type, data))); } catch { /* closed */ }
      };

      // ── Stage 1: Fingerprinting ───────────────────────────────────────────
      const fingerprints = extractFingerprints(text, dom, 3);
      const targets = getTargets(dom);

      // ── Stage 2: Legitimacy Filter ────────────────────────────────────────
      const legitimacy = runLegitimacyFilter(text, dom);
      send("legitimacy", legitimacy);

      send("start", {
        totalPhrases: fingerprints.length,
        targets: targets.map((t) => ({ url: t.url, label: t.label })),
        legitimacy,
      });

      // ── Stages 3–4: TinyFish Deep Search ─────────────────────────────────
      // For each fingerprint phrase, fire all domain targets in PARALLEL.
      // §Stage 4: "All target sites for a domain fire concurrently."

      const allMatchScores: number[] = [];
      const allSources: Array<{
        phrase: string;
        targetLabel: string;
        title: string;
        url: string;
        snippet: string;
        similarity: number;
        exactMatch: boolean;
      }> = [];

      for (let pi = 0; pi < fingerprints.length; pi++) {
        const phrase = fingerprints[pi];

        send("phrase_start", {
          phraseIndex: pi,
          phrase,
          targetCount: targets.length,
        });

        // Track best score across all targets for this phrase
        let bestPhraseScore = 0;

        // Fire all targets in parallel
        await Promise.allSettled(
          targets.map(async (target, ti) => {
            send("target_start", {
              phraseIndex: pi,
              targetIndex: ti,
              targetUrl: target.url,
              targetLabel: target.label,
              phrase,
            });

            const goal = target.goal(phrase);
            let resultRaw: string | null = null;

            try {
              for await (const event of searchPhraseStream(target.url, goal)) {
                if (event.type === "STREAMING_URL") {
                  send("browser_open", {
                    phraseIndex: pi,
                    targetIndex: ti,
                    targetLabel: target.label,
                    streamingUrl: event.data.streaming_url ?? null,
                  });
                } else if (event.type === "PROGRESS") {
                  send("browser_step", {
                    phraseIndex: pi,
                    targetIndex: ti,
                    targetLabel: target.label,
                    purpose: String(event.data.purpose ?? ""),
                  });
                } else if (event.type === "COMPLETE") {
                  resultRaw =
                    typeof event.data.result === "string"
                      ? event.data.result
                      : null;
                  send("browser_close", {
                    phraseIndex: pi,
                    targetIndex: ti,
                    targetLabel: target.label,
                  });
                }
              }
            } catch (err) {
              send("target_error", {
                phraseIndex: pi,
                targetIndex: ti,
                targetLabel: target.label,
                message: err instanceof Error ? err.message : "Search failed",
              });
              send("target_done", { phraseIndex: pi, targetIndex: ti, targetLabel: target.label, topScore: 0, hitCount: 0 });
              return;
            }

            const hits = resultRaw ? parseSearchHits(resultRaw) : [];

            const scored = hits
              .map((h) => {
                const candidate = h.snippet + " " + h.title;
                const sim = combinedSimilarity(phrase, candidate, legitimacy.isLegitimate);
                const exact = exactMatchFlag(phrase, candidate, 10);
                return { ...h, similarity: sim, exactMatch: exact };
              })
              .sort((a, b) => b.similarity - a.similarity);

            const topHit = scored[0];
            const topScore = topHit?.similarity ?? 0;

            if (topScore > bestPhraseScore) bestPhraseScore = topScore;

            if (topHit && topScore > 5) {
              allSources.push({
                phrase,
                targetLabel: target.label,
                ...topHit,
              });
            }

            send("target_done", {
              phraseIndex: pi,
              targetIndex: ti,
              targetLabel: target.label,
              phrase,
              topScore,
              hitCount: scored.length,
              hits: scored.slice(0, 3).map((h) => ({
                title: h.title,
                url: h.url,
                snippet: h.snippet,
                similarity: h.similarity,
                exactMatch: h.exactMatch,
              })),
            });
          })
        );

        allMatchScores.push(bestPhraseScore);

        send("phrase_done", {
          phraseIndex: pi,
          phrase,
          bestScore: bestPhraseScore,
        });
      }

      // ── Stage 5: Final Score ──────────────────────────────────────────────
      const final = overallScore(allMatchScores);

      const seen = new Set<string>();
      const uniqueSources = allSources
        .filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; })
        .sort((a, b) => b.similarity - a.similarity);

      send("complete", {
        score: final,
        matchedPhrases: allMatchScores.filter((s) => s > 5).length,
        totalPhrases: fingerprints.length,
        sources: uniqueSources,
        phraseScores: fingerprints.map((p, i) => ({
          phrase: p,
          score: allMatchScores[i] ?? 0,
        })),
        legitimacy,
        hasExactMatch: allSources.some((s) => s.exactMatch),
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
