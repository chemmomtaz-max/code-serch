/** Vercel Production API - Final Deployment Trigger **/
export default async function handler(req, res) {
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });

  const LANG_MAP = {
    "iran": "fa", "iraq": "ar", "germany": "de", "france": "fr",
    "spain": "es", "italy": "it", "russia": "ru", "china": "zh-CN",
    "japan": "ja", "turkey": "tr", "brazil": "pt",
    "saudi arabia": "ar", "egypt": "ar", "united arab emirates": "ar",
    "syria": "ar", "lebanon": "ar", "afghanistan": "fa", "india": "hi",
    "indonesia": "id", "malaysia": "ms", "pakistan": "ur",
  };

  const PLATFORM_SITES = {
    facebook: "site:facebook.com",
    instagram: "site:instagram.com",
    tiktok: "site:tiktok.com",
    linkedin: "site:linkedin.com",
    telegram: "site:t.me",
    whatsapp: "site:wa.me",
  };

  const PLATFORM_DOMAINS = {
    facebook: ["facebook.com", "fb.com"],
    instagram: ["instagram.com"],
    tiktok: ["tiktok.com"],
    linkedin: ["linkedin.com"],
    telegram: ["t.me", "telegram.me"],
    whatsapp: ["whatsapp.com", "wa.me"],
  };

  const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;

  function getDomain(url) {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
  }

  async function bingSearch(query, maxResults = 8) {
    try {
      const resp = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await resp.text();
      const results = [];
      
      // Liberal extraction: Capture link + title from b_algo blocks
      const matches = html.matchAll(/<li[^>]*class="b_algo"[^>]*>.*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>.*?<h2[^>]*>(.*?)<\/h2>/gs);
      for (const m of matches) {
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (!url || url.includes("bing.com") || url.includes("microsoft.com")) continue;
        results.push({ href: url, title, body: title });
      }

      // Broad fallback for any linked H2s
      if (results.length === 0) {
        const fallbacks = html.matchAll(/<h2[^>]*>.*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gs);
        for (const m of fallbacks) {
          const url = m[1];
          const title = m[2].replace(/<[^>]+>/g, "").trim();
          if (!url || url.includes("bing.com") || url.includes("microsoft.com")) continue;
          results.push({ href: url, title, body: title });
        }
      }
      return results.slice(0, maxResults);
    } catch (e) { return []; }
  }

  async function duckSearch(query, maxResults = 8) {
    try {
      const resp = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36" }
      });
      const html = await resp.text();
      const results = [];
      const matches = html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      for (const m of matches) {
        let url = m[1];
        if (url.includes("uddg=")) {
           const match = url.match(/uddg=([^&]+)/);
           if (match) url = decodeURIComponent(match[1]);
        }
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (!url || url.includes("duckduckgo.com")) continue;
        results.push({ href: url, title, body: title });
      }
      return results.slice(0, maxResults);
    } catch { return []; }
  }

  async function unifiedSearch(query, maxResults = 8) {
    let res = await bingSearch(query, maxResults);
    if (res.length < 2) {
      const dres = await duckSearch(query, maxResults);
      res = [...res, ...dres];
    }
    return res.slice(0, maxResults);
  }

  async function translateText(text, targetLang) {
    try {
      const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`);
      const data = await resp.json();
      return data?.responseData?.translatedText || text;
    } catch { return text; }
  }

  try {
    const keywordSet = new Set([keyword]);
    const lang = LANG_MAP[(country || "").toLowerCase().trim()];
    if (lang) {
      const [en, local] = await Promise.all([
        translateText(keyword, "en"),
        translateText(keyword, lang)
      ]);
      if (en) keywordSet.add(en);
      if (local) keywordSet.add(local);
    }
    const keywords = Array.from(keywordSet);

    const entityMap = {};

    for (const kw of keywords) {
      // General web search
      const webResults = await unifiedSearch(kw, 10);
      for (const r of webResults) {
        const { href: link, title, body: snippet } = r;
        if (!link || !title) continue;
        const isSocial = Object.values(PLATFORM_DOMAINS).some(ds => ds.some(d => link.toLowerCase().includes(d)));
        if (isSocial) continue;
        const domain = getDomain(link);
        const emails = [...new Set((snippet + " " + title).match(EMAIL_REGEX) || [])];
        if (!entityMap[domain]) {
          entityMap[domain] = { name: title, website: link, snippet: snippet.slice(0, 200), emails: [], phones: [], social_profiles: [] };
        }
        if (emails.length) entityMap[domain].emails = [...new Set([...entityMap[domain].emails, ...emails])];
      }

      // Social platforms
      for (const [platform, siteOp] of Object.entries(PLATFORM_SITES)) {
        const domains = PLATFORM_DOMAINS[platform] || [];
        const platResults = await unifiedSearch(`${siteOp} "${kw}"`, 5);
        for (const r of platResults) {
          const { href: link, title, body: snippet } = r;
          if (!link) continue;
          if (domains.length && !domains.some(d => link.toLowerCase().includes(d))) continue;
          const domain = getDomain(link);
          const emails = [...new Set((snippet + " " + title).match(EMAIL_REGEX) || [])];
          if (!entityMap[domain]) {
            entityMap[domain] = { name: title, website: null, snippet: snippet.slice(0, 200), emails: [], phones: [], social_profiles: [] };
          }
          const existingUrls = entityMap[domain].social_profiles.map(p => p.url);
          if (!existingUrls.includes(link)) {
            entityMap[domain].social_profiles.push({ platform, url: link });
          }
          if (emails.length) entityMap[domain].emails = [...new Set([...entityMap[domain].emails, ...emails])];
        }
      }
    }

    const results = Object.values(entityMap).filter(e => e.website || e.social_profiles.length || e.emails.length);
    return res.status(200).json(results.slice(0, 50));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
