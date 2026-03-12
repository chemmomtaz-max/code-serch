/** 
 * OSINT Search API - High Reliability Entity-Centric Version
 * Consolidated grouping by target entity (domain) as requested.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { keyword, country } = req.body;
  if (!keyword) return res.status(400).json({ error: "keyword is required" });

  const LANG_MAP = {
    "iran": "fa", "iraq": "ar", "germany": "de", "france": "fr", "spain": "es", "italy": "it", "russia": "ru",
    "china": "zh-CN", "japan": "ja", "turkey": "tr", "brazil": "pt", "saudi arabia": "ar", "egypt": "ar",
    "uae": "ar", "syria": "ar", "lebanon": "ar", "afghanistan": "fa", "india": "hi", "pakistan": "ur",
  };

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
      const [r1, r2, r3] = await Promise.all([
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}&count=20`),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }),
        fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
        })
      ]);
      
      const [h1, h2, h3] = await Promise.all([r1.text(), r2.text(), r3.text()]);
      
      // Mojeek
      const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const m of m1) {
        results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
      }

      // DDG
      const dMatches = h3.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs);
      for (const m of dMatches) {
        let url = m[1];
        if (url.includes("uddg=")) url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        results.push({ href: url, title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
      }

      // Bing
      const bMatches = h2.matchAll(/<li[^>]*class="b_algo"[^>]*>.*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/gs);
      for (const m of bMatches) {
        results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, "").trim(), body: m[3].replace(/<[^>]+>/g, "").trim() });
      }
    } catch { }
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = LANG_MAP[country.toLowerCase().trim()] || "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const kwList = Array.from(kwSet);

    // Initial Search: Web + Broad Social
    const searchTasks = [];
    for (const kw of kwList) {
      searchTasks.push(unifiedSearch(`"${kw}" "${country}"`, 25));
      searchTasks.push(unifiedSearch(`"${kw}" official contacts`, 15));
      
      // Platform Specific Dorking (Serialized batches to stay safe on Vercel)
      const platforms = Object.keys(PLATFORM_DOMAINS);
      for (let i = 0; i < platforms.length; i += 3) {
        const batch = platforms.slice(i, i + 3);
        const batchTasks = batch.map(p => unifiedSearch(`site:${PLATFORM_DOMAINS[p][0]} "${kw}"`, 10));
        const batchResults = await Promise.all(batchTasks);
        
        batchResults.forEach(results => {
          results.forEach(r => {
            try {
              const dom = new URL(r.href).hostname.replace("www.", "").toLowerCase();
              const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
              const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
              
              const isPlat = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
              
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
          });
        });
      }
    }

    // Process General Web batches
    const webBatches = await Promise.all(searchTasks);
    webBatches.flat().forEach(r => {
      try {
        const dom = new URL(r.href).hostname.replace("www.", "").toLowerCase();
        const content = (r.title + " " + r.body).toLowerCase();
        if (!kwList.some(k => content.includes(k.toLowerCase())) && !content.includes(country.toLowerCase())) return;

        const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
        const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
        const isPlat = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));

        if (!entityMap[dom]) {
          entityMap[dom] = { name: r.title, website: isPlat ? null : r.href, snippet: r.body, emails: [], phones: [], social_profiles: [] };
        }
        if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
        if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
      } catch {}
    });

    // Cleanup and Sorting
    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    final.sort((a, b) => {
      const score = x => (x.social_profiles.length * 2) + (x.emails.length * 3) + (x.phones.length * 4) + (x.website ? 1 : 0);
      return score(b) - score(a);
    });

    return res.status(200).json(final.slice(0, 80));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
