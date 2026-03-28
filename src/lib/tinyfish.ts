export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface TinyfishStreamEvent {
  type: "STARTED" | "STREAMING_URL" | "PROGRESS" | "COMPLETE" | "HEARTBEAT";
  data: Record<string, unknown>;
}

const TINYFISH_BASE = "https://agent.tinyfish.ai";
const TIMEOUT_MS = 120_000;

function buildGoal(phrase: string, domain: string): string {
  const domainContext: Record<string, string> = {
    blog: "on blogs, news sites, or articles",
    research: "in academic papers, journals, or research sites",
    songs: "on lyrics sites like Genius, AZLyrics, or music databases",
    video: "in video descriptions, transcripts, or script sites",
    social: "on social media posts, forums, or community platforms",
    general: "across the web",
  };
  const ctx = domainContext[domain] ?? "across the web";

  return (
    `Go to https://www.google.com and search for this exact phrase: "${phrase}". ` +
    `Focus on finding results ${ctx}. ` +
    `Extract the top 5 search result items. ` +
    `Return ONLY a JSON array with this shape: ` +
    `[{"title":"...","url":"...","snippet":"..."}]. ` +
    `The snippet must include the actual text shown by Google for that result. ` +
    `Do not include any text outside the JSON array.`
  );
}

/** Stream SSE events from the Tinyfish browser agent. */
export async function* searchPhraseStream(
  phrase: string,
  domain: string,
  signal?: AbortSignal
): AsyncGenerator<TinyfishStreamEvent> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) throw new Error("TINYFISH_API_KEY not set");

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${TINYFISH_BASE}/v1/automation/run-sse`, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://www.google.com",
      goal: buildGoal(phrase, domain),
      browser_profile: "stealth",
    }),
    signal: combinedSignal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tinyfish HTTP ${res.status}: ${text}`);
  }
  if (!res.body) throw new Error("No response body from Tinyfish");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.trim().split("\n");
        let eventType = "";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim().toUpperCase();
          if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
        }
        if (!eventType || !dataStr) continue;
        try {
          const ev: TinyfishStreamEvent = {
            type: eventType as TinyfishStreamEvent["type"],
            data: JSON.parse(dataStr),
          };
          yield ev;
          if (ev.type === "COMPLETE") return;
        } catch {
          // skip malformed JSON
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export function parseSearchHits(raw: string): SearchHit[] {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return [];

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item: unknown) =>
          item && typeof item === "object" && "url" in (item as object)
      )
      .map((item: Record<string, unknown>) => ({
        title: String(item.title ?? ""),
        url: String(item.url ?? ""),
        snippet: String(item.snippet ?? item.description ?? item.text ?? ""),
      }))
      .filter((h) => h.url && h.url.startsWith("http"));
  } catch {
    return [];
  }
}
