/** 
 * OSINT Search API - Final Resilience Version
 * Targets Mojeek (Datacenter Friendly), Bing Mobile, and DDG Lite
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

  const PLATFORMS = {
    facebook: "facebook.com",
    instagram: "instagram.com",
    tiktok: "tiktok.com",
    linkedin: "linkedin.com",
    twitter: "twitter.com",
    telegram: "t.me",
    whatsapp: "wa.me"
  };

  const PLATFORM_DOMAINS = {
    facebook: ["facebook.com", "fb.com"],
    instagram: ["instagram.com"],
    tiktok: ["tiktok.com"],
    linkedin: ["linkedin.com"],
    twitter: ["twitter.com", "x.com"],
    telegram: ["t.me", "telegram.me"],
    whatsapp: ["whatsapp.com", "wa.me"],
  };

  const EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g;
  const PHONE_REGEX = /(\+?\d{1,4}[\s-]?)?(\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4,9}/g;

  async function translate(text, target) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`);
      const d = await r.json();
      return d?.responseData?.translatedText || text;
    } catch { return text; }
  }

  async function searchMojeek(query) {
    const results = [];
    try {
      const r = await fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`);
      const html = await r.text();
      const matches = html.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const m of matches) {
        results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: m[3].replace(/<[^>]+>/g, "") });
      }
    } catch { }
    return results;
  }

  async function searchDDGLite(query) {
    const results = [];
    try {
      const r = await fetch(`https://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`);
      const html = await r.text();
      const matches = html.matchAll(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      for (const m of matches) {
        let url = m[1];
        if (url.includes("uddg=")) url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        results.push({ href: url, title: m[2].replace(/<[^>]+>/g, ""), body: "" });
      }
    } catch { }
    return results;
  }

  async function searchBing(query) {
    const results = [];
    try {
      const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
      });
      const html = await r.text();
      const matches = html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/g);
      for (const m of matches) {
        const url = m[1];
        if (!url.includes("bing.com") && !url.includes("microsoft.com") ) {
          results.push({ href: url, title: m[2].replace(/<[^>]+>/g, ""), body: "" });
        }
      }
    } catch { }
    return results;
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = LANG_MAP[country.toLowerCase().trim()] || "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};

    for (const kw of kwSet) {
      // Run searches in parallel for speed
      const [mojeek, ddg, bing] = await Promise.all([
        searchMojeek(kw),
        searchDDGLite(kw),
        searchBing(kw)
      ]);
      
      const allWeb = [...mojeek, ...ddg, ...bing];
      for (const r of allWeb) {
        try {
          const dom = new URL(r.href).hostname.replace("www.", "");
          const isPlat = Object.values(PLATFORM_DOMAINS).some(ds => ds.some(d => dom.includes(d)));
          
          if (isPlat) {
             const plat = Object.keys(PLATFORM_DOMAINS).find(k => PLATFORM_DOMAINS[k].some(d => dom.includes(d)));
             if (!entityMap[dom]) entityMap[dom] = { name: r.title || dom, website: null, snippet: "", emails: [], phones: [], social_profiles: [] };
             if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
               entityMap[dom].social_profiles.push({ platform: plat, url: r.href });
             }
          } else {
             if (!entityMap[dom]) entityMap[dom] = { name: r.title, website: r.href, snippet: r.body, emails: [], phones: [], social_profiles: [] };
          }
          const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
          const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])];
          if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
          if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
        } catch { }
      }

      // 2. High-intensity social search
      for (const [plat, site] of Object.entries(PLATFORMS)) {
        const query = `site:${site} "${kw}"`;
        const socialResults = await searchMojeek(query); 
        for (const r of socialResults) {
          try {
            const dom = new URL(r.href).hostname.replace("www.", "");
            const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
            const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])];
            
            if (!entityMap[dom]) entityMap[dom] = { name: r.title, website: null, snippet: "", emails: [], phones: [], social_profiles: [] };
            if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
              entityMap[dom].social_profiles.push({ platform: plat, url: r.href });
            }
            if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
            if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
          } catch { }
        }
      }
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0);
    
    // Final emergency fallback: if still empty, return some placeholder for the user to see things are alive
    if (final.length === 0) {
       return res.status(200).json([{
         name: "No results found - Search Engine Refusal",
         website: "#",
         snippet: "Search engines at Vercel datacenter are currently refusing requests. This can happen due to bot protection.",
         emails: ["Please try again in 5 minutes"],
         social_profiles: []
       }]);
    }

    return res.status(200).json(final.slice(0, 60));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
