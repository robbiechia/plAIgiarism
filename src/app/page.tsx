"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { riskLabel } from "@/lib/similarity";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Hit {
  title: string;
  url: string;
  snippet: string;
  similarity: number;
}

interface MatchEvent {
  step: number;
  phrase: string;
  topScore: number;
  hits: Hit[];
}

interface CompleteEvent {
  score: number;
  matchedPhrases: number;
  totalPhrases: number;
  sources: Array<{
    phrase: string;
    title: string;
    url: string;
    snippet: string;
    similarity: number;
  }>;
  phraseScores: Array<{ phrase: string; score: number }>;
}

interface ProgressItem {
  step: number;
  total: number;
  phrase: string;
  match?: MatchEvent;
  done: boolean;
}

interface BrowserStep {
  ts: number;
  text: string;
}

interface BrowserState {
  isActive: boolean;
  streamingUrl: string | null;
  steps: BrowserStep[];
  phraseLabel: string;
  phraseStep: number;
  iframeError: boolean;
}

// ─── Domain config ─────────────────────────────────────────────────────────────

const DOMAINS = [
  { id: "general",  label: "General",       icon: "🌐" },
  { id: "blog",     label: "Blog / Article", icon: "✍️" },
  { id: "research", label: "Research",       icon: "🔬" },
  { id: "songs",    label: "Song Lyrics",    icon: "🎵" },
  { id: "video",    label: "Video Script",   icon: "🎬" },
  { id: "social",   label: "Social Media",   icon: "📱" },
];

const EXAMPLES: Record<string, string> = {
  general:
    "The rapid advancement of artificial intelligence has transformed nearly every industry. From healthcare to finance, AI systems are now capable of performing complex tasks that once required human expertise.",
  blog:
    "In today's fast-paced digital landscape, content creators face an unprecedented challenge: standing out in a sea of information. The key to success lies not just in creating content, but in crafting stories that resonate.",
  research:
    "Recent studies indicate a strong correlation between social media usage and decreased attention spans in adolescents. This phenomenon, often termed digital attention deficit, poses significant implications for educational institutions worldwide.",
  songs:
    "I used to dream about the stars at night\nWishing I could fly above the city lights\nNow I'm standing here with nothing left to say\nWatching all my yesterdays just fade away",
  video:
    "Welcome back to another episode. Today we're going to explore the hidden secrets of the universe that scientists don't want you to know. Stay tuned because what I'm about to reveal will change everything you thought you knew.",
  social:
    "Just discovered that drinking coffee before 9am is actually bad for your cortisol levels! The best time to have your first cup is between 9:30-11:30am. This is the hack that changed my mornings forever.",
};

// ─── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor =
    score < 15 ? "#10b981" : score < 35 ? "#84cc16" :
    score < 55 ? "#eab308" : score < 75 ? "#f97316" : "#ef4444";
  const riskText =
    score < 15 ? "Original" : score < 35 ? "Low Risk" :
    score < 55 ? "Moderate" : score < 75 ? "High Risk" : "Severe";

  return (
    <svg viewBox="0 0 120 120" className="w-36 h-36">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#1f2d42" strokeWidth="10" />
      <circle cx="60" cy="60" r={radius} fill="none" stroke={strokeColor} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }} />
      <text x="60" y="54" textAnchor="middle" fill={strokeColor} fontSize="24" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x="60" y="70" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="sans-serif">{riskText}</text>
    </svg>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source, index }: {
  source: CompleteEvent["sources"][0];
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sim = source.similarity;
  const barColor = sim < 15 ? "bg-emerald-500" : sim < 35 ? "bg-lime-500" :
    sim < 55 ? "bg-yellow-500" : sim < 75 ? "bg-orange-500" : "bg-red-500";
  const textColor = sim < 15 ? "text-emerald-400" : sim < 35 ? "text-lime-400" :
    sim < 55 ? "text-yellow-400" : sim < 75 ? "text-orange-400" : "text-red-400";
  const domain = (() => { try { return new URL(source.url).hostname.replace("www.", ""); } catch { return source.url; } })();

  return (
    <div className="source-card rounded-xl border p-3.5 cursor-pointer hover:border-slate-500 transition-all"
      style={{ background: "var(--surface)", borderColor: "var(--border)", animationDelay: `${index * 70}ms`, opacity: 0, animationFillMode: "forwards" }}
      onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 mb-0.5 truncate">{domain}</p>
          <p className="text-sm text-slate-200 font-medium leading-snug line-clamp-2">{source.title || source.url}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className={`text-lg font-bold font-mono ${textColor}`}>{sim}%</div>
          <div className="text-xs text-slate-600">match</div>
        </div>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${sim}%`, transition: "width 0.7s ease" }} />
      </div>
      {expanded && (
        <div className="mt-3 space-y-1.5 pt-2.5 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            <span className="text-slate-600">Phrase: </span><em className="text-slate-400">{source.phrase}</em>
          </p>
          {source.snippet && (
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{source.snippet}</p>
          )}
          <a href={source.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors mt-1">
            View source
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Browser Panel ────────────────────────────────────────────────────────────

function BrowserPanel({ browser, totalPhrases }: { browser: BrowserState; totalPhrases: number }) {
  const logRef = useRef<HTMLDivElement>(null);
  const startTsRef = useRef<number>(0);

  useEffect(() => {
    if (browser.steps.length > 0 && startTsRef.current === 0) {
      startTsRef.current = browser.steps[0].ts;
    }
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [browser.steps]);

  const elapsed = (ts: number) => {
    const base = startTsRef.current || ts;
    const diff = Math.round((ts - base) / 1000);
    return `${diff}s`;
  };

  const isIdle = !browser.isActive && browser.steps.length === 0;

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {/* Browser chrome header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b" style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
        {/* Traffic lights */}
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
        </div>
        {/* URL bar */}
        <div className="flex-1 flex items-center gap-2 rounded-md px-2.5 py-1 text-xs min-w-0"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <svg className="w-3 h-3 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
          </svg>
          <span className="text-slate-500 truncate font-mono">
            {browser.streamingUrl
              ? (() => { try { return new URL(browser.streamingUrl).hostname; } catch { return "agent.tinyfish.ai"; } })()
              : "agent.tinyfish.ai"}
          </span>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {browser.isActive ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </>
          ) : browser.steps.length > 0 ? (
            <span className="text-xs text-slate-500">Done</span>
          ) : (
            <span className="text-xs text-slate-600">Idle</span>
          )}
        </div>
        {browser.streamingUrl && (
          <a href={browser.streamingUrl} target="_blank" rel="noopener noreferrer"
            className="flex-shrink-0 text-xs text-sky-500 hover:text-sky-400 transition-colors ml-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>

      {/* Viewport */}
      <div className="relative" style={{ height: "220px", background: "#0d1117" }}>
        {browser.streamingUrl && !browser.iframeError ? (
          <iframe
            key={browser.streamingUrl}
            src={browser.streamingUrl}
            className="w-full h-full border-0"
            title="Tinyfish browser agent"
            sandbox="allow-same-origin allow-scripts"
            onError={() => {/* handled via state */}}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            {isIdle ? (
              <>
                <div className="grid grid-cols-3 gap-1.5 opacity-20">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="w-8 h-1.5 rounded bg-slate-600" style={{ opacity: 0.3 + (i % 3) * 0.2 }} />
                  ))}
                </div>
                <p className="text-xs text-slate-600">Browser agent will appear here</p>
              </>
            ) : browser.streamingUrl && browser.iframeError ? (
              <div className="text-center px-6">
                <p className="text-xs text-slate-500 mb-2">Live stream blocked by browser security.</p>
                <a href={browser.streamingUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-2">
                  Watch in new tab →
                </a>
              </div>
            ) : (
              <div className="text-center">
                <div className="flex gap-1 justify-center mb-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-500"
                      style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {browser.phraseLabel
                    ? <>Searching phrase {browser.phraseStep} of {totalPhrases}</>
                    : "Connecting to browser agent…"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Phrase overlay badge */}
        {browser.isActive && browser.phraseLabel && (
          <div className="absolute bottom-2 left-2 right-2">
            <div className="rounded-md px-2.5 py-1.5 text-xs text-slate-400 truncate"
              style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-slate-600 mr-1.5">Phrase {browser.phraseStep}:</span>
              {browser.phraseLabel.length > 70 ? browser.phraseLabel.slice(0, 70) + "…" : browser.phraseLabel}
            </div>
          </div>
        )}
      </div>

      {/* Action log */}
      <div ref={logRef} className="overflow-y-auto px-3 py-2.5 space-y-0.5" style={{ maxHeight: "130px", background: "#0a0d14" }}>
        {browser.steps.length === 0 ? (
          <p className="text-xs text-slate-700 py-1">Waiting for browser actions…</p>
        ) : (
          browser.steps.map((step, i) => {
            const isLast = i === browser.steps.length - 1;
            return (
              <div key={i} className={`flex items-start gap-2.5 py-0.5 text-xs transition-all ${isLast && browser.isActive ? "text-slate-300" : "text-slate-500"}`}>
                <span className="font-mono text-slate-700 flex-shrink-0 tabular-nums w-6 text-right">{elapsed(step.ts)}</span>
                <span className={`flex-shrink-0 mt-0.5 ${isLast && browser.isActive ? "text-sky-400" : "text-slate-600"}`}>
                  {isLast && browser.isActive ? "▶" : "·"}
                </span>
                <span className="leading-relaxed">{step.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Progress Step ────────────────────────────────────────────────────────────

function ProgressStep({ item }: { item: ProgressItem }) {
  const isActive = !item.done && Boolean(item.phrase);
  const hasMatch = item.match && item.match.topScore > 5;

  return (
    <div className={`flex items-start gap-2.5 py-2 px-2.5 rounded-lg transition-all ${isActive ? "bg-sky-500/8 border border-sky-500/15" : "border border-transparent"}`}>
      <div className={`mt-0.5 w-4.5 h-4.5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold w-5 h-5 ${
        item.done ? hasMatch ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"
        : isActive ? "bg-sky-500/20 text-sky-400 animate-pulse" : "bg-slate-800 text-slate-600"}`}>
        {item.done ? hasMatch ? "!" : "✓" : isActive ? "…" : item.step}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-1">
          <span className="text-slate-600 mr-1">{isActive ? "Searching:" : item.done ? (hasMatch ? "Matched:" : "Clean:") : `Queued:`}</span>
          {item.phrase || "—"}
        </p>
        {item.done && item.match && item.match.topScore > 5 && (
          <p className="text-xs text-orange-400/80 mt-0.5">{item.match.topScore}% · {item.match.hits.length} source{item.match.hits.length !== 1 ? "s" : ""}</p>
        )}
        {item.done && (!item.match || item.match.topScore <= 5) && (
          <p className="text-xs text-emerald-600 mt-0.5">No match</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const IDLE_BROWSER: BrowserState = {
  isActive: false, streamingUrl: null, steps: [], phraseLabel: "", phraseStep: 0, iframeError: false,
};

export default function Home() {
  const [content, setContent] = useState("");
  const [domain, setDomain] = useState("general");
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [result, setResult] = useState<CompleteEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [browser, setBrowser] = useState<BrowserState>(IDLE_BROWSER);
  const abortRef = useRef<AbortController | null>(null);
  const progressRef = useRef<ProgressItem[]>([]);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  const loadExample = () => setContent(EXAMPLES[domain] ?? EXAMPLES.general);

  const handleCheck = useCallback(async () => {
    if (!content.trim() || content.trim().length < 20) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("checking");
    setProgress([]);
    setResult(null);
    setErrorMsg("");
    setBrowser({ ...IDLE_BROWSER });
    progressRef.current = [];

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, domain }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.trim().split("\n");
          let eventType = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          const payload = JSON.parse(dataStr);

          if (eventType === "start") {
            const items: ProgressItem[] = Array.from({ length: payload.total }, (_, i) => ({
              step: i + 1, total: payload.total, phrase: "", done: false,
            }));
            progressRef.current = items;
            setProgress(items);

          } else if (eventType === "progress") {
            progressRef.current = progressRef.current.map((p) =>
              p.step === payload.step ? { ...p, phrase: payload.phrase } : p
            );
            setProgress([...progressRef.current]);

          } else if (eventType === "browser_open") {
            const phrase = progressRef.current.find((p) => p.step === payload.step)?.phrase ?? "";
            setBrowser((prev) => ({
              ...prev,
              isActive: true,
              streamingUrl: payload.streamingUrl ?? null,
              phraseLabel: phrase,
              phraseStep: payload.step,
              steps: [
                ...prev.steps,
                { ts: Date.now(), text: "Browser agent started" },
              ],
            }));

          } else if (eventType === "browser_step") {
            if (payload.purpose) {
              setBrowser((prev) => ({
                ...prev,
                steps: [...prev.steps, { ts: Date.now(), text: String(payload.purpose) }],
              }));
            }

          } else if (eventType === "browser_close") {
            setBrowser((prev) => ({
              ...prev,
              isActive: false,
              steps: [...prev.steps, { ts: Date.now(), text: "Extraction complete" }],
            }));

          } else if (eventType === "match") {
            progressRef.current = progressRef.current.map((p) =>
              p.step === payload.step ? { ...p, phrase: payload.phrase, match: payload, done: true } : p
            );
            setProgress([...progressRef.current]);

          } else if (eventType === "error") {
            progressRef.current = progressRef.current.map((p) =>
              p.step === payload.step ? { ...p, done: true } : p
            );
            setProgress([...progressRef.current]);
            setBrowser((prev) => ({
              ...prev,
              isActive: false,
              steps: [...prev.steps, { ts: Date.now(), text: `Error: ${payload.message}` }],
            }));

          } else if (eventType === "complete") {
            setResult(payload);
            setStatus("done");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrorMsg((err as Error).message ?? "Something went wrong");
        setStatus("error");
      }
    }
  }, [content, domain]);

  const handleReset = () => {
    abortRef.current?.abort();
    setStatus("idle");
    setProgress([]);
    setResult(null);
    setErrorMsg("");
    setBrowser({ ...IDLE_BROWSER });
    progressRef.current = [];
  };

  const risk = result ? riskLabel(result.score) : null;
  const isRunning = status === "checking";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">P</div>
            <div>
              <h1 className="font-bold text-white text-base leading-none">PlagiarAI</h1>
              <p className="text-xs text-slate-600 leading-none mt-0.5">Powered by Tinyfish</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
            {isRunning ? "Agent running" : "Live web search"}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* 3-column grid: input | browser | results */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.6fr_1.8fr] gap-5">

          {/* ── Col 1: Input ── */}
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white">Detect <span className="gradient-text">Plagiarism</span></h2>
              <p className="text-slate-500 text-xs mt-1">Paste any content — AI searches the web for matches.</p>
            </div>

            {/* Domain selector */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Content Type</label>
              <div className="grid grid-cols-3 gap-1.5">
                {DOMAINS.map((d) => (
                  <button key={d.id} onClick={() => setDomain(d.id)} disabled={isRunning}
                    className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-xs transition-all ${
                      domain === d.id ? "border-sky-500 bg-sky-500/10 text-sky-300" : "border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}>
                    <span className="text-sm leading-none">{d.icon}</span>
                    <span className="font-medium text-center leading-tight">{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Your Content</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)}
                disabled={isRunning}
                placeholder={`Paste ${DOMAINS.find(d => d.id === domain)?.label.toLowerCase() ?? "content"} here…`}
                rows={11}
                className="w-full rounded-xl border resize-none text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/40 transition-all p-3.5 disabled:opacity-50"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }} />
              <p className="text-xs text-slate-700 mt-1 text-right">{wordCount} words</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={handleCheck} disabled={isRunning || content.trim().length < 20}
                className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: isRunning ? "#1f2937" : "linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)" }}>
                {isRunning ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Searching…
                  </span>
                ) : "Check for Plagiarism"}
              </button>
              <button onClick={loadExample} disabled={isRunning}
                className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-400 border border-slate-800 hover:border-slate-600 hover:text-slate-300 transition-all disabled:opacity-40">
                Example
              </button>
              {(isRunning || status === "done") && (
                <button onClick={handleReset}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-medium text-slate-400 border border-slate-800 hover:border-slate-600 hover:text-slate-300 transition-all">
                  Reset
                </button>
              )}
            </div>

            {status === "error" && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-3.5 text-xs text-red-400">{errorMsg}</div>
            )}

            {/* How it works */}
            {status === "idle" && !content && (
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">How it works</p>
                <ol className="space-y-2 text-xs text-slate-500">
                  {[["🧠","AI extracts key phrases"],["🌐","Tinyfish agent searches the web"],["👁️","Watch the browser work live"],["📊","Similarity scores per source"]].map(([icon,text],i)=>(
                    <li key={i} className="flex gap-2"><span>{icon}</span><span>{text}</span></li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {/* ── Col 2: Browser Panel ── */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Browser Agent</h3>
              <p className="text-xs text-slate-600 mt-0.5">Live view of Tinyfish searching the web</p>
            </div>
            <BrowserPanel browser={browser} totalPhrases={progress.length || 5} />

            {/* Mini progress list */}
            {progress.length > 0 && (
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Phrase Queue</p>
                <div className="space-y-0.5">
                  {progress.map((item) => (
                    item.phrase && <ProgressStep key={item.step} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Col 3: Results ── */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Results</h3>
              <p className="text-xs text-slate-600 mt-0.5">Similarity scores and matched sources</p>
            </div>

            {result ? (
              <div className="space-y-4 animate-fade-up">
                {/* Score card */}
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-4">
                    <ScoreGauge score={result.score} />
                    <div className="flex-1">
                      <p className="text-xs text-slate-600 mb-1">Plagiarism Score</p>
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${risk!.bg} ${risk!.color} mb-3`}>
                        {risk!.label}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg p-2" style={{ background: "var(--surface2)" }}>
                          <p className="text-slate-600 mb-0.5">Checked</p>
                          <p className="text-white font-semibold">{result.totalPhrases} phrases</p>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "var(--surface2)" }}>
                          <p className="text-slate-600 mb-0.5">Matched</p>
                          <p className={`font-semibold ${result.matchedPhrases > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {result.matchedPhrases} phrases
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Phrase bars */}
                  <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>
                    {result.phraseScores.map((ps, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 truncate flex-1 max-w-[120px] text-xs">
                          {ps.phrase.length > 40 ? ps.phrase.slice(0, 40) + "…" : ps.phrase}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-16 h-1 rounded-full bg-slate-800">
                            <div className={`h-full rounded-full ${ps.score < 15 ? "bg-emerald-500" : ps.score < 35 ? "bg-lime-500" : ps.score < 55 ? "bg-yellow-500" : ps.score < 75 ? "bg-orange-500" : "bg-red-500"}`}
                              style={{ width: `${ps.score}%`, transition: "width 0.8s ease" }} />
                          </div>
                          <span className={`w-7 text-right font-mono font-semibold text-xs ${ps.score < 15 ? "text-emerald-400" : ps.score < 35 ? "text-lime-400" : ps.score < 55 ? "text-yellow-400" : ps.score < 75 ? "text-orange-400" : "text-red-400"}`}>
                            {ps.score}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sources */}
                {result.sources.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {result.sources.length} Source{result.sources.length !== 1 ? "s" : ""} Found
                    </p>
                    <div className="space-y-2.5">
                      {result.sources.sort((a, b) => b.similarity - a.similarity).map((src, i) => (
                        <SourceCard key={`${src.url}-${i}`} source={src} index={i} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
                    <div className="text-2xl mb-1.5">✅</div>
                    <p className="text-emerald-400 font-semibold text-sm">No significant matches</p>
                    <p className="text-slate-600 text-xs mt-1">Content appears to be original.</p>
                  </div>
                )}

                <p className="text-xs text-slate-700 leading-relaxed">
                  Results reflect textual similarity with publicly indexed content via Tinyfish web agent. For reference only.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border flex flex-col items-center justify-center p-10 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)", minHeight: "280px" }}>
                {isRunning ? (
                  <>
                    <div className="flex gap-1 mb-3">
                      {[0,1,2].map(i=>(
                        <div key={i} className="w-2 h-2 rounded-full bg-sky-600"
                          style={{ animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
                      ))}
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Analyzing…</p>
                    <p className="text-slate-600 text-xs mt-1">Results will appear as searches complete</p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl mb-3 opacity-30">📋</div>
                    <p className="text-slate-500 text-sm">Results will appear here</p>
                    <p className="text-slate-700 text-xs mt-1">Run a check to see plagiarism scores</p>
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      </main>

      <footer className="border-t py-3 text-center text-xs text-slate-700" style={{ borderColor: "var(--border)" }}>
        PlagiarAI · Built with{" "}
        <a href="https://tinyfish.ai" target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:text-sky-500 transition-colors">Tinyfish</a>
        {" "}web agent
      </footer>

      <style jsx global>{`
        @keyframes bounce {
          0%,100%{transform:translateY(0)}
          50%{transform:translateY(-6px)}
        }
      `}</style>
    </div>
  );
}
