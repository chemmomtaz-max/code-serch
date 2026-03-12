/** 
 * OSINT Search API - High Reliability "High-Yield" Version
 * Uses query consolidation and sequential batching for maximum coverage.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });

  const PLATFORM_GROUPS = [
    ["facebook.com", "fb.com", "instagram.com"],
    ["linkedin.com", "tiktok.com"],
    ["twitter.com", "x.com", "t.me", "telegram.me"],
    ["whatsapp.com", "wa.me"]
  ];

  const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
  const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,9}/g;

  async function translate(text, target) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`);
      const d = await r.json();
      return d?.responseData?.translatedText || text;
    } catch { return text; }
  }

  async function fetchResults(query) {
    const results = [];
    try {
      // Small parallelized fetch for Mojeek and Bing
      const [r1, r2] = await Promise.all([
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=30`).then(r => r.text()).catch(() => ""),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }).then(r => r.text()).catch(() => "")
      ]);
      
      // Scrape results broader regex to handle various HTML formats
      const allText = r1 + r2;
      const links = allText.matchAll(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      for (const m of links) {
        const href = m[1];
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (href.startsWith('http') && !href.includes("bing.com") && !href.includes("mojeek.com") && title.length > 3) {
          results.push({ href, title, body: "" });
        }
      }
      
      // Specific snippet extraction for Mojeek
      const snippets = r1.matchAll(/<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const s of snippets) {
        if (results[0]) results[0].body = s[1].replace(/<[^>]+>/g, "").trim();
      }
    } catch { }
    return results;
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = (country && country !== "Worldwide") ? "ar" : "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const kwList = Array.from(kwSet).slice(0, 2); // Keep it to 2 keywords max for stability

    // Sequential Processing of High-Yield Batches
    for (const kw of kwList) {
      const tasks = [];
      
      // 1. Broad Web & Contact Search
      tasks.push(fetchResults(`${kw} ${country !== 'Worldwide' ? country : ''}`));
      tasks.push(fetchResults(`${kw} official website contact info`));

      // 2. Consolidated Platform Search
      for (const group of PLATFORM_GROUPS) {
        const query = group.map(site => `site:${site}`).join(" OR ") + ` ${kw}`;
        tasks.push(fetchResults(query));
      }

      // Execute batches of 3 to stay under Vercel limits
      for (let i = 0; i < tasks.length; i += 3) {
        const batchResults = (await Promise.all(tasks.slice(i, i + 3))).flat();
        
        batchResults.forEach(r => {
          try {
            const urlObj = new URL(r.href);
            const dom = urlObj.hostname.replace("www.", "").toLowerCase();
            const emails = [...new Set((r.title + " " + r.body + " " + r.href).match(EMAIL_REGEX) || [])];
            const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
            
            // Smarter Platform Detection
            const PLATFORMS = {
              facebook: ["facebook.com", "fb.com"],
              instagram: ["instagram.com"],
              tiktok: ["tiktok.com"],
              linkedin: ["linkedin.com"],
              twitter: ["twitter.com", "x.com"],
              telegram: ["t.me", "telegram.me"],
              whatsapp: ["whatsapp.com", "wa.me"]
            };
            
            const isPlatEntry = Object.entries(PLATFORMS).find(([p, ds]) => ds.some(d => dom.includes(d)));
            let entityId = dom;
            
            // Refined profile separation
            if (isPlatEntry) {
              const pathParts = urlObj.pathname.split('/').filter(p => p.length > 1);
              if (pathParts.length > 0) entityId = `${dom}/${pathParts[0]}`;
            }

            if (!entityMap[entityId]) {
              entityMap[entityId] = { 
                name: r.title || dom, website: isPlatEntry ? null : r.href,
                snippet: r.body || "OSINT data discovered.",
                emails: [], phones: [], social_profiles: [], score: 0 
              };
            }
            
            const entity = entityMap[entityId];
            if (isPlatEntry) {
              const [platform] = isPlatEntry;
              if (!entity.social_profiles.find(p => p.url === r.href)) {
                entity.social_profiles.push({ platform, url: r.href });
              }
            }
            
            if (emails.length) entity.emails = [...new Set([...entity.emails, ...emails])];
            if (phones.length) entity.phones = [...new Set([...entity.phones, ...phones])];
            if (r.title.toLowerCase().includes(keyword.toLowerCase())) entity.score += 10;
          } catch {}
        });
      }
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    final.sort((a, b) => {
      const s = x => (x.social_profiles.length * 5) + (x.emails.length * 15) + (x.phones.length * 10) + (x.website ? 2 : 0) + x.score;
      return s(b) - s(a);
    });

    if (final.length === 0) {
      return res.status(200).json([{
        name: `No specific matches for '${keyword}'`,
        snippet: "The global OSINT search returned no clear contacts. Please check spelling or try a broader term.",
        social_profiles: [], emails: [], phones: [], website: "#"
      }]);
    }

    return res.status(200).json(final.slice(0, 100));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
