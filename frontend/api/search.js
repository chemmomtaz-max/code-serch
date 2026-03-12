/** 
 * OSINT Search API - Deep Country Version
 * Targets Mojeek, Bing Mobile, and DDG Lite with parallel country-specific dorking
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

  const COUNTRY_INFO = {
    "iran": { tld: ".ir", name: "ایران" },
    "iraq": { tld: ".iq", name: "العراق" },
    "germany": { tld: ".de", name: "Deutschland" },
    "france": { tld: ".fr", name: "France" },
    "spain": { tld: ".es", name: "España" },
    "italy": { tld: ".it", name: "Italia" },
    "russia": { tld: ".ru", name: "Россия" },
    "china": { tld: ".cn", name: "中国" },
    "japan": { tld: ".jp", name: "日本" },
    "turkey": { tld: ".tr", name: "Türkiye" },
    "brazil": { tld: ".br", name: "Brasil" },
    "saudi arabia": { tld: ".sa", name: "السعودية" },
    "egypt": { tld: ".eg", name: "مصر" },
    "uae": { tld: ".ae", name: "الإمارات" },
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
  const PHONE_REGEX = /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4,9}/g;

  async function translate(text, target) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`);
      const d = await r.json();
      return d?.responseData?.translatedText || text;
    } catch { return text; }
  }

  async function unifiedSearch(query, limit = 8) {
    const results = [];
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`),
        fetch(`https://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        })
      ]);
      const [h1, h2, h3] = await Promise.all([r1.text(), r2.text(), r3.text()]);
      
      const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const m of m1) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: m[3].replace(/<[^>]+>/g, "") });
      
      const m2 = h2.matchAll(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gs);
      for (const m of m2) {
        let url = m[1];
        if (url.includes("uddg=")) url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        results.push({ href: url, title: m[2].replace(/<[^>]+>/g, ""), body: "" });
      }

      const m3 = h3.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/g);
      for (const m of m3) {
        if (!m[1].includes("bing.com")) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: "" });
      }
    } catch { }
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = LANG_MAP[country.toLowerCase().trim()] || "en";
    const cInfo = COUNTRY_INFO[country.toLowerCase().trim()] || {};

    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    const searchTasks = [];

    for (const kw of kwSet) {
      // General web search for this keyword
      searchTasks.push(unifiedSearch(`"${kw}" "${country}"`, 10));
      
      // Localized TLD search
      if (cInfo.tld) {
        searchTasks.push(unifiedSearch(`"${kw}" site:${cInfo.tld}`, 8));
      }

      // Platform specific dorks
      Object.entries(PLATFORM_DOMAINS).forEach(([plat, domains]) => {
        searchTasks.push(unifiedSearch(`site:${domains[0]} "${kw}"`, 5));
      });
    }

    const allResults = (await Promise.all(searchTasks)).flat();

    for (const r of allResults) {
      try {
        const dom = new URL(r.href).hostname.replace("www.", "");
        const emails = [...new Set((r.title + " " + r.body + " " + r.href).match(EMAIL_REGEX) || [])];
        const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 7);
        
        const isPlat = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
        
        if (isPlat) {
          const [platform] = isPlat;
          if (!entityMap[dom]) entityMap[dom] = { name: r.title || dom, website: null, snippet: r.body, emails: [], phones: [], social_profiles: [] };
          if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
             entityMap[dom].social_profiles.push({ platform, url: r.href });
          }
        } else {
          if (!entityMap[dom]) entityMap[dom] = { name: r.title, website: r.href, snippet: r.body, emails: [], phones: [], social_profiles: [] };
        }
        
        if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
        if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
      } catch { }
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    
    // Sort by richness of information
    final.sort((a, b) => {
      const scoreA = (a.social_profiles.length * 2) + (a.emails.length * 3) + (a.phones.length * 4) + (a.website ? 5 : 0);
      const scoreB = (b.social_profiles.length * 2) + (b.emails.length * 3) + (b.phones.length * 4) + (b.website ? 5 : 0);
      return scoreB - scoreA;
    });

    if (final.length === 0) {
       return res.status(200).json([{
         name: "No results matching country criteria found",
         website: "#",
         snippet: "Try a broader keyword or check your country selection.",
         emails: [], phones: [], social_profiles: []
       }]);
    }

    return res.status(200).json(final.slice(0, 80));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
