export interface Target {
  url: string;
  label: string;
  goal: (fingerprint: string) => string;
}

/**
 * Domain-specific target sites with precise, structured TinyFish goals.
 * Goals always request JSON output so the result is parseable.
 * Following FRAMEWORK.md §Stage 4: TinyFish navigates live sites, not indexed databases.
 */
export const DOMAIN_TARGETS: Record<string, Target[]> = {
  general: [
    {
      url: "https://www.google.com",
      label: "Google",
      goal: (f) =>
        `Go to https://www.google.com and search for the exact phrase: "${f}". ` +
        `Extract top 5 results. For each return: title, url, snippet. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://medium.com",
      label: "Medium",
      goal: (f) =>
        `Go to https://medium.com and search for: "${f}". ` +
        `Return top 3 articles: title, author handle, publication date, url, matching excerpt. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://web.archive.org",
      label: "Wayback Machine",
      goal: (f) =>
        `Go to https://web.archive.org and search for pages containing: "${f}". ` +
        `Return the earliest archived result: url, capture date, page title. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],

  blog: [
    {
      url: "https://medium.com",
      label: "Medium",
      goal: (f) =>
        `Go to https://medium.com and search for: "${f}". ` +
        `Return top 3 articles: title, author handle, publication date, url, matching excerpt. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://substack.com",
      label: "Substack",
      goal: (f) =>
        `Go to https://substack.com and search for posts containing: "${f}". ` +
        `Return: newsletter name, author, post title, date, url. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://web.archive.org",
      label: "Wayback Machine",
      goal: (f) =>
        `Go to https://web.archive.org and search for: "${f}". ` +
        `Find the earliest archived page containing this text. Return: url, capture date, page title. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],

  research: [
    {
      url: "https://scholar.google.com",
      label: "Google Scholar",
      goal: (f) =>
        `Go to https://scholar.google.com and search for the exact phrase: "${f}" in quotes. ` +
        `Return top 5 results: title, author, year, DOI or URL, snippet containing the phrase. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://arxiv.org",
      label: "arXiv",
      goal: (f) =>
        `Go to https://arxiv.org/search and search for: "${f}". ` +
        `Return top 3: arxiv ID, title, authors, submission date, abstract excerpt. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.semanticscholar.org",
      label: "Semantic Scholar",
      goal: (f) =>
        `Go to https://www.semanticscholar.org and search for papers containing: "${f}". ` +
        `Return: title, year, citation count, URL, excerpt. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],

  songs: [
    {
      url: "https://genius.com",
      label: "Genius",
      goal: (f) =>
        `Go to https://genius.com and search for lyrics containing: "${f}". ` +
        `Navigate to the best matching song. Return: song title, artist, album, release year, ` +
        `the full verse or lyric section containing this phrase verbatim. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.azlyrics.com",
      label: "AZLyrics",
      goal: (f) =>
        `Go to https://www.azlyrics.com and search for lyrics: "${f}". ` +
        `Return: song title, artist, full verse containing the phrase. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.musixmatch.com",
      label: "Musixmatch",
      goal: (f) =>
        `Go to https://www.musixmatch.com and search for: "${f}". ` +
        `Return: song title, artist, ISRC if shown, release year, matching lyric excerpt. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],

  video: [
    {
      url: "https://www.youtube.com",
      label: "YouTube",
      goal: (f) =>
        `Go to https://www.youtube.com/results?search_query=${encodeURIComponent(`"${f}"`)} ` +
        `and find videos whose transcript or description contains: "${f}". ` +
        `For the top result, navigate to it, open the transcript panel, and extract: ` +
        `video title, channel name, upload date, URL, transcript excerpt containing the phrase. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.opensubtitles.org",
      label: "OpenSubtitles",
      goal: (f) =>
        `Go to https://www.opensubtitles.org/en/search and search subtitles for: "${f}". ` +
        `Return: film or show title, year, subtitle author, URL. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.ted.com",
      label: "TED",
      goal: (f) =>
        `Go to https://www.ted.com/search?q=${encodeURIComponent(f)} and find talks containing: "${f}". ` +
        `Navigate to the best match and extract: speaker, talk title, year, URL, ` +
        `matching transcript passage. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],

  social: [
    {
      url: "https://twitter.com",
      label: "X / Twitter",
      goal: (f) =>
        `Go to https://twitter.com/search?q=${encodeURIComponent(`"${f}"`)}&f=live ` +
        `and search for the exact phrase: "${f}". ` +
        `Return first 5 results: username, post date, full post text, URL. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.reddit.com",
      label: "Reddit",
      goal: (f) =>
        `Go to https://www.reddit.com/search/?q=${encodeURIComponent(`"${f}"`)} ` +
        `and find posts containing: "${f}". ` +
        `Return top 3: subreddit, post title, author, date, URL, matching text. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
    {
      url: "https://www.tiktok.com",
      label: "TikTok",
      goal: (f) =>
        `Go to https://www.tiktok.com/search?q=${encodeURIComponent(f)} ` +
        `and search for: "${f}". ` +
        `Return top 3 video results: video title or caption, creator handle, upload date, URL. ` +
        `Return ONLY a JSON array: [{"title":"...","url":"...","snippet":"..."}].`,
    },
  ],
};

export function getTargets(domain: string): Target[] {
  return DOMAIN_TARGETS[domain] ?? DOMAIN_TARGETS.general;
}
