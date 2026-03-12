/** 
 * OSINT Search API - Restored "High-Yield" Preferred Version
 * Focuses on high-volume results and stable Vercel execution.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });

  const PLATFORM_DOMAINS = {
    facebook: ["facebook.com", "fb.com"],
    instagram: ["instagram.com"],
    tiktok: ["tiktok.com"],
    linkedin: ["linkedin.com"],
    twitter: ["twitter.com", "x.com"],
    telegram: ["t.me", "telegram.me"],
    whatsapp: ["whatsapp.com", "wa.me"]
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

  async function unifiedSearch(query, limit = 20) {
    const results = [];
    try {
      const [h1, h2] = await Promise.all([
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=25`).then(r => r.text()).catch(() => ""),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }).then(r => r.text()).catch(() => "")
      ]);
      
      const allHtml = h1 + h2;
      const links = allHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      for (const m of links) {
        const href = m[1];
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (href.startsWith('http') && !href.includes("bing.com") && !href.includes("mojeek.com") && title.length > 3) {
          results.push({ href: href, title: title, body: "" });
        }
      }
    } catch { }
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = (country && country !== "Worldwide") ? "ar" : "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const kwList = Array.from(kwSet).slice(0, 2);

    for (const kw of kwList) {
      // 1. Core Web Search (Broad)
      const baseQuery = country !== 'Worldwide' ? `"${kw}" ${country}` : `"${kw}"`;
      const webResults = await unifiedSearch(baseQuery, 25);
      
      // 2. High-Yield Platform Batches
      const platforms = Object.keys(PLATFORM_DOMAINS);
      for (let i = 0; i < platforms.length; i += 3) {
        const batch = platforms.slice(i, i + 3);
        const batchQueries = batch.map(p => unifiedSearch(`site:${PLATFORM_DOMAINS[p][0]} "${kw}"`, 10));
        const batchResults = (await Promise.all(batchQueries)).flat();
        
        [...webResults, ...batchResults].forEach(r => {
          try {
            const urlObj = new URL(r.href);
            const dom = urlObj.hostname.replace("www.", "").toLowerCase();
            const content = (r.title + " " + dom).toLowerCase();
            
            // Check relevance
            if (!kwList.some(k => content.includes(k.toLowerCase()))) return;

            const emails = [...new Set((r.title + " " + r.href).match(EMAIL_REGEX) || [])];
            const phones = [...new Set(r.title.match(PHONE_REGEX) || [])].filter(p => p.length > 7);
            
            const isPlat = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
            let entityId = dom;
            if (isPlat) {
              const parts = urlObj.pathname.split('/').filter(p => p.length > 1);
              if (parts.length > 0) entityId = `${dom}/${parts[0]}`;
            }

            if (!entityMap[entityId]) {
              entityMap[entityId] = { 
                name: r.title || dom, 
                website: isPlat ? null : r.href, 
                snippet: "Discovered via deep OSINT crawl.", 
                emails: [], phones: [], social_profiles: [], score: 0 
              };
            }
            
            const ent = entityMap[entityId];
            if (isPlat) {
              const [platform] = isPlat;
              if (!ent.social_profiles.find(p => p.url === r.href)) {
                ent.social_profiles.push({ platform, url: r.href });
              }
            }
            if (emails.length) ent.emails = [...new Set([...ent.emails, ...emails])];
            if (phones.length) ent.phones = [...new Set([...ent.phones, ...phones])];
            
            ent.score += (r.title.toLowerCase().includes(keyword.toLowerCase()) ? 10 : 2);
          } catch {}
        });
      }
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    final.sort((a, b) => b.score - a.score);

    if (final.length === 0) {
      return res.status(200).json([{
        name: `Results for '${keyword}'`,
        snippet: "Searching all platforms... Try a broader keyword if no results appear.",
        social_profiles: [], emails: [], phones: [], website: "#"
      }]);
    }

    return res.status(200).json(final.slice(0, 80));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
