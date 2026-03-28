# PlagiarismIQ — Detection Framework
> A TinyFish-powered multi-domain plagiarism intelligence system

---

## Philosophy

Most plagiarism tools compare content against a static indexed database. **PlagiarismIQ is different**: it deploys live AI web agents to navigate the actual internet — authenticated platforms, paywalled journals, gated databases, and dynamic sites that no static scraper can reach. TinyFish is the engine that closes this gap.

The system is designed around three principles:

1. **Precision over exhaustion** — fingerprint first, search second. TinyFish steps are spent only when upstream signals justify it.
2. **Rules before scores** — a domain-specific legitimacy filter eliminates false positives (properly attributed content, CC-licensed works, platform-native shares) before any similarity scoring occurs.
3. **TinyFish as last mile** — existing tools handle cheap, fast, indexed-web checks. TinyFish handles everything they can't: live traversal of authenticated sources, structured data extraction from dynamic pages, and multi-step navigation across platforms with no public API.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                              │
│   Text / Audio / Video / Image / Code submitted by user         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PREPROCESSING LAYER                           │
│   Content classifier → domain tag                               │
│   Fingerprint extractor (KeyBERT / TF-IDF / audio hash)         │
│   Normaliser (strip formatting, deduplicate whitespace)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LEGITIMACY FILTER (Rules Engine)                │
│   Attribution detection · License tag check · Platform share   │
│   → PASS: exits pipeline, flagged as "Legitimate Reuse"         │
│   → FAIL: continues to search layer                             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               TIER 1 — EXISTING TOOL CHECKS (fast, cheap)       │
│   Copyscape · iThenticate · Originality.ai · MOSS (code)        │
│   → Hits found: pass URL + matched passage to TinyFish          │
│   → No hits: escalate to Tier 2                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│         TIER 2 — TINYFISH DEEP WEB TRAVERSAL                    │
│   Navigates live sites: Scholar · Genius · GitHub · Substack    │
│   Extracts: matched passage · author · date · URL · context     │
│   Conditional: only fires when Tier 1 signals or domain warrants│
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SIMILARITY SCORING LAYER                       │
│   Exact match · Semantic (sentence-transformers) · Structural   │
│   LLM judge pass for borderline cases                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  REPORT GENERATION LAYER                        │
│   Tiered match results · Originality score · Source breakdown   │
│   Exportable JSON + PDF · Human-readable summary                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stage 1 — Preprocessing & Fingerprinting

Before any external call is made, the system extracts a **content fingerprint** — the smallest set of highly-distinctive phrases that uniquely identify the work. This is what gets searched, not the full document.

### Fingerprint Extraction by Content Type

| Content Type | Fingerprinting Method | Output |
|---|---|---|
| Text (academic, blog) | KeyBERT + TF-IDF on top 5 n-grams | 3–5 unusual phrase combinations |
| Lyrics / Song text | Rhyme pair extraction + compound metaphor detection | Key lyric hooks |
| Code | AST hash of core logic blocks | Structural signature, not raw text |
| Audio | `chromaprint` / `librosa` onset + BPM + melody contour | Audio fingerprint vector |
| Video script | OpenAI Whisper transcription → text fingerprint pipeline | Timestamped phrase anchors |
| Images | Perceptual hash (pHash) via `ImageHash` | Visual hash for reverse lookup |

**Rule:** Only the fingerprint — never the full content — is passed to external tools or TinyFish goals. This reduces step cost, protects IP, and improves search precision.

---

## Stage 2 — Legitimacy Filter (Rules Engine)

A domain-specific rules engine runs before any similarity check. If content passes as legitimate reuse, it exits with a green flag — no TinyFish steps consumed.

### Universal Checks (All Domains)
- Attribution present? (@ mention, citation, "source:", "credit:", DOI reference)
- License tag detected? (CC0, CC BY, MIT, Apache 2.0, public domain marker)
- Platform-native share? (retweet, YouTube embed, Spotify share link — attribution baked in)

### Domain-Specific Legitimacy Rules

#### Academic & Research
- Passage is in quotation marks AND has inline citation → **Legitimate**
- Citation present but passage is a close paraphrase → flag for **patchwriting check**
- Common knowledge phrases (domain boilerplate, standard method descriptions) → **Excluded** from matching
- Self-citation present for overlapping passages → **Legitimate**
- Same author, no self-citation, >20% overlap → flag as **self-plagiarism**

#### Music & Songs
- Chord progressions alone → **Not plagiarism** (unprotectable)
- Tempo and key alone → **Not plagiarism**
- CC-licensed or royalty-free tag detected → **Legitimate** (verify license tier)
- Mechanical license / remix license present → **Legitimate**
- Cover song with licensing disclosure → **Legitimate**
- Lyric match + melody fingerprint match + no license → **Flag**
- "Vibe similarity" only (no lyric or melody match) → **Excluded** from scoring

#### Blog & Long-Form Content
- Hyperlink to original source present in post → **Legitimate** (if not full reproduction)
- Full article reproduction with attribution and canonical tag → **Legitimate**
- Syndication marker present → **Legitimate**
- Rewrites of press releases → **Excluded** from academic-level plagiarism check
- Same structure + same claims + no attribution → **Flag**

#### Social Media Content
- Platform native share (retweet, duet, stitch, quote post) → **Legitimate**
- @ attribution in caption → **Legitimate**
- Hashtag presence alone → **Not attribution** (does not legitimise)
- Screenshot repost without @ credit → **Flag**
- Meme template reuse → **Excluded**; only the original text layer matters
- Watermark removed → **Flag**

#### Code
- MIT / Apache 2.0 licensed with attribution comment → **Legitimate**
- Standard boilerplate (for-loops, common patterns) → **Excluded**
- GPL-licensed code in closed-source distribution → **Flag (license violation)**
- StackOverflow code without CC BY-SA attribution → **Flag**
- AST identical, variable names only changed → **Flag**

#### Video & Film
- Fair use context detected (commentary, criticism, parody framing) → **Review (duration check)**
- CC-licensed footage with attribution → **Legitimate**
- YouTube Content ID match with license → **Legitimate**
- Full scene reproduction, no attribution → **Flag**

#### Visual Art & Design
- Style match only (no compositional reproduction) → **Excluded**
- CC0 / public domain image → **Legitimate**
- Watermark intact, credit present → **Legitimate**
- Perceptual hash match >0.95, no attribution → **Flag**

#### Data & Datasets
- CC0 / CC BY dataset with citation → **Legitimate**
- Government/public data with source note → **Legitimate**
- Dataset used without citation → **Flag**
- Proprietary dataset reproduced → **Flag**

---

## Stage 3 — Tier 1: Existing Tool Checks

Fast, cheap, indexed-web checks run first. Each tool has a defined domain scope. TinyFish is not invoked if a clear match is found here — the match URL is passed directly to TinyFish only for passage extraction.

| Tool | Domain | Role in Pipeline |
|---|---|---|
| **Copyscape API** | Blog, articles, web content | First-pass for any public web text |
| **iThenticate / Turnitin API** | Academic papers, research | Gold standard academic check |
| **Originality.ai API** | Blog, content creation | Catches AI-generated + plagiarised content simultaneously |
| **MOSS (Stanford)** | Code | Token-level code similarity, free |
| **YouTube Content ID API** | Video | Audio + visual fingerprint matching at scale |
| **TinEye API** | Visual art, images | Reverse image search against 60B+ indexed images |
| **Audible Magic / AcoustID** | Music / Audio | Audio fingerprint matching against licensed content DB |

**Decision logic after Tier 1:**
```
If match found with confidence > threshold:
    → Pass (source URL, matched excerpt) to TinyFish for passage extraction + metadata
    → Do NOT re-run TinyFish search (source already known)

If no match found:
    → Escalate to Tier 2 (TinyFish deep search)

If match found but legitimacy filter was borderline:
    → Pass to LLM judge with full context
```

---

## Stage 4 — Tier 2: TinyFish Deep Web Traversal

This is where PlagiarismIQ goes beyond every existing plagiarism tool. TinyFish navigates live, authenticated, dynamic web sources that no indexed database covers.

### Core Principle: Precise Goals, Not Broad Mandates

Every TinyFish agent call is constructed from the fingerprint — not the full content. Goals are specific, structured, and return JSON.

**Goal construction template:**
```
"Search [TARGET SITE] for the exact phrase '[FINGERPRINT PHRASE]'.
If found, extract: page title, author name, publication date,
the matching passage verbatim, the section it appears in, and the URL.
Return as JSON. If not found, return { found: false }."
```

**Bad (burns steps, imprecise):**
> "Search the web for any content similar to this article about machine learning"

**Good (precise, structured):**
> "Navigate to scholar.google.com, search for the exact phrase 'heteroskedasticity-robust standard errors in panel data with fixed effects' in quotes, return the first 5 results as JSON with title, author, year, and DOI"

### TinyFish Target Sites by Domain

#### Academic & Research
```python
targets = [
    ("https://scholar.google.com", "Search for exact phrase '{fingerprint}', return top 5: title, author, year, DOI, snippet"),
    ("https://www.researchgate.net", "Search for '{fingerprint}', return matching paper title, authors, DOI, abstract excerpt"),
    ("https://www.semanticscholar.org", "Find papers containing '{fingerprint}', return title, year, citation count, PDF link if available"),
    ("https://pubmed.ncbi.nlm.nih.gov", "Search '{fingerprint}', return PMID, title, authors, journal, publication date"),
    ("https://arxiv.org", "Search for '{fingerprint}', return arxiv ID, title, authors, submission date"),
]
```

#### Music & Lyrics
```python
targets = [
    ("https://genius.com", "Search for lyrics containing '{lyric_fingerprint}', return song title, artist, album, release year, and the matching lyric section"),
    ("https://www.azlyrics.com", "Search for '{lyric_fingerprint}', return song title and artist if found"),
    ("https://www.musixmatch.com", "Find songs containing the phrase '{lyric_fingerprint}', return title, artist, ISRC if shown"),
    ("https://open.spotify.com", "Search for '{lyric_fingerprint}' in track search, return track name, artist, album, release date"),
]
```

#### Blog & Long-Form Content
```python
targets = [
    ("https://medium.com", "Search for '{fingerprint}', return article title, author handle, publication date, URL of matching article"),
    ("https://substack.com", "Search for posts containing '{fingerprint}', return newsletter name, author, post title, date"),
    ("https://web.archive.org", "Search Wayback Machine for pages containing '{fingerprint}', return earliest archived URL and capture date"),
    # + Copyscape already covers general web; Wayback Machine is the unique TinyFish value here
]
```

#### Social Media
```python
targets = [
    ("https://twitter.com/search", "Search Twitter for the exact phrase '{fingerprint}', filter by 'Latest', return first 5 posts: username, post date, post text, URL"),
    ("https://www.tiktok.com/search", "Search TikTok for '{fingerprint}', return video title, creator handle, upload date, view count"),
    ("https://www.instagram.com/explore", "Search Instagram for '{fingerprint}', return post URL, account handle, approximate date if visible"),
]
```

#### Code
```python
targets = [
    ("https://github.com/search", "Search GitHub code for '{code_fingerprint}', filter by 'Code', return repository name, file path, author, last commit date, license"),
    ("https://gitlab.com/search", "Search GitLab for code containing '{code_fingerprint}', return project name, file, author"),
    ("https://stackoverflow.com/search", "Search StackOverflow for '{code_fingerprint}', return question title, answer author, date, URL"),
]
```

#### Video & Film
```python
targets = [
    ("https://www.youtube.com/results", "Search YouTube for '{transcript_fingerprint}', return video title, channel name, upload date, video URL, view count"),
    ("https://vimeo.com/search", "Search Vimeo for '{transcript_fingerprint}', return video title, creator, upload date"),
]
```

#### Visual Art & Design
```python
targets = [
    ("https://images.google.com", "Perform reverse image search using image URL '{image_url}', return top 5 matching pages: page title, URL, image source site"),
    ("https://www.tineye.com", "Search TinEye for image matches of '{image_url}', return number of matches, earliest match date, source URLs"),
    ("https://www.artstation.com", "Search ArtStation for artwork titled or tagged '{visual_fingerprint}', return artwork title, artist name, upload date"),
    ("https://www.deviantart.com", "Search DeviantArt for '{visual_fingerprint}', return title, artist, submission date"),
]
```

#### Data & Datasets
```python
targets = [
    ("https://www.kaggle.com/datasets", "Search Kaggle for datasets matching '{dataset_fingerprint}', return dataset name, author, license, upload date"),
    ("https://huggingface.co/datasets", "Search HuggingFace datasets for '{dataset_fingerprint}', return dataset name, author, license, last updated"),
    ("https://archive.ics.uci.edu", "Search UCI ML Repository for '{dataset_fingerprint}', return dataset name, donor, date donated"),
]
```

### TinyFish Step Management

**Conditional execution rules:**
```
if tier_1_hit:
    run tinyfish(extract_mode, url=tier_1_source_url)   # 1–2 steps only
elif domain in ["academic", "code"]:
    run tinyfish(search_mode, targets=priority_queue[:4])  # max 4 sites
elif domain in ["music", "blog"]:
    run tinyfish(search_mode, targets=priority_queue[:3])
else:
    run tinyfish(search_mode, targets=priority_queue[:2])
```

**Parallel execution:** Run TinyFish agents concurrently across target sites (platform supports up to 50 concurrent agents). All domain targets fire in parallel, not sequentially — total wall time equals the slowest single agent, not the sum.

**Early termination:** If any agent returns a high-confidence match (exact phrase found), cancel remaining agents for that domain. Match confirmed; further search is redundant.

---

## Stage 5 — Similarity Scoring

Three scoring layers run in sequence. Each has a confidence threshold that determines whether the next layer is needed.

### Layer A: Exact Match
- Algorithm: Rabin-Karp rolling hash for substring matching
- Threshold: ≥ 10 consecutive words = **Exact Match flag**
- Cost: O(n), runs locally, instant

### Layer B: Semantic Similarity
- Model: `sentence-transformers/all-mpnet-base-v2` (general text)
- Model: `allenai/specter2` (academic/scientific content)
- Method: Cosine similarity on passage-level embeddings
- Thresholds:

| Score | Classification |
|---|---|
| ≥ 0.92 | Structural copy |
| 0.75–0.92 | Semantic similarity — likely plagiarism |
| 0.55–0.75 | Thematic overlap — borderline |
| < 0.55 | Distinct content |

### Layer C: LLM Judge (borderline cases only)
- Fires only when Layer B score is 0.65–0.85 (ambiguous zone)
- Prompt: *"Given these two passages, determine whether Passage B constitutes plagiarism of Passage A. Consider: structural similarity, argument reproduction, and degree of transformation. Return: verdict (plagiarism / borderline / distinct), confidence (0–1), and one-sentence reasoning."*
- Model: Claude Sonnet (via API) or local Mistral 7B for cost control
- Output feeds directly into final score

### Domain-Specific Scoring Adjustments

| Domain | Adjustment |
|---|---|
| Music | Weight melody fingerprint match × 0.6 + lyric semantic × 0.4 |
| Code | Use AST similarity score, not text cosine (renaming variables must not fool scorer) |
| Social Media | Reduce weight if attributed; zero-weight meme templates |
| Academic | Increase weight for citation-gap cases (high similarity + no nearby citation) |
| Visual Art | Perceptual hash distance as primary score; style similarity excluded |

### Final Document-Level Score

```
match_weight = match_tier_score × source_authority_score × temporal_precedence_score

where:
  match_tier_score:       Exact=1.0, Structural=0.85, Semantic=0.65, Thematic=0.35
  source_authority_score: Peer-reviewed=1.0, News outlet=0.85, Blog=0.7, Anonymous=0.5
  temporal_precedence:    Source older than submission=1.0, Same period=0.6, Newer=0.1

originality_score = 1 − weighted_average(all match_weights) × coverage_fraction
```

---

## Stage 6 — Report Generation

### Report Structure

```
PLAGIARISMIQ REPORT
═══════════════════════════════════════════════════
Document:       [filename / title]
Domain:         [Academic / Music / Blog / ...]
Submitted:      [timestamp]
Originality Score: [0–100]          ← headline metric

MATCH SUMMARY
─────────────
Total matches found:      [n]
Exact matches:            [n]
Structural matches:       [n]
Semantic matches:         [n]
Sources flagged:          [n distinct sources]
Domains checked:          [list]

LEGITIMACY FILTER SUMMARY
─────────────────────────
Passages cleared as legitimate reuse: [n]
Reason breakdown: [attribution / license / platform-share]

MATCH DETAIL (per source)
─────────────────────────
[1] Source: [URL]
    Platform: [Google Scholar / Genius / GitHub / ...]
    Author: [name]          Date: [publication date]
    Match tier: [Exact / Structural / Semantic]
    Confidence: [0.00–1.00]
    Matched passage (source):    "..."
    Matched passage (submitted): "..."
    Detected by: [Copyscape / TinyFish / iThenticate / ...]

TOOL COMPARISON
───────────────
Copyscape found:      [n] matches
iThenticate found:    [n] matches
TinyFish found:       [n] additional matches on sources above tools couldn't reach
  → Unique TinyFish sources: [list of gated/authenticated sites]

RECOMMENDATION
──────────────
[AUTO-GENERATED SUMMARY: e.g. "3 passages require citation. 1 exact match from a 2021
paper with no attribution detected. Recommend revision before submission."]
═══════════════════════════════════════════════════
```

### Export Formats
- **JSON** — full structured match data for downstream integration
- **PDF** — formatted report for editorial or legal review
- **Webhook** — push results to external systems (Notion, Slack, email) on completion

---

## TinyFish — What It Uniquely Enables

This section is the core hackathon differentiator. TinyFish is not a convenience wrapper — it is what makes this system categorically different from every existing plagiarism tool.

| Capability | Copyscape / Turnitin | TinyFish |
|---|---|---|
| Static indexed web | ✅ | ✅ |
| Paywalled academic journals | ❌ | ✅ (navigates authenticated sessions) |
| Private/gated social posts | ❌ | ✅ (authenticated browsing) |
| Structured metadata extraction | ❌ (URL only) | ✅ (author, date, passage, context) |
| Dynamic content (JS-rendered) | ❌ | ✅ |
| Multi-step navigation (search → click → extract) | ❌ | ✅ |
| Parallel multi-site execution | ❌ | ✅ (up to 50 concurrent agents) |
| Natural language goals | ❌ | ✅ |
| Custom site priority queues | ❌ | ✅ |
| Real-time streaming results | ❌ | ✅ (SSE) |
| Works without site API | ❌ | ✅ |

**TinyFish catches what others miss — not by searching harder, but by searching where others cannot go.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Fingerprinting | `KeyBERT`, `scikit-learn` TF-IDF, `chromaprint`, `librosa`, `ImageHash` |
| Transcription | `openai-whisper` |
| Existing tool APIs | Copyscape, iThenticate, Originality.ai, MOSS, TinEye, AcoustID |
| TinyFish | `tinyfish` Python SDK (web agent, parallel execution, SSE streaming) |
| Semantic similarity | `sentence-transformers` (`all-mpnet-base-v2`, `specter2`) |
| Vector store | `ChromaDB` (local) / `Qdrant` (production) |
| AST comparison | Python `ast` module, `difflib` |
| LLM judge | Claude Sonnet API / Mistral 7B (local fallback) |
| Orchestration | `LangGraph` (stateful agent graph with conditional edges) |
| Async job queue | `Celery` + `Redis` |
| Backend API | `FastAPI` |
| Frontend | `Streamlit` (demo) / `React` (production) |
| Report export | `WeasyPrint` (PDF), `json` |

---

## Domain Coverage Summary

| Domain | Legitimacy Rules | Tier 1 Tool | TinyFish Targets | Similarity Method |
|---|---|---|---|---|
| Academic | Citation, self-plagiarism, common knowledge | iThenticate | Scholar, ResearchGate, arXiv, PubMed, SemanticScholar | Semantic (SPECTER2) + exact |
| Music | License, CC tag, chords excluded, covers | AcoustID / Audible Magic | Genius, AZLyrics, Musixmatch, Spotify | Lyric semantic + melody fingerprint |
| Blog / Content | Attribution link, canonical tag, syndication | Copyscape, Originality.ai | Medium, Substack, Wayback Machine | Paragraph semantic + date precedence |
| Social Media | Platform share, @ credit, meme exclusion | — | Twitter/X, TikTok, Instagram | Caption exact + attribution detection |
| Code | License header, boilerplate exclusion, GPL check | MOSS | GitHub, GitLab, StackOverflow | AST similarity |
| Video | Fair use framing, CC footage, Content ID | YouTube Content ID | YouTube, Vimeo (transcript) | Transcript semantic + frame hash |
| Visual Art | Style exclusion, CC/PD tag, watermark check | TinEye | Google Images, ArtStation, DeviantArt | Perceptual hash (pHash) |
| Data | Dataset citation, license tier, gov data | — | Kaggle, HuggingFace, UCI | Schema + description semantic match |
