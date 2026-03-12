/** 
 * OSINT Search API - High Reliability Entity-Centric Version
 * Focuses on MAXIMUM results and robust grouping.
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
    facebook: ["facebook.com", "fb.com", "fb.me"],
    instagram: ["instagram.com"],
    tiktok: ["tiktok.com"],
    linkedin: ["linkedin.com"],
    twitter: ["twitter.com", "x.com"],
    telegram: ["t.me", "telegram.me"],
    whatsapp: ["whatsapp.com", "wa.me"],
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

  async function unifiedSearch(query, limit = 15) {
    const results = [];
    try {
      // Use Mojeek and Bing Mobile (most reliable for scrapers)
      const tasks = [
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=20`).then(r => r.text()).catch(() => ""),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }).then(r => r.text()).catch(() => "")
      ];
      
      const [h1, h2] = await Promise.all(tasks);
      
      // Mojeek scraper
      if (h1) {
        const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
        for (const m of m1) {
          results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
        }
      }

      // Bing scraper
      if (h2) {
        const bMatches = h2.matchAll(/<li[^>]*class="b_algo"[^>]*>.*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/gs);
        for (const m of bMatches) {
          results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
        }
      }
    } catch { }
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = (country && country !== "Worldwide") ? "ar" : "en"; // Default to Arabic for Middle East keywords
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const kwList = Array.from(kwSet);

    // Collect ALL search results first
    const searchTasks = [];
    for (const kw of kwList) {
      searchTasks.push(unifiedSearch(`"${kw}" ${country !== 'Worldwide' ? country : ''}`, 20));
      searchTasks.push(unifiedSearch(`"${kw}" contact official`, 15));
      
      Object.entries(PLATFORM_DOMAINS).forEach(([plat, domains]) => {
         searchTasks.push(unifiedSearch(`site:${domains[0]} "${kw}"`, 10));
      });
    }

    const allBatches = await Promise.all(searchTasks);
    const allResults = allBatches.flat();

    // Grouping & Extraction
    for (const r of allResults) {
      try {
        const urlStr = r.href;
        if (!urlStr || urlStr.includes("bing.com") || urlStr.includes("mojeek.com")) continue;
        
        const dom = new URL(urlStr).hostname.replace("www.", "").toLowerCase();
        const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
        const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
        
        const isPlat = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
        
        // Entity Logic: If it's a social profile, group it under its domain
        // Or if it's a web result, use its own domain
        if (!entityMap[dom]) {
          entityMap[dom] = { name: r.title, website: isPlat ? null : r.href, snippet: r.body, emails: [], phones: [], social_profiles: [] };
        }
        
        if (isPlat) {
          const [platform] = isPlat;
          if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
            entityMap[dom].social_profiles.push({ platform, url: r.href });
          }
        }
        
        if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
        if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
      } catch {}
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    
    // Final Polish
    final.sort((a, b) => {
      const s = x => (x.social_profiles.length * 5) + (x.emails.length * 10) + (x.phones.length * 15) + (x.website ? 2 : 0);
      return s(b) - s(a);
    });

    if (final.length === 0) {
      return res.status(200).json([{
        name: "No exact results found",
        snippet: `Try searching for just '${keyword}' or changing the country.`,
        social_profiles: [], emails: [], phones: []
      }]);
    }

    return res.status(200).json(final.slice(0, 100));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
