# PlagiarismIQ — Detection Framework
> A TinyFish-powered multi-domain plagiarism intelligence system

---

## Philosophy

Most plagiarism tools compare content against a static indexed database. **PlagiarismIQ is different**: it deploys live AI web agents to navigate the actual internet — authenticated platforms, paywalled journals, gated databases, and dynamic sites that no static scraper can reach. TinyFish is the engine that closes this gap.

TinyFish cannot process binary audio or video streams directly — and it doesn't need to. The internet has already done that work: Genius has the lyrics, MusicBrainz has the composition registrations, YouTube has the transcripts, OpenSubtitles has the scripts, Musipedia has the melody index. **TinyFish navigates to exactly where that processed intelligence lives, extracts it with precision, and feeds it into our scoring pipeline.** This is a stronger architecture than brute-force binary comparison — we're retrieving the web's existing media intelligence, not duplicating it.

The system is designed around three principles:

1. **Precision over exhaustion** — fingerprint first, search second. TinyFish steps are spent only when upstream signals justify it.
2. **Rules before scores** — a domain-specific legitimacy filter eliminates false positives (properly attributed content, CC-licensed works, platform-native shares) before any similarity scoring occurs.
3. **TinyFish as last mile** — existing tools handle cheap, fast, indexed-web checks. TinyFish handles everything they can't: live traversal of authenticated sources, structured metadata extraction from dynamic pages, and multi-step navigation across platforms with no public API.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          INPUT LAYER                                │
│   Text / Audio / Video / Image / Code submitted by user             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PREPROCESSING LAYER                             │
│   Content classifier → domain tag                                   │
│   Local signal extraction (audio features, AST, pHash, Whisper)    │
│   Fingerprint extractor → minimal distinctive representation        │
│   Normaliser (strip formatting, deduplicate whitespace)             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  LEGITIMACY FILTER (Rules Engine)                   │
│   Attribution detection · License tag check · Platform share        │
│   Domain-specific rule evaluation (chords, fair use, CC, etc.)      │
│   → PASS: exits pipeline, flagged as "Legitimate Reuse"             │
│   → FAIL: continues to search layer                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│               TIER 1 — EXISTING TOOL CHECKS (fast, cheap)           │
│   Copyscape · iThenticate · Originality.ai · MOSS · AcoustID        │
│   → Hit found: pass source URL to TinyFish for extraction only      │
│   → No hits: escalate to Tier 2                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            TIER 2 — TINYFISH DEEP WEB TRAVERSAL                     │
│   Navigates live sites: Scholar · Genius · MusicBrainz · GitHub     │
│   Musipedia · Hooktheory · ASCAP · OpenSubtitles · Substack         │
│   Extracts: matched passage/metadata · author · date · context      │
│   Parallel agents · conditional execution · early termination       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SIMILARITY SCORING LAYER                         │
│   Exact match · Semantic · Structural · Gestalt (music/video)       │
│   LLM judge for borderline cases                                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    REPORT GENERATION LAYER                          │
│   Tiered match results · Originality score · Source breakdown       │
│   Tool comparison delta · Exportable JSON + PDF                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1 — Preprocessing & Fingerprinting

Before any external call is made, the system extracts a **content fingerprint** — the smallest set of highly-distinctive signals that uniquely identify the work. This is what gets searched, not the full content. For audio and video, all binary processing happens locally at zero API cost before TinyFish is ever invoked.

### 1A — Text-Based Fingerprinting

| Content Type | Method | Output |
|---|---|---|
| Academic / Blog | KeyBERT + TF-IDF on top 5 n-grams | 3–5 unusual phrase combinations |
| Lyrics | Rhyme pair extraction + compound metaphor detection | Key lyric hooks |
| Code | AST hash of core logic blocks | Structural signature, not raw text |
| Video script | Whisper transcription → text fingerprint | Timestamped phrase anchors |
| Images | Perceptual hash (pHash) via `ImageHash` | Visual hash for reverse lookup |

### 1B — Audio Signal Extraction (Local, Zero API Cost)

For any audio or video submission, the following are extracted locally using `librosa` and `basic-pitch` before any external call is made. TinyFish never receives raw audio.

**Rhythm & Beat Features**
- BPM (tempo) via `librosa.beat.beat_track`
- Beat grid timestamps — positions of detected beats
- Time signature inference — 4/4, 3/4, 6/8 etc.
- Onset strength envelope — captures the rhythmic *feel* beyond tempo, encoding groove and syncopation patterns
- Rhythmic pattern label — classified into categories (straight 8ths, syncopated 16ths, swing, etc.)

**Melody Features**
- Pitch contour — dominant frequency sequence over time, MIDI-quantised
- **Interval sequence** — the pattern of pitch *differences* between consecutive notes, not absolute pitches. This is the most legally significant melodic feature: a melody transposed to a different key has an identical interval sequence. This catches transposition-based copying that pure pitch matching misses entirely.
  ```python
  # Absolute pitches — key-dependent, misses transposition
  melody_absolute = [60, 64, 67, 69]  # C E G A in C major

  # Interval sequence — key-independent, catches transposition
  melody_intervals = [+4, +3, +2]     # same melody in any key
  ```
- Chroma features — 12-dimensional vector per frame representing energy across all 12 pitch classes (C, C#, D ... B). Standard musicological fingerprint for harmonic content.
- MIDI note sequence — generated via `basic-pitch` (Spotify's audio-to-MIDI neural network), formatted as a searchable string: `C4-E4-G4-A4 (quarter, quarter, half, quarter)`

**Harmonic Features**
- Chord sequence — chord labels extracted from chroma features (e.g. `Am - F - C - G`)
- Key and mode detection
- Harmonic rhythm — how frequently chords change

**Structural Features**
- Segment boundaries — where verse/chorus/bridge transitions occur via `librosa.segment`
- Structural template — ordered form label, e.g. `[intro, verse, chorus, verse, chorus, bridge, chorus, outro]`

**Recording Fingerprint**
- `chromaprint` hash — compact binary fingerprint of the full audio signal, submitted to AcoustID for exact recording identification

**Timbre (supplementary, lower legal weight)**
- MFCCs — mel-frequency cepstral coefficients, the standard audio "colour" fingerprint
- Spectral centroid and rolloff — brightness and energy characterisation

### 1C — Video Signal Extraction (Local, Zero API Cost)

- `openai-whisper` → full transcript with timestamps (feeds text pipeline)
- `ffmpeg` → audio track extracted → chromaprint + librosa pipeline (feeds music pipeline if score/music present)
- `pHash` on sampled frames (every 2 seconds) → visual fingerprint array for frame-level matching

**Rule:** Only the fingerprint — never the full content or binary file — is passed to external tools or TinyFish goals. This reduces step cost, protects IP, and improves search precision.

---

## Stage 2 — Legitimacy Filter (Rules Engine)

A domain-specific rules engine runs before any similarity check. If content passes as legitimate reuse, it exits with a green flag — no TinyFish steps consumed.

### Universal Checks (All Domains)
- Attribution present? (@ mention, citation, "source:", "credit:", DOI reference)
- License tag detected? (CC0, CC BY, MIT, Apache 2.0, public domain marker)
- Platform-native share? (retweet, YouTube embed, Spotify share link — attribution baked in)

### Domain-Specific Legitimacy Rules

#### Academic & Research
- Passage in quotation marks AND has inline citation → **Legitimate**
- Citation present but passage is close paraphrase → flag for **patchwriting check**
- Common knowledge phrases / standard method descriptions → **Excluded** from matching
- Self-citation present for overlapping passages → **Legitimate**
- Same author, no self-citation, >20% overlap → flag as **self-plagiarism**

#### Music & Songs
- Chord progressions alone → **Not plagiarism** (unprotectable in isolation)
- Tempo and key alone → **Not plagiarism**
- Single musical element match only (BPM, chroma, or structure in isolation) → **Not flagged** (gestalt scoring required — see Stage 5B)
- CC-licensed or royalty-free tag detected → **Legitimate** (verify license tier: CC0, CC BY, CC BY-NC)
- Mechanical license / remix license present → **Legitimate**
- Cover song with licensing disclosure → **Legitimate**
- "Vibe similarity" only (no lyric, melody, or rhythm match) → **Excluded**
- Lyric match + melody interval match + no license → **Flag**
- Gestalt score >0.65 across multiple elements + no license → **Flag**

#### Blog & Long-Form Content
- Hyperlink to original source present → **Legitimate** (if not full reproduction)
- Full article with attribution and canonical tag → **Legitimate**
- Syndication marker present → **Legitimate**
- Rewrites of press releases → **Excluded** from strict plagiarism check
- Same structure + same claims + no attribution → **Flag**

#### Social Media Content
- Platform native share (retweet, duet, stitch, quote post) → **Legitimate**
- @ attribution in caption → **Legitimate**
- Hashtag presence alone → **Not attribution** (does not legitimise)
- Screenshot repost without @ credit → **Flag**
- Meme template reuse → **Excluded**; only original text layer matters
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
- YouTube Content ID match with existing license → **Legitimate**
- Full scene reproduction, no attribution → **Flag**

#### Visual Art & Design
- Style match only (no compositional reproduction) → **Excluded**
- CC0 / public domain image → **Legitimate**
- Watermark intact, credit present → **Legitimate**
- pHash match >0.95, no attribution → **Flag**

#### Data & Datasets
- CC0 / CC BY dataset with citation → **Legitimate**
- Government/public data with source note → **Legitimate**
- Dataset used without citation → **Flag**
- Proprietary dataset reproduced → **Flag**

---

## Stage 3 — Tier 1: Existing Tool Checks

Fast, cheap, indexed-web checks run first. TinyFish is not invoked if a clear match is found here — the source URL is passed to TinyFish only for targeted passage extraction, not re-search.

| Tool | Domain | Role in Pipeline |
|---|---|---|
| **Copyscape API** | Blog, articles, web content | First-pass for all public web text |
| **iThenticate / Turnitin API** | Academic papers | Gold standard academic check |
| **Originality.ai API** | Blog, content creation | AI-generated + plagiarised content simultaneously |
| **MOSS (Stanford)** | Code | Token-level code similarity, free |
| **YouTube Content ID API** | Video | Audio + visual fingerprint at scale |
| **TinEye API** | Visual art, images | Reverse image search, 60B+ indexed images |
| **AcoustID API** | Music / Audio | Chromaprint hash → MusicBrainz recording ID (free, 17M+ recordings) |
| **Audible Magic** | Music / Audio | Licensed content DB for broadcast/streaming contexts |

**Decision logic after Tier 1:**
```
If match found, confidence > threshold:
    → Pass (source URL, matched excerpt) to TinyFish in extract mode (1–2 steps only)
    → Do NOT re-run TinyFish search

If no match found:
    → Escalate to Tier 2 (TinyFish deep search)

If legitimacy filter was borderline AND Tier 1 hit found:
    → Pass full context to LLM judge
```

---

## Stage 4 — Tier 2: TinyFish Deep Web Traversal

This is where PlagiarismIQ goes beyond every existing tool. TinyFish navigates live, authenticated, dynamic web sources that no indexed database covers. For audio and video domains specifically, TinyFish navigates the platforms that have *already processed* those signals into structured text, metadata, and legal registrations — retrieving that intelligence without ever touching a binary file.

### Core Principle: Precise Goals, Not Broad Mandates

Every TinyFish agent call is constructed from the fingerprint extracted in Stage 1. Goals are specific, structured, and always return JSON.

**Goal construction template:**
```
"Navigate to [TARGET SITE], search for [FINGERPRINT].
Extract: [field 1], [field 2], [field 3].
Return as JSON. If not found, return { found: false }."
```

**Bad (burns steps, imprecise):**
> "Search the web for content similar to this song about heartbreak"

**Good (precise, structured):**
> "Navigate to genius.com, search for the exact lyric phrase 'glass cathedral under a paper moon',
> return: song title, artist, album, release year, and the full verse containing the phrase. JSON."

---

### TinyFish Targets by Domain

#### Academic & Research
```python
targets = [
    ("https://scholar.google.com",
     "Search for exact phrase '{fingerprint}' in quotes. Return top 5: title, author, year, DOI, snippet. JSON."),

    ("https://www.researchgate.net",
     "Search for '{fingerprint}'. Return: paper title, authors, DOI, abstract excerpt. JSON."),

    ("https://www.semanticscholar.org",
     "Find papers containing '{fingerprint}'. Return: title, year, citation count, PDF link. JSON."),

    ("https://pubmed.ncbi.nlm.nih.gov",
     "Search '{fingerprint}'. Return: PMID, title, authors, journal, publication date. JSON."),

    ("https://arxiv.org",
     "Search for '{fingerprint}'. Return: arxiv ID, title, authors, submission date. JSON."),
]
```

#### Music — Lyrics
```python
lyric_targets = [
    ("https://genius.com",
     "Search for lyrics containing '{lyric_fingerprint}'. Return: song title, artist, album, "
     "release year, matching lyric section verbatim. JSON."),

    ("https://www.azlyrics.com",
     "Search for '{lyric_fingerprint}'. Return: song title, artist, full verse containing phrase. JSON."),

    ("https://www.musixmatch.com",
     "Find songs containing '{lyric_fingerprint}'. Return: title, artist, ISRC if shown, release year. JSON."),
]
```

#### Music — Composition, Melody & Registration
```python
composition_targets = [
    ("https://www.musicbrainz.org/search",
     "Search for recording titled '{song_title}' by '{artist}'. Navigate to recording page. "
     "Extract: ISRC, composer credits, publisher, release date, all linked works. JSON."),

    ("https://repertory.ascap.com",
     "Search ASCAP repertory for '{song_title}'. Return: title, writer names, publisher, "
     "registration date, work ID. JSON."),

    ("https://www.sesac.com/repertory",
     "Search SESAC for '{song_title}'. Return: title, affiliates, registration details. JSON."),

    ("https://musipedia.org",
     "Submit note sequence '{midi_note_sequence}' as a melody query. Return: all matching song "
     "titles, composers, match confidence scores. JSON."),

    ("https://www.hooktheory.com/theorytab/browse",
     "Search for songs with chord progression '{chord_sequence}'. Return: song titles, artists, "
     "sections where progression appears. JSON."),

    ("https://www.songbpm.com",
     "Search for songs at {bpm} BPM. Return top 10: title, artist, exact BPM. JSON."),
]
```

> **Why this matters for the hackathon:** AcoustID handles exact recording identity. MusicBrainz gives full provenance. ASCAP/SESAC establish who *registered* the composition and when — the legal ground truth that no other plagiarism tool queries. Musipedia catches melody matches across transpositions using the interval sequence. Hooktheory surfaces chord DNA. TinyFish navigates all of them in parallel with structured goal extraction. No existing plagiarism system does any of this.

#### Blog & Long-Form Content
```python
targets = [
    ("https://medium.com",
     "Search for '{fingerprint}'. Return: article title, author handle, publication date, URL. JSON."),

    ("https://substack.com",
     "Search for posts containing '{fingerprint}'. Return: newsletter name, author, post title, date. JSON."),

    ("https://web.archive.org",
     "Search Wayback Machine for pages containing '{fingerprint}'. "
     "Return: earliest archived URL and capture date. JSON."),
]
```

#### Social Media
```python
targets = [
    ("https://twitter.com/search",
     "Search Twitter for exact phrase '{fingerprint}', filter Latest. "
     "Return first 5: username, post date, full text, URL. JSON."),

    ("https://www.tiktok.com/search",
     "Search TikTok for '{fingerprint}'. Return: video title, creator handle, upload date, view count. JSON."),

    ("https://www.instagram.com/explore",
     "Search Instagram for '{fingerprint}'. Return: post URL, account handle, date if visible. JSON."),
]
```

#### Code
```python
targets = [
    ("https://github.com/search",
     "Search GitHub code for '{code_fingerprint}', filter Code tab. "
     "Return: repo name, file path, author, last commit date, license. JSON."),

    ("https://gitlab.com/search",
     "Search GitLab for code containing '{code_fingerprint}'. Return: project name, file, author. JSON."),

    ("https://stackoverflow.com/search",
     "Search StackOverflow for '{code_fingerprint}'. Return: question title, answer author, date, URL. JSON."),
]
```

#### Video & Film — Transcript, Script & Subtitles

> TinyFish never processes video binary. It navigates platforms that have already transcribed the content — YouTube's auto-generated captions, OpenSubtitles' crowdsourced subtitles, IMSDB's hosted scripts. The submitted video is transcribed locally by Whisper, and that transcript is what gets searched.

```python
transcript_targets = [
    ("https://www.youtube.com/results",
     "Search YouTube for '{transcript_fingerprint}'. Navigate to top result, open transcript panel. "
     "Extract: video title, channel, upload date, full transcript text, URL. JSON."),

    ("https://www.opensubtitles.org/en/search",
     "Search OpenSubtitles for subtitle files containing '{transcript_fingerprint}'. "
     "Return: film/show title, year, subtitle author, download count. JSON."),

    ("https://imsdb.com",
     "Search IMSDB for scripts containing '{script_fingerprint}'. "
     "Return: film title, writer, year, matched scene excerpt. JSON."),

    ("https://vimeo.com/search",
     "Search Vimeo for '{transcript_fingerprint}'. Extract transcript if available, "
     "plus: title, creator, upload date. JSON."),

    ("https://www.ted.com/search",
     "Search TED for '{transcript_fingerprint}'. Navigate to matching talk. "
     "Extract: speaker, title, year, matching transcript passage. JSON."),
]
```

#### Visual Art & Design
```python
targets = [
    ("https://images.google.com",
     "Perform reverse image search using image URL '{image_url}'. "
     "Return top 5 matching pages: page title, URL, source site. JSON."),

    ("https://www.artstation.com",
     "Search ArtStation for artwork titled or tagged '{visual_fingerprint}'. "
     "Return: title, artist name, upload date, URL. JSON."),

    ("https://www.deviantart.com",
     "Search DeviantArt for '{visual_fingerprint}'. Return: title, artist, submission date. JSON."),
]
```

#### Data & Datasets
```python
targets = [
    ("https://www.kaggle.com/datasets",
     "Search Kaggle for datasets matching '{dataset_fingerprint}'. "
     "Return: name, author, license, upload date, download count. JSON."),

    ("https://huggingface.co/datasets",
     "Search HuggingFace datasets for '{dataset_fingerprint}'. "
     "Return: name, author, license, last updated. JSON."),

    ("https://archive.ics.uci.edu",
     "Search UCI ML Repository for '{dataset_fingerprint}'. "
     "Return: dataset name, donor, date donated, license. JSON."),
]
```

---

### TinyFish Step Management

**Execution mode by trigger:**
```
If Tier 1 hit found:
    → tinyfish(mode=extract, url=tier_1_source_url)         # 1–2 steps, targeted

If no Tier 1 hit, domain = academic / code:
    → tinyfish(mode=search, targets=priority_queue[:4])     # max 4 sites, parallel

If no Tier 1 hit, domain = music:
    → tinyfish(mode=search, targets=lyric_queue[:3]
                                  + composition_queue[:4])  # 7 parallel agents

If no Tier 1 hit, domain = video:
    → tinyfish(mode=search, targets=transcript_queue[:4])   # 4 parallel agents

If no Tier 1 hit, domain = blog / social:
    → tinyfish(mode=search, targets=priority_queue[:3])     # 3 parallel agents
```

**Parallel execution:** All target sites for a domain fire concurrently. Total wall time = slowest single agent, not the sum of all agents.

**Early termination:** If any agent returns a high-confidence match (exact phrase found, or recording ID confirmed), remaining agents for that domain are cancelled. Match confirmed; further search is redundant.

---

## Stage 5 — Similarity Scoring

### 5A — Text Similarity (All Text-Derived Content)

**Layer A: Exact Match**
- Algorithm: Rabin-Karp rolling hash for substring matching
- Threshold: ≥ 10 consecutive words = **Exact Match flag**
- Cost: O(n), runs locally, instant

**Layer B: Semantic Similarity**
- `sentence-transformers/all-mpnet-base-v2` — general text
- `allenai/specter2` — academic/scientific content
- Cosine similarity on passage-level embeddings

| Score | Classification |
|---|---|
| ≥ 0.92 | Structural copy |
| 0.75–0.92 | Semantic similarity — likely plagiarism |
| 0.55–0.75 | Thematic overlap — borderline |
| < 0.55 | Distinct |

**Layer C: LLM Judge (borderline only)**
- Fires when Layer B score is 0.65–0.85
- Prompt: *"Given these two passages, determine whether Passage B constitutes plagiarism of Passage A. Consider structural similarity, argument reproduction, and degree of transformation. Return: verdict (plagiarism / borderline / distinct), confidence (0–1), one-sentence reasoning."*
- Model: Claude Sonnet API / Mistral 7B (local fallback)

---

### 5B — Musical Gestalt Scoring

The system's most distinctive scoring layer. It encodes the legal principle established by *Blurred Lines v. Marvin Gaye*: plagiarism can occur even when no single isolated element (chord, rhythm, melody) is identical in isolation — the **combination** is what infringes. Each musical property extracted in Stage 1B is scored independently, then combined into a weighted gestalt.

#### Component Scores

**Lyric similarity** — text pipeline (Layers A + B) on Whisper transcript vs. retrieved lyrics from Genius/AZLyrics

**Melody similarity** — interval sequence comparison, key-independent:
```python
def melody_similarity(intervals_a, intervals_b):
    # Compares interval sequences, not absolute pitches
    # Identical result in any key — catches transposition-based copying
    from difflib import SequenceMatcher
    return SequenceMatcher(None, intervals_a, intervals_b).ratio()
```

**Harmonic (chroma) similarity** — cosine similarity between 12-dimensional chroma vectors averaged over the main musical section (verse or chorus):
```python
from sklearn.metrics.pairwise import cosine_similarity
chroma_score = cosine_similarity(
    chroma_a.mean(axis=1).reshape(1, -1),
    chroma_b.mean(axis=1).reshape(1, -1)
)[0][0]
```

**Rhythmic similarity** — onset envelope + BPM comparison:
```python
def rhythm_similarity(onset_a, onset_b, bpm_a, bpm_b):
    bpm_score = 1.0 if abs(bpm_a - bpm_b) < 5 else max(0, 1 - abs(bpm_a - bpm_b) / 30)
    envelope_score = cosine_similarity(
        onset_a.reshape(1, -1), onset_b.reshape(1, -1)
    )[0][0]
    return 0.4 * bpm_score + 0.6 * envelope_score
```

**Structural similarity** — normalised edit distance between structural form templates:
```python
# e.g. [intro, verse, chorus, verse, chorus, bridge, chorus]
# vs   [verse, chorus, verse, chorus]
# Levenshtein distance on form label sequences, normalised to [0, 1]
```

**Recording identity** — chromaprint → AcoustID match. Binary: 1.0 if same recording, 0.0 if not. If 1.0, pipeline short-circuits directly to Flag regardless of other scores.

#### Gestalt Score Aggregation

```python
def gestalt_similarity_score(submitted, candidate):
    components = {
        "melody_intervals":  melody_similarity(submitted.intervals, candidate.intervals),
        "lyric_semantic":    lyric_similarity(submitted.lyrics, candidate.lyrics),
        "rhythm_pattern":    rhythm_similarity(submitted.onset, candidate.onset,
                                               submitted.bpm, candidate.bpm),
        "chroma_harmonic":   chroma_score(submitted.chroma, candidate.chroma),
        "song_structure":    structure_similarity(submitted.form, candidate.form),
        "recording_match":   acoustid_match(submitted.fingerprint, candidate.fingerprint),
    }

    # Weights reflect legal precedent and musicological significance
    # Melody and lyrics carry the most legal weight (protectable elements)
    # Rhythm elevated post-Blurred Lines ruling
    # Structure and recording handled separately
    weights = {
        "melody_intervals":  0.30,
        "lyric_semantic":    0.25,
        "rhythm_pattern":    0.20,
        "chroma_harmonic":   0.15,
        "song_structure":    0.07,
        "recording_match":   0.03,  # AcoustID exact match handled via short-circuit
    }

    gestalt_score = sum(components[k] * weights[k] for k in components)

    # Require at least 2 independent components > 0.70 to raise gestalt flag
    # Encodes legal principle: unprotectable elements alone cannot constitute infringement
    high_components = [k for k, v in components.items() if v > 0.70
                       and k not in ("song_structure", "recording_match")]
    gestalt_flag = gestalt_score > 0.65 and len(high_components) >= 2

    return {
        "gestalt_score":    gestalt_score,
        "component_scores": components,
        "flag":             gestalt_flag,
        "flag_reason":      f"Gestalt threshold exceeded. High-signal components: {high_components}"
                            if gestalt_flag else None,
        "note":             "No single element threshold exceeded, but combination warrants review"
                            if gestalt_flag and max(components.values()) < 0.80 else None
    }
```

#### Gestalt Interpretation

| Gestalt Score | Classification |
|---|---|
| ≥ 0.85 | Strong similarity across multiple elements — high plagiarism signal |
| 0.65–0.85 | Moderate gestalt — flag for human review + LLM judge |
| 0.45–0.65 | Weak overlap — reported for transparency, not flagged |
| < 0.45 | Distinct works |

**Key enforcement rule:** Chord progressions, tempo, or song structure alone — regardless of score — never trigger a flag. At least two independent protectable elements (melody or lyrics) must exceed 0.70 for a gestalt flag to be raised. This is a direct encoding of established copyright law.

---

### 5C — Domain-Specific Scoring Adjustments

| Domain | Scoring Adjustment |
|---|---|
| Music | Gestalt scorer (5B) replaces simple cosine; AcoustID exact match short-circuits to immediate Flag |
| Code | AST similarity replaces text cosine; variable renaming must not reduce score |
| Social Media | Attribution present → halve match weight; meme templates → zero weight |
| Academic | Citation-gap penalty: high semantic similarity + no nearby citation → score boosted |
| Visual Art | pHash distance as primary score; style similarity explicitly excluded |
| Video | Transcript treated as text (5A); frame pHash compared locally via TinEye API |

### 5D — Final Document-Level Score

```
match_weight = match_tier_score × source_authority_score × temporal_precedence_score

  match_tier_score:
    Exact / AcoustID recording = 1.00
    Structural / High Gestalt  = 0.85
    Semantic / Mod. Gestalt    = 0.65
    Thematic / Weak Gestalt    = 0.35

  source_authority_score:
    Peer-reviewed journal = 1.00
    News outlet           = 0.85
    Blog / Social         = 0.70
    Anonymous             = 0.50

  temporal_precedence:
    Source predates submission = 1.00
    Same period                = 0.60
    Source is newer            = 0.10

originality_score = 1 − weighted_average(all match_weights) × coverage_fraction
```

---

## Stage 6 — Report Generation

### Report Structure

```
PLAGIARISMIQ REPORT
═══════════════════════════════════════════════════════════════════
Document:          [filename / title]
Domain:            [Academic / Music / Blog / Video / Code / ...]
Submitted:         [timestamp]
Originality Score: [0–100]                         ← headline metric

MATCH SUMMARY
───────────────────────────────────────────────────
Total matches found:             [n]
  Exact / recording matches:     [n]
  Structural / gestalt matches:  [n]
  Semantic matches:              [n]
Distinct sources flagged:        [n]
Domains / platforms checked:     [list]

MUSICAL GESTALT BREAKDOWN  (music domain only)
───────────────────────────────────────────────────
Melody interval match:           [0.00–1.00]
Rhythmic pattern match:          [0.00–1.00]
Harmonic (chroma) match:         [0.00–1.00]
Song structure match:            [0.00–1.00]
Lyric semantic match:            [0.00–1.00]
Recording identity (AcoustID):   [Match / No match]
Gestalt score:                   [0.00–1.00]
High-signal components:          [melody_intervals, rhythm_pattern, ...]

LEGITIMACY FILTER SUMMARY
───────────────────────────────────────────────────
Elements cleared as legitimate:   [n]
Reason breakdown: [attribution / CC license / platform-share / chord-exclusion / fair-use]

MATCH DETAIL  (per source)
───────────────────────────────────────────────────
[1] Source: [URL]
    Platform:     [Google Scholar / Genius / MusicBrainz / ASCAP / GitHub / ...]
    Author:       [name]              Date: [publication / registration date]
    Match tier:   [Exact / Gestalt / Structural / Semantic]
    Confidence:   [0.00–1.00]
    Element matched (source):      "..."
    Element matched (submitted):   "..."
    Detected by:  [AcoustID → TinyFish / Copyscape / iThenticate / TinyFish-only]

TOOL COMPARISON
───────────────────────────────────────────────────
Copyscape found:       [n] matches
iThenticate found:     [n] matches
AcoustID found:        [n] recording matches
TinyFish found:        [n] additional matches on sources above tools couldn't reach
  → Unique TinyFish-only sources: [ASCAP registration / Musipedia melody /
                                   gated journal / OpenSubtitles / Hooktheory / ...]

RECOMMENDATION
───────────────────────────────────────────────────
[AUTO-GENERATED: e.g. "Melody interval sequence matches 'Song X' (2019) at 0.81.
Lyric similarity 0.74. Gestalt score 0.73 — flagged for human review.
ASCAP registration found: Writer A, registered 2018. No mechanical license detected.
Recommend legal review before release."]
═══════════════════════════════════════════════════════════════════
```

### Export Formats
- **JSON** — full structured match data, component scores, provenance chain
- **PDF** — formatted report for editorial or legal review (via `WeasyPrint`)
- **Webhook** — push to Notion, Slack, or email on job completion

---

## TinyFish — What It Uniquely Enables

TinyFish is not a convenience wrapper. It is what makes PlagiarismIQ categorically different from every existing plagiarism tool — and for audio/video domains specifically, it is the only way to retrieve musical and cinematic intelligence from the live, structured web without processing binary files.

| Capability | Copyscape / Turnitin | AcoustID / Content ID | TinyFish |
|---|---|---|---|
| Static indexed web text | ✅ | ❌ | ✅ |
| Exact audio/recording match | ❌ | ✅ | ❌ (delegates to AcoustID by design) |
| Paywalled academic journals | ❌ | ❌ | ✅ |
| ASCAP / SESAC composition registry | ❌ | ❌ | ✅ |
| MusicBrainz full provenance chain | ❌ | Partial | ✅ |
| Melody database search (Musipedia) | ❌ | ❌ | ✅ |
| Chord progression database (Hooktheory) | ❌ | ❌ | ✅ |
| YouTube transcript extraction | ❌ | ❌ | ✅ |
| Film script databases (IMSDB) | ❌ | ❌ | ✅ |
| Subtitle databases (OpenSubtitles) | ❌ | ❌ | ✅ |
| Authenticated / gated social content | ❌ | ❌ | ✅ |
| Structured metadata extraction | ❌ (URL only) | ❌ | ✅ (author, date, passage, context) |
| Dynamic / JS-rendered content | ❌ | ❌ | ✅ |
| Multi-step navigation (search → click → extract) | ❌ | ❌ | ✅ |
| Parallel multi-site execution | ❌ | ❌ | ✅ (up to 50 concurrent agents) |
| Natural language goals, no selectors | ❌ | ❌ | ✅ |
| Works without site API | ❌ | ❌ | ✅ |
| Real-time streaming results (SSE) | ❌ | ❌ | ✅ |

**TinyFish catches what others miss — not by searching harder, but by navigating where others cannot go, and retrieving intelligence that already exists on the web in structured form.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Text fingerprinting | `KeyBERT`, `scikit-learn` TF-IDF |
| Audio feature extraction | `librosa` (BPM, chroma, onset, MFCCs, segmentation) |
| Audio-to-MIDI / interval extraction | `basic-pitch` (Spotify) |
| Recording fingerprint | `chromaprint`, `pyacoustid` |
| Transcription (audio + video) | `openai-whisper` |
| Video frame hashing | `ImageHash` (pHash), `ffmpeg` |
| Existing tool APIs | Copyscape, iThenticate, Originality.ai, MOSS, TinEye, AcoustID, Audible Magic |
| **TinyFish** | `tinyfish` Python SDK — parallel agents, SSE streaming, natural language goals |
| Semantic similarity | `sentence-transformers` (`all-mpnet-base-v2`, `specter2`) |
| Musical gestalt scoring | Custom weighted scorer (Stage 5B) |
| Vector store | `ChromaDB` (local) / `Qdrant` (production) |
| AST comparison | Python `ast` module, `difflib` |
| LLM judge | Claude Sonnet API / Mistral 7B (local fallback) |
| Orchestration | `LangGraph` (stateful graph, conditional edges, early termination) |
| Async job queue | `Celery` + `Redis` |
| Backend API | `FastAPI` |
| Frontend | `Streamlit` (demo) / `React` (production) |
| Report export | `WeasyPrint` (PDF), `json` |

---

## Domain Coverage Summary

| Domain | Local Preprocessing | Tier 1 Tool | TinyFish Navigates | Scoring Method |
|---|---|---|---|---|
| Academic | KeyBERT fingerprint | iThenticate | Scholar, ResearchGate, arXiv, PubMed, SemanticScholar | Semantic (SPECTER2) + exact |
| Music — lyrics | Whisper transcript | — | Genius, AZLyrics, Musixmatch | Lyric semantic + exact |
| Music — composition | chromaprint, librosa, basic-pitch | AcoustID | MusicBrainz, ASCAP, SESAC, Musipedia, Hooktheory, SongBPM | Gestalt scorer (melody intervals + rhythm + chroma + structure + lyrics) |
| Blog / Content | KeyBERT fingerprint | Copyscape, Originality.ai | Medium, Substack, Wayback Machine | Paragraph semantic + date precedence |
| Social Media | KeyBERT fingerprint | — | Twitter/X, TikTok, Instagram | Caption exact + attribution detection |
| Code | AST hash | MOSS | GitHub, GitLab, StackOverflow | AST similarity |
| Video — script | Whisper transcript | YouTube Content ID | YouTube transcript, IMSDB, OpenSubtitles, Vimeo, TED | Transcript semantic + exact |
| Video — visual | pHash frame sampling | TinEye API | Google Images (stills) | Perceptual hash distance |
| Visual Art | pHash | TinEye API | ArtStation, DeviantArt | pHash + reverse image |
| Data | Schema + description text | — | Kaggle, HuggingFace, UCI | Schema match + description semantic |
