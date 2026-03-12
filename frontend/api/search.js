/** 
 * OSINT Search API - High Reliability "Full Recovery" Version
 * Restores individual platform discovery and robust link extraction.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });

  const PLATFORMS = {
    facebook: "facebook.com",
    instagram: "instagram.com",
    tiktok: "tiktok.com",
    linkedin: "linkedin.com",
    twitter: "twitter.com",
    telegram: "t.me",
    whatsapp: "wa.me"
  };

  const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
  const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,9}/g;

  async function translate(text, target) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`);
      const d = await r.json();
      return d?.responseData?.translatedText || text;
    } catch { return text; }
  }

  async function betterSearch(query, limit = 15) {
    const results = [];
    try {
      const endpoints = [
        `https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=20`,
        `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      ];
      
      for (const url of endpoints) {
        try {
          const resp = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
          });
          const html = await resp.text();
          
          // Pattern 1: Mojeek-style (ob class)
          const m1 = html.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
          for (const m of m1) {
             results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), snippet: m[3].replace(/<[^>]+>/g, "") });
          }
          
          // Pattern 2: Bing-style (h2 > a)
          const m2 = html.matchAll(/<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/gs);
          for (const m of m2) {
             results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), snippet: m[3].replace(/<[^>]+>/g, "") });
          }

          // Pattern 3: Generic link fallback
          if (results.length < 5) {
             const m3 = html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gs);
             for (const m of m3) {
               const href = m[1];
               const title = m[2].replace(/<[^>]+>/g, "").trim();
               if (!href.includes("microsoft") && !href.includes("bing") && !href.includes("mojeek") && title.length > 5) {
                 results.push({ href, title, snippet: "" });
               }
             }
          }
        } catch {}
      }
    } catch {}
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = (country && country !== "Worldwide") ? "ar" : "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const kwList = Array.from(kwSet);

    // sequential batches to avoid Vercel timeouts but cover EVERYTHING
    for (const kw of kwList) {
      // 1. Broadest Search (for website discovery)
      const webResults = await betterSearch(`${kw} official website ${country !== 'Worldwide' ? country : ''}`, 20);
      
      // 2. Specific Platform Dorks (One by one in small bursts)
      const platformTasks = Object.entries(PLATFORMS).map(([name, site]) => betterSearch(`site:${site} "${kw}"`, 8));
      const platformResultsBatches = await Promise.all(platformTasks);
      
      const allFound = [...webResults, ...platformResultsBatches.flat()];

      allFound.forEach(r => {
        try {
          const urlObj = new URL(r.href);
          const dom = urlObj.hostname.replace("www.", "").toLowerCase();
          const content = (r.title + " " + r.snippet + " " + r.href).toLowerCase();
          
          // Relevance check: must contain keyword or its variations
          if (!kwList.some(k => content.includes(k.toLowerCase()))) return;

          const emails = [...new Set(content.match(EMAIL_REGEX) || [])];
          const phones = [...new Set(content.match(PHONE_REGEX) || [])].filter(p => p.length > 7);
          
          const platName = Object.keys(PLATFORMS).find(k => dom.includes(PLATFORMS[k]));
          let entityId = dom;

          // Unique profiles on social platforms
          if (platName) {
            const parts = urlObj.pathname.split('/').filter(x => x.length > 1);
            if (parts.length > 0) entityId = `${dom}/${parts[0]}`;
          }

          if (!entityMap[entityId]) {
            entityMap[entityId] = { 
              name: r.title || dom, 
              website: platName ? null : r.href,
              snippet: r.snippet || "OSINT profile metadata identified.",
              emails: [], phones: [], social_profiles: [], score: 0 
            };
          }

          const ent = entityMap[entityId];
          if (platName && !ent.social_profiles.find(p => p.url === r.href)) {
            ent.social_profiles.push({ platform: platName, url: r.href });
          }
          if (emails.length) ent.emails = [...new Set([...ent.emails, ...emails])];
          if (phones.length) ent.phones = [...new Set([...ent.phones, ...phones])];
          
          ent.score += 5;
          if (r.title.toLowerCase().includes(keyword.toLowerCase())) ent.score += 10;
        } catch {}
      });
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    final.sort((a, b) => b.score - a.score);

    if (final.length === 0) {
      return res.status(200).json([{
        name: `In-depth search for '${keyword}'`,
        snippet: "Engines are responding slowly. Try a broader term or check back in 1 minute.",
        social_profiles: [], emails: [], phones: [], website: "#"
      }]);
    }

    return res.status(200).json(final.slice(0, 80));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
