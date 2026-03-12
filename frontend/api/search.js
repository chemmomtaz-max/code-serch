/** 
 * OSINT Search API - High Reliability Entity-Centric Version
 * Focuses on MAXIMUM results, robust grouping, and flexible queries.
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

  async function unifiedSearch(query, limit = 20) {
    const results = [];
    try {
      const tasks = [
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=25`).then(r => r.text()).catch(() => ""),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }).then(r => r.text()).catch(() => "")
      ];
      
      const [h1, h2] = await Promise.all(tasks);
      
      if (h1) {
        const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
        for (const m of m1) {
          results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
        }
      }

      if (h2) {
        const bMatches = h2.matchAll(/<li[^>]*class="b_algo"[^>]*>.*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/gs);
        for (const m of bMatches) {
          results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
        }
        // Fallback for different Bing layouts
        if (results.length < 5) {
            const bAlt = h2.matchAll(/<a[^>]*href="([^"]+)"[^>]*><h2>(.*?)<\/h2><\/a>/gs);
            for (const m of bAlt) {
                if (!m[1].includes("bing.com")) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: "" });
            }
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
    const kwList = Array.from(kwSet);

    const searchTasks = [];
    for (const kw of kwList) {
      // Use both quoted (precise) and unquoted (broad) variants
      const baseQuery = country !== 'Worldwide' ? `${kw} ${country}` : kw;
      searchTasks.push(unifiedSearch(`"${kw}" ${country !== 'Worldwide' ? country : ''}`, 25));
      searchTasks.push(unifiedSearch(baseQuery, 20)); // Broad
      searchTasks.push(unifiedSearch(`${kw} official website profile contact`, 15));
      
      // Platform Specific - more flexible queries
      Object.entries(PLATFORM_DOMAINS).forEach(([plat, domains]) => {
         searchTasks.push(unifiedSearch(`site:${domains[0]} ${kw}`, 15));
      });
    }

    const allBatches = await Promise.all(searchTasks);
    const allResults = allBatches.flat();

    for (const r of allResults) {
      try {
        const urlStr = r.href;
        if (!urlStr || urlStr.includes("bing.com") || urlStr.includes("mojeek.com") || urlStr.includes("microsoft.com")) continue;
        
        const urlObj = new URL(urlStr);
        const hostname = urlObj.hostname.toLowerCase();
        const dom = hostname.replace("www.", "");
        
        const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
        const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
        
        const isPlatEntry = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
        
        // Use a unique ID for grouping - if it's a social profile, use a clean version of the URL path if possible
        // to avoid merging different people on the same platform into one card
        let entityId = dom;
        if (isPlatEntry) {
            // For major social platforms, we try to split by profile (e.g., facebook.com/profile1)
            const pathParts = urlObj.pathname.split('/').filter(p => p.length > 2);
            if (pathParts.length > 0) entityId = `${dom}/${pathParts[0]}`;
        }

        if (!entityMap[entityId]) {
          entityMap[entityId] = { 
            name: r.title || dom, 
            website: isPlatEntry ? null : urlStr, 
            snippet: r.body, 
            emails: [], 
            phones: [], 
            social_profiles: [],
            score: 0 
          };
        }
        
        const entity = entityMap[entityId];
        
        if (isPlatEntry) {
          const [platform] = isPlatEntry;
          if (!entity.social_profiles.find(p => p.url === urlStr)) {
            entity.social_profiles.push({ platform, url: urlStr });
          }
        }
        
        if (emails.length) entity.emails = [...new Set([...entity.emails, ...emails])];
        if (phones.length) entity.phones = [...new Set([...entity.phones, ...phones])];
        
        // Simple relevance score
        if (r.title.toLowerCase().includes(keyword.toLowerCase())) entity.score += 5;
        if (r.body.toLowerCase().includes(keyword.toLowerCase())) entity.score += 2;
      } catch {}
    }

    let final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    
    // Sort by relevance and information richness
    final.sort((a, b) => {
      const infoRichness = x => (x.social_profiles.length * 5) + (x.emails.length * 10) + (x.phones.length * 15) + (x.website ? 5 : 0);
      return (b.score + infoRichness(b)) - (a.score + infoRichness(a));
    });

    if (final.length === 0) {
      return res.status(200).json([{
        name: `Results for '${keyword}'`,
        snippet: "Searching engines returned few matches. Try removing the country filter or using a more general keyword.",
        social_profiles: [], emails: [], phones: [], website: "#"
      }]);
    }

    return res.status(200).json(final.slice(0, 100));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
