"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { riskLabel } from "@/lib/similarity";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TargetStatus {
  targetIndex: number;
  targetLabel: string;
  targetUrl: string;
  status: "pending" | "searching" | "done" | "error";
  topScore: number;
  hitCount: number;
  hits: Array<{ title: string; url: string; snippet: string; similarity: number; exactMatch: boolean }>;
}

interface PhraseRow {
  phraseIndex: number;
  phrase: string;
  targets: TargetStatus[];
  bestScore: number;
  done: boolean;
}

interface LegitimacyResult {
  isLegitimate: boolean;
  markers: string[];
  note: string;
}

interface CompleteEvent {
  score: number;
  matchedPhrases: number;
  totalPhrases: number;
  sources: Array<{
    phrase: string;
    targetLabel: string;
    title: string;
    url: string;
    snippet: string;
    similarity: number;
    exactMatch: boolean;
  }>;
  phraseScores: Array<{ phrase: string; score: number }>;
  legitimacy: LegitimacyResult;
  hasExactMatch: boolean;
}

interface AgentTab {
  id: string; // `${phraseIndex}-${targetIndex}`
  phraseIndex: number;
  targetIndex: number;
  targetLabel: string;
  phrase: string;
  streamingUrl: string | null;
  steps: Array<{ ts: number; text: string }>;
  status: "active" | "done" | "error";
}

interface FindEntry {
  targetLabel: string;
  title: string;
  snippet: string;
  similarity: number;
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
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const stroke = score < 15 ? "#10b981" : score < 35 ? "#84cc16" : score < 55 ? "#eab308" : score < 75 ? "#f97316" : "#ef4444";
  const label = score < 15 ? "Original" : score < 35 ? "Low Risk" : score < 55 ? "Moderate" : score < 75 ? "High Risk" : "Severe";

  return (
    <svg viewBox="0 0 120 120" className="w-36 h-36 flex-shrink-0">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#1f2d42" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={stroke} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }} />
      <text x="60" y="54" textAnchor="middle" fill={stroke} fontSize="24" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x="60" y="70" textAnchor="middle" fill="#64748b" fontSize="9.5" fontFamily="sans-serif">{label}</text>
    </svg>
  );
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({ source, index }: { source: CompleteEvent["sources"][0]; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const s = source.similarity;
  const barCls = s < 15 ? "bg-emerald-500" : s < 35 ? "bg-lime-500" : s < 55 ? "bg-yellow-500" : s < 75 ? "bg-orange-500" : "bg-red-500";
  const textCls = s < 15 ? "text-emerald-400" : s < 35 ? "text-lime-400" : s < 55 ? "text-yellow-400" : s < 75 ? "text-orange-400" : "text-red-400";
  const domain = (() => { try { return new URL(source.url).hostname.replace("www.", ""); } catch { return source.url; } })();

  return (
    <div className="source-card rounded-xl border p-3.5 cursor-pointer hover:border-slate-500 transition-all"
      style={{ background: "var(--surface)", borderColor: "var(--border)", animationDelay: `${index * 70}ms`, opacity: 0, animationFillMode: "forwards" }}
      onClick={() => setExpanded(!expanded)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-slate-600">{domain}</span>
            <span className="text-xs text-slate-700">·</span>
            <span className="text-xs text-slate-600">{source.targetLabel}</span>
            {source.exactMatch && (
              <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/25 rounded px-1.5 py-0.5 font-medium">
                exact match
              </span>
            )}
          </div>
          <p className="text-sm text-slate-200 font-medium leading-snug line-clamp-2">{source.title || source.url}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className={`text-lg font-bold font-mono ${textCls}`}>{s}%</div>
          <div className="text-xs text-slate-600">match</div>
        </div>
      </div>
      <div className="mt-2.5 h-1 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${s}%`, transition: "width 0.7s ease" }} />
      </div>
      {expanded && (
        <div className="mt-3 space-y-1.5 pt-2.5 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-xs text-slate-500 line-clamp-2">
            <span className="text-slate-600">Phrase: </span><em className="text-slate-400">{source.phrase}</em>
          </p>
          {source.snippet && (
            <p className="text-xs text-slate-600 line-clamp-2">{source.snippet}</p>
          )}
          <a href={source.url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 mt-1">
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

// ─── Target Badge ─────────────────────────────────────────────────────────────

function TargetBadge({ t }: { t: TargetStatus }) {
  const scoreCls = t.topScore >= 70 ? "text-red-400" : t.topScore >= 40 ? "text-orange-400" : t.topScore >= 15 ? "text-yellow-400" : "text-emerald-400";
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-all ${
      t.status === "searching" ? "border-sky-500/40 bg-sky-500/8 text-sky-300" :
      t.status === "done" && t.topScore > 5 ? "border-orange-500/30 bg-orange-500/8 text-slate-300" :
      t.status === "done" ? "border-emerald-500/20 bg-emerald-500/5 text-slate-500" :
      t.status === "error" ? "border-red-500/20 text-slate-600" :
      "border-slate-800 text-slate-600"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        t.status === "searching" ? "bg-sky-400 animate-pulse" :
        t.status === "done" && t.topScore > 5 ? "bg-orange-400" :
        t.status === "done" ? "bg-emerald-500" :
        t.status === "error" ? "bg-red-500/50" :
        "bg-slate-700"
      }`} />
      <span className="font-medium">{t.targetLabel}</span>
      {t.status === "done" && (
        <span className={`font-mono font-semibold ${scoreCls}`}>{t.topScore}%</span>
      )}
    </div>
  );
}

// ─── Phrase Progress Row ──────────────────────────────────────────────────────

function PhraseRow({ row }: { row: PhraseRow }) {
  const scoreColor = row.bestScore >= 70 ? "text-red-400" : row.bestScore >= 40 ? "text-orange-400" :
    row.bestScore >= 15 ? "text-yellow-400" : row.bestScore > 0 ? "text-emerald-400" : "text-slate-600";

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
          row.done
            ? row.bestScore > 5 ? "bg-orange-500/20 text-orange-400" : "bg-emerald-500/20 text-emerald-400"
            : row.targets.some(t => t.status === "searching") ? "bg-sky-500/20 text-sky-400 animate-pulse"
            : "bg-slate-800 text-slate-600"
        }`}>
          {row.done ? (row.bestScore > 5 ? "!" : "✓") : row.targets.some(t => t.status === "searching") ? "…" : row.phraseIndex + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 line-clamp-1 mb-1.5">{row.phrase || "—"}</p>
          <div className="flex flex-wrap gap-1.5">
            {row.targets.map((t) => (
              <TargetBadge key={t.targetIndex} t={t} />
            ))}
          </div>
        </div>
        {row.done && (
          <span className={`text-sm font-bold font-mono flex-shrink-0 ${scoreColor}`}>
            {row.bestScore}%
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Step icon classifier ─────────────────────────────────────────────────────

function stepIcon(text: string): { icon: string; color: string } {
  const t = text.toLowerCase();
  if (t.includes("navigat") || t.includes("go to") || t.includes("open") || t.includes("visit"))
    return { icon: "🌐", color: "text-sky-400" };
  if (t.includes("search") || t.includes("type") || t.includes("enter") || t.includes("query") || t.includes("input"))
    return { icon: "🔍", color: "text-violet-400" };
  if (t.includes("click") || t.includes("select") || t.includes("press") || t.includes("tap"))
    return { icon: "👆", color: "text-amber-400" };
  if (t.includes("extract") || t.includes("found") || t.includes("collect") || t.includes("read") || t.includes("retriev"))
    return { icon: "📋", color: "text-emerald-400" };
  if (t.includes("scroll") || t.includes("wait") || t.includes("load"))
    return { icon: "⏳", color: "text-slate-400" };
  if (t.includes("complete") || t.includes("done") || t.includes("finish") || t.includes("success"))
    return { icon: "✅", color: "text-emerald-400" };
  if (t.includes("error") || t.includes("fail") || t.includes("block"))
    return { icon: "⚠️", color: "text-red-400" };
  return { icon: "▸", color: "text-slate-500" };
}

// ─── Browser Panel (tabbed per-agent) ────────────────────────────────────────

function BrowserPanel({ agents }: { agents: AgentTab[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-select the most recently activated agent
  useEffect(() => {
    const active = [...agents].reverse().find((a) => a.status === "active");
    if (active) setActiveId(active.id);
    else if (agents.length > 0 && !activeId) setActiveId(agents[agents.length - 1].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length, agents.filter(a => a.status === "active").length]);

  // Auto-scroll log on new steps
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [activeId, agents]);

  const selected = agents.find((a) => a.id === activeId) ?? agents[agents.length - 1] ?? null;
  const startTs = selected?.steps[0]?.ts ?? 0;
  const elapsed = (ts: number) => `+${Math.round((ts - (startTs || ts)) / 1000)}s`;
  const lastStep = selected?.steps[selected.steps.length - 1];
  const isActive = selected?.status === "active";

  if (agents.length === 0) {
    return (
      <div className="rounded-xl border flex flex-col items-center justify-center gap-2 opacity-30"
        style={{ borderColor: "var(--border)", background: "var(--surface)", height: "420px" }}>
        <div className="text-3xl">🌐</div>
        <p className="text-xs text-slate-600">Browser agents will appear here</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border overflow-hidden flex flex-col" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>

      {/* ── Tab bar ── */}
      <div className="flex items-center border-b overflow-x-auto" style={{ borderColor: "var(--border)", background: "var(--surface2)", scrollbarWidth: "none" }}>
        {agents.map((agent) => {
          const isSelected = agent.id === activeId;
          const dotCls = agent.status === "active" ? "bg-emerald-400 animate-pulse" : agent.status === "error" ? "bg-red-400" : "bg-slate-600";
          return (
            <button
              key={agent.id}
              onClick={() => setActiveId(agent.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${
                isSelected
                  ? "border-sky-500 text-sky-300 bg-sky-500/8"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
              <span className="font-medium">{agent.targetLabel}</span>
              {agent.status === "done" && (
                <span className="text-slate-700 text-xs">✓</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Viewport ── */}
      <div className="relative" style={{ height: "260px", background: "#0d1117" }}>
        {selected?.streamingUrl ? (
          <>
            <iframe
              key={selected.streamingUrl}
              src={selected.streamingUrl}
              className="w-full h-full border-0"
              title={`${selected.targetLabel} live browser`}
              allow="autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share; cross-origin-isolated"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
              {isActive && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium rounded-md px-2 py-1"
                  style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(16,185,129,0.25)" }}>
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  Live
                </span>
              )}
              <a href={selected.streamingUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-white rounded-md px-2 py-1 transition-all font-medium"
                style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Pop out
              </a>
            </div>
          </>
        ) : (
          /* Skeleton while waiting for streaming URL */
          <div className="flex flex-col h-full">
            <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "#1a2235", background: "#0f1623" }}>
              <div className="w-3 h-3 rounded-full border-2 border-t-sky-400 border-sky-500/30 animate-spin flex-shrink-0" />
              <div className="flex-1 text-xs font-mono text-slate-500 truncate">
                {selected ? `Connecting to ${selected.targetLabel}…` : "Waiting…"}
              </div>
            </div>
            <div className="flex-1 p-4 space-y-3">
              <div className="flex gap-2 mb-4">
                <div className="flex-1 h-7 rounded-full bg-slate-800/80 animate-pulse" />
                <div className="w-14 h-7 rounded-full bg-slate-800/50 animate-pulse" />
              </div>
              {[100, 80, 65, 50].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 rounded-full bg-sky-900/40 animate-pulse" style={{ width: `${w * 0.55}%` }} />
                  <div className="h-2 rounded-full bg-slate-800/60 animate-pulse" style={{ width: `${w}%` }} />
                  <div className="h-2 rounded-full bg-slate-800/40 animate-pulse" style={{ width: `${w * 0.75}%` }} />
                </div>
              ))}
            </div>
            {lastStep && (
              <div className="px-3 pb-3">
                <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2"
                  style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.15)" }}>
                  <span className="animate-pulse">{stepIcon(lastStep.text).icon}</span>
                  <span className="text-slate-400 truncate">{lastStep.text}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Action log for selected agent ── */}
      <div ref={logRef} className="overflow-y-auto" style={{ maxHeight: "140px", background: "#080b11" }}>
        {!selected || selected.steps.length === 0 ? (
          <p className="text-xs text-slate-700 px-3 py-2">Waiting for browser actions…</p>
        ) : (
          <div className="py-1.5">
            {selected.steps.map((step, i) => {
              const isLast = i === selected.steps.length - 1;
              const { icon, color } = stepIcon(step.text);
              return (
                <div key={i} className={`flex items-start gap-2.5 px-3 py-1 text-xs transition-colors ${isLast && isActive ? "bg-sky-950/30" : ""}`}>
                  <span className="font-mono text-slate-700 w-7 text-right flex-shrink-0 tabular-nums pt-0.5">
                    {elapsed(step.ts)}
                  </span>
                  <span className={`flex-shrink-0 text-sm leading-none pt-px ${isLast && isActive ? color : "opacity-40"}`}>
                    {icon}
                  </span>
                  <span className={isLast && isActive ? "text-slate-300 flex-1 min-w-0 truncate" : "text-slate-600 flex-1 min-w-0 truncate"}>
                    {step.text}
                  </span>
                  {isLast && isActive && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tinyfish Finds Box ───────────────────────────────────────────────────────

function TinyfishFindsBox({ finds }: { finds: FindEntry[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [finds, collapsed]);

  if (finds.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border shadow-2xl overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 border-b text-xs hover:bg-white/5 transition-colors"
        style={{ borderColor: "var(--border)", background: "var(--surface2)" }}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
          </span>
          <span className="font-semibold text-slate-300">What Tinyfish Found</span>
          <span className="font-mono text-sky-400 bg-sky-500/15 border border-sky-500/25 rounded px-1.5 py-0.5">{finds.length}</span>
        </div>
        <span className="text-slate-600">{collapsed ? "▲" : "▼"}</span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div ref={scrollRef} className="overflow-y-auto divide-y" style={{ maxHeight: "220px", borderColor: "var(--border)" }}>
          {finds.map((f, i) => {
            const scoreCls = f.similarity >= 70 ? "text-red-400" : f.similarity >= 40 ? "text-orange-400" : f.similarity >= 15 ? "text-yellow-400" : "text-emerald-400";
            return (
              <div key={i} className="px-3 py-2 space-y-0.5 hover:bg-white/3 transition-colors" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-sky-500 truncate">{f.targetLabel}</span>
                  <span className={`text-xs font-mono font-bold flex-shrink-0 ${scoreCls}`}>{f.similarity}%</span>
                </div>
                {f.title && (
                  <p className="text-xs text-slate-300 font-medium leading-snug line-clamp-1">{f.title}</p>
                )}
                {f.snippet && (
                  <p className="text-xs text-slate-600 leading-snug line-clamp-2">{f.snippet}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Legitimacy Banner ────────────────────────────────────────────────────────

function LegitimacyBanner({ result }: { result: LegitimacyResult }) {
  if (result.markers.length === 0) return null;
  return (
    <div className={`rounded-xl border p-3.5 ${result.isLegitimate
      ? "border-emerald-500/25 bg-emerald-500/8"
      : "border-yellow-500/25 bg-yellow-500/8"}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base flex-shrink-0 mt-0.5">{result.isLegitimate ? "✅" : "⚠️"}</span>
        <div>
          <p className={`text-xs font-semibold ${result.isLegitimate ? "text-emerald-400" : "text-yellow-400"}`}>
            {result.isLegitimate ? "Legitimate Reuse Markers Detected" : "Attribution Markers Detected"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{result.note}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [content, setContent] = useState("");
  const [domain, setDomain] = useState("general");
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [phrases, setPhrases] = useState<PhraseRow[]>([]);
  const [result, setResult] = useState<CompleteEvent | null>(null);
  const [legitimacy, setLegitimacy] = useState<LegitimacyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [agents, setAgents] = useState<AgentTab[]>([]);
  const [tinyfishFinds, setTinyfishFinds] = useState<FindEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const phrasesRef = useRef<PhraseRow[]>([]);
  const activeCountRef = useRef(0);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  const handleCheck = useCallback(async () => {
    if (!content.trim() || content.trim().length < 20) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setStatus("checking");
    setPhrases([]);
    setResult(null);
    setLegitimacy(null);
    setErrorMsg("");
    setAgents([]);
    setTinyfishFinds([]);
    phrasesRef.current = [];
    activeCountRef.current = 0;

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, domain }),
        signal: ctrl.signal,
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
          let eventType = "", dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          const p = JSON.parse(dataStr);

          switch (eventType) {

            case "legitimacy":
              setLegitimacy(p);
              break;

            case "start":
              // Initialise phrase rows with pending targets
              phrasesRef.current = Array.from({ length: p.totalPhrases }, (_, i) => ({
                phraseIndex: i,
                phrase: "",
                targets: (p.targets as Array<{url: string; label: string}>).map((t, ti) => ({
                  targetIndex: ti,
                  targetLabel: t.label,
                  targetUrl: t.url,
                  status: "pending" as const,
                  topScore: 0,
                  hitCount: 0,
                  hits: [],
                })),
                bestScore: 0,
                done: false,
              }));
              setPhrases([...phrasesRef.current]);
              break;

            case "phrase_start":
              phrasesRef.current = phrasesRef.current.map((r) =>
                r.phraseIndex === p.phraseIndex ? { ...r, phrase: p.phrase } : r
              );
              setPhrases([...phrasesRef.current]);
              break;

            case "target_start": {
              activeCountRef.current++;
              const agentId = `${p.phraseIndex}-${p.targetIndex}`;
              phrasesRef.current = phrasesRef.current.map((r) =>
                r.phraseIndex === p.phraseIndex
                  ? { ...r, targets: r.targets.map((t) =>
                      t.targetIndex === p.targetIndex ? { ...t, status: "searching" as const } : t
                    ) }
                  : r
              );
              setPhrases([...phrasesRef.current]);
              setAgents((prev) => {
                const exists = prev.find((a) => a.id === agentId);
                if (exists) return prev;
                return [...prev, {
                  id: agentId,
                  phraseIndex: p.phraseIndex as number,
                  targetIndex: p.targetIndex as number,
                  targetLabel: p.targetLabel as string,
                  phrase: (p.phrase as string) ?? "",
                  streamingUrl: null,
                  steps: [{ ts: Date.now(), text: "Agent started" }],
                  status: "active" as const,
                }];
              });
              break;
            }

            case "browser_open":
              setAgents((prev) => prev.map((a) =>
                a.phraseIndex === p.phraseIndex && a.targetIndex === p.targetIndex
                  ? { ...a, streamingUrl: (p.streamingUrl as string) ?? a.streamingUrl,
                      steps: [...a.steps, { ts: Date.now(), text: "Browser opened" }] }
                  : a
              ));
              break;

            case "browser_step":
              if (p.purpose) {
                setAgents((prev) => prev.map((a) =>
                  a.phraseIndex === p.phraseIndex && a.targetIndex === p.targetIndex
                    ? { ...a, steps: [...a.steps, { ts: Date.now(), text: String(p.purpose) }] }
                    : a
                ));
              }
              break;

            case "browser_close":
              activeCountRef.current = Math.max(0, activeCountRef.current - 1);
              setAgents((prev) => prev.map((a) =>
                a.phraseIndex === p.phraseIndex && a.targetIndex === p.targetIndex
                  ? { ...a, steps: [...a.steps, { ts: Date.now(), text: "Extraction complete" }], status: "done" as const }
                  : a
              ));
              break;

            case "target_done":
              phrasesRef.current = phrasesRef.current.map((r) =>
                r.phraseIndex === p.phraseIndex
                  ? { ...r, targets: r.targets.map((t) =>
                      t.targetIndex === p.targetIndex
                        ? { ...t, status: "done" as const, topScore: p.topScore ?? 0, hitCount: p.hitCount ?? 0, hits: p.hits ?? [] }
                        : t
                    ) }
                  : r
              );
              setPhrases([...phrasesRef.current]);
              // Accumulate hits into the finds box
              if (Array.isArray(p.hits) && p.hits.length > 0) {
                const topHit = (p.hits as Array<{ title: string; snippet: string; similarity: number }>)[0];
                if (topHit && topHit.similarity > 0) {
                  setTinyfishFinds((prev) => [...prev, {
                    targetLabel: p.targetLabel as string,
                    title: topHit.title ?? "",
                    snippet: topHit.snippet ?? "",
                    similarity: topHit.similarity ?? 0,
                  }]);
                }
              }
              break;

            case "target_error":
              phrasesRef.current = phrasesRef.current.map((r) =>
                r.phraseIndex === p.phraseIndex
                  ? { ...r, targets: r.targets.map((t) =>
                      t.targetIndex === p.targetIndex ? { ...t, status: "error" as const } : t
                    ) }
                  : r
              );
              setPhrases([...phrasesRef.current]);
              setAgents((prev) => prev.map((a) =>
                a.phraseIndex === p.phraseIndex && a.targetIndex === p.targetIndex
                  ? { ...a, status: "error" as const, steps: [...a.steps, { ts: Date.now(), text: String(p.message ?? "Error") }] }
                  : a
              ));
              break;

            case "phrase_done":
              phrasesRef.current = phrasesRef.current.map((r) =>
                r.phraseIndex === p.phraseIndex ? { ...r, bestScore: p.bestScore ?? 0, done: true } : r
              );
              setPhrases([...phrasesRef.current]);
              break;

            case "complete":
              setResult(p);
              setStatus("done");
              setAgents((prev) => prev.map((a) => a.status === "active" ? { ...a, status: "done" as const } : a));
              break;

            case "error":
              setErrorMsg(p.message ?? "Error");
              break;
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
    setPhrases([]);
    setResult(null);
    setLegitimacy(null);
    setErrorMsg("");
    setAgents([]);
    setTinyfishFinds([]);
    phrasesRef.current = [];
    activeCountRef.current = 0;
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
              <h1 className="font-bold text-white text-base leading-none">plAIgiarism</h1>
              <p className="text-xs text-slate-600 leading-none mt-0.5">Powered by Tinyfish</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
            {isRunning
              ? `${activeCountRef.current > 0 ? `${activeCountRef.current} agent${activeCountRef.current > 1 ? "s" : ""} running` : "Processing…"}`
              : "Live web search"}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.6fr_1.8fr] gap-5">

          {/* ── Col 1: Input ── */}
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-white">Detect <span className="gradient-text">Plagiarism</span></h2>
              <p className="text-slate-500 text-xs mt-1">Paste any content — AI agents search domain-specific sources in parallel.</p>
            </div>

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
              <button onClick={() => setContent(EXAMPLES[domain] ?? EXAMPLES.general)} disabled={isRunning}
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

            {status === "idle" && !content && (
              <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">How it works</p>
                <ol className="space-y-2 text-xs text-slate-500">
                  {[
                    ["🧠","Distinctive fingerprints extracted (not just sentences)"],
                    ["⚖️","Legitimacy filter runs before any search"],
                    ["🌐","Domain-specific sources searched in parallel"],
                    ["👁️","Watch Tinyfish browse the web live"],
                    ["📊","Exact match detection + semantic scoring"],
                  ].map(([icon,text],i) => (
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
              <p className="text-xs text-slate-600 mt-0.5">Live view of Tinyfish searching domain-specific sources</p>
            </div>
            <BrowserPanel agents={agents} />

            {/* Phrase / target progress */}
            {phrases.length > 0 && (
              <div className="rounded-xl border p-3.5 space-y-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Search Progress</p>
                {phrases.map((row) => (
                  row.phrase !== "" || row.targets.some(t => t.status !== "pending") ? (
                    <PhraseRow key={row.phraseIndex} row={row} />
                  ) : null
                ))}
              </div>
            )}
          </div>

          {/* ── Col 3: Results ── */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Results</h3>
              <p className="text-xs text-slate-600 mt-0.5">Similarity scores and matched sources</p>
            </div>

            {legitimacy && legitimacy.markers.length > 0 && (
              <LegitimacyBanner result={legitimacy} />
            )}

            {result ? (
              <div className="space-y-4 animate-fade-up">
                {/* Score card */}
                <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <div className="flex items-center gap-4">
                    <ScoreGauge score={result.score} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 mb-1">Plagiarism Score</p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${risk!.bg} ${risk!.color}`}>
                          {risk!.label}
                        </span>
                        {result.hasExactMatch && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold">
                            Exact Match
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg p-2" style={{ background: "var(--surface2)" }}>
                          <p className="text-slate-600 mb-0.5">Phrases</p>
                          <p className="text-white font-semibold">{result.totalPhrases} checked</p>
                        </div>
                        <div className="rounded-lg p-2" style={{ background: "var(--surface2)" }}>
                          <p className="text-slate-600 mb-0.5">Matched</p>
                          <p className={`font-semibold ${result.matchedPhrases > 0 ? "text-orange-400" : "text-emerald-400"}`}>
                            {result.matchedPhrases} phrase{result.matchedPhrases !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Phrase bars */}
                  <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>
                    {result.phraseScores.map((ps, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 truncate flex-1" style={{ maxWidth: "120px" }}>
                          {ps.phrase.length > 38 ? ps.phrase.slice(0, 38) + "…" : ps.phrase}
                        </span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-14 h-1 rounded-full bg-slate-800">
                            <div className={`h-full rounded-full ${ps.score < 15 ? "bg-emerald-500" : ps.score < 35 ? "bg-lime-500" : ps.score < 55 ? "bg-yellow-500" : ps.score < 75 ? "bg-orange-500" : "bg-red-500"}`}
                              style={{ width: `${ps.score}%`, transition: "width 0.8s ease" }} />
                          </div>
                          <span className={`w-8 text-right font-mono font-semibold text-xs ${ps.score < 15 ? "text-emerald-400" : ps.score < 35 ? "text-lime-400" : ps.score < 55 ? "text-yellow-400" : ps.score < 75 ? "text-orange-400" : "text-red-400"}`}>
                            {ps.score}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {result.sources.length > 0 ? (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                      {result.sources.length} Source{result.sources.length !== 1 ? "s" : ""} Found
                    </p>
                    <div className="space-y-2.5">
                      {result.sources.map((src, i) => (
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
                  Results reflect textual similarity with publicly indexed content via Tinyfish web agents. For reference only.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border flex flex-col items-center justify-center p-10 text-center"
                style={{ borderColor: "var(--border)", background: "var(--surface)", minHeight: "280px" }}>
                {isRunning ? (
                  <>
                    <div className="flex gap-1 mb-3">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-2 h-2 rounded-full bg-sky-600"
                          style={{ animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />
                      ))}
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Agents searching…</p>
                    <p className="text-slate-600 text-xs mt-1">Results appear as searches complete</p>
                  </>
                ) : (
                  <>
                    <div className="text-3xl mb-3 opacity-25">📋</div>
                    <p className="text-slate-500 text-sm">Results will appear here</p>
                    <p className="text-slate-700 text-xs mt-1">Run a check to see plagiarism scores</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <TinyfishFindsBox finds={tinyfishFinds} />

      <footer className="border-t py-3 text-center text-xs text-slate-700" style={{ borderColor: "var(--border)" }}>
        plAIgiarism · Built with{" "}
        <a href="https://tinyfish.ai" target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:text-sky-500 transition-colors">Tinyfish</a>
        {" "}web agents
      </footer>

      <style jsx global>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>
    </div>
  );
}
