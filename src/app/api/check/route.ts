import { NextRequest } from "next/server";
import { searchPhraseStream, parseSearchHits } from "@/lib/tinyfish";
import {
  extractKeySentences,
  combinedSimilarity,
  overallScore,
} from "@/lib/similarity";

export const maxDuration = 300;

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { content, domain } = await req.json();

  if (!content || typeof content !== "string" || content.trim().length < 20) {
    return new Response("Content too short", { status: 400 });
  }

  const sentences = extractKeySentences(content.trim(), 5);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (type: string, data: unknown) => {
        controller.enqueue(enc.encode(sseEvent(type, data)));
      };

      send("start", { total: sentences.length });

      const allMatchScores: number[] = [];
      const allSources: Array<{
        phrase: string;
        title: string;
        url: string;
        snippet: string;
        similarity: number;
      }> = [];

      for (let i = 0; i < sentences.length; i++) {
        const phrase = sentences[i];
        send("progress", {
          step: i + 1,
          total: sentences.length,
          phrase,
          status: "searching",
        });

        let resultRaw: string | null = null;

        try {
          for await (const event of searchPhraseStream(phrase, domain ?? "general")) {
            if (event.type === "STREAMING_URL") {
              send("browser_open", {
                step: i + 1,
                streamingUrl: event.data.streaming_url ?? null,
              });
            } else if (event.type === "PROGRESS") {
              send("browser_step", {
                step: i + 1,
                purpose: String(event.data.purpose ?? ""),
              });
            } else if (event.type === "COMPLETE") {
              resultRaw = typeof event.data.result === "string"
                ? event.data.result
                : null;
              send("browser_close", {
                step: i + 1,
                status: event.data.status ?? "COMPLETED",
              });
            }
          }
        } catch (err) {
          send("error", {
            step: i + 1,
            phrase,
            message: err instanceof Error ? err.message : "Search failed",
          });
          allMatchScores.push(0);
          continue;
        }

        const hits = resultRaw ? parseSearchHits(resultRaw) : [];

        const scored = hits
          .map((h) => ({
            ...h,
            similarity: combinedSimilarity(phrase, h.snippet + " " + h.title),
          }))
          .sort((a, b) => b.similarity - a.similarity);

        const topHit = scored[0];
        const phraseScore = topHit ? topHit.similarity : 0;
        allMatchScores.push(phraseScore);

        if (topHit && topHit.similarity > 5) {
          allSources.push({ phrase, ...topHit });
        }

        send("match", {
          step: i + 1,
          phrase,
          topScore: phraseScore,
          hits: scored.slice(0, 3).map((h) => ({
            title: h.title,
            url: h.url,
            snippet: h.snippet,
            similarity: h.similarity,
          })),
        });
      }

      const final = overallScore(allMatchScores);

      const seen = new Set<string>();
      const uniqueSources = allSources.filter((s) => {
        if (seen.has(s.url)) return false;
        seen.add(s.url);
        return true;
      });

      send("complete", {
        score: final,
        matchedPhrases: allMatchScores.filter((s) => s > 5).length,
        totalPhrases: sentences.length,
        sources: uniqueSources,
        phraseScores: sentences.map((p, idx) => ({
          phrase: p,
          score: allMatchScores[idx] ?? 0,
        })),
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
