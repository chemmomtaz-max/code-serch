/** 
 * OSINT Search API - Massive Parallel Search & Resilience Version
 * Queries Mojeek, Bing, and Qwant in parallel with 15+ variations
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

  async function searchQwant(query) {
    const results = [];
    try {
      const r = await fetch(`https://api.qwant.com/v3/search/web?q=${encodeURIComponent(query)}&count=10&locale=en_US`);
      const d = await r.json();
      if (d?.data?.result?.items) {
        d.data.result.items.forEach(item => {
          results.push({ href: item.url, title: item.title, body: item.desc });
        });
      }
    } catch { }
    return results;
  }

  async function unifiedSearch(query, limit = 15) {
    const results = [];
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`),
        fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" }
        }),
        searchQwant(query)
      ]);
      const [h1, h2] = await Promise.all([r1.text(), r2.text()]);
      
      const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const m of m1) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: m[3].replace(/<[^>]+>/g, "") });
      
      const m2 = h2.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/g);
      for (const m of m2) {
        if (!m[1].includes("bing.com")) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: "" });
      }
      
      if (Array.isArray(r3)) results.push(...r3);
    } catch { }
    
    const unique = [];
    const seen = new Set();
    for (const r of results) {
      if (!seen.has(r.href)) {
        unique.push(r);
        seen.add(r.href);
      }
    }
    return unique.slice(0, limit);
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

    // OPTIMIZED SEARCH STRATEGY: High-relevance dorking
    for (const kw of kwSet) {
      // 1. Broad global & country search
      searchTasks.push(unifiedSearch(`"${kw}" "${country}"`, 15));
      
      // 2. Platform-specific deep dorks
      Object.entries(PLATFORM_DOMAINS).forEach(([plat, ds]) => {
        // Targeted dork: site:domain "keyword"
        searchTasks.push(unifiedSearch(`site:${ds[0]} "${kw}"`, 8));
        // Informal dork: "keyword" platform_name
        searchTasks.push(unifiedSearch(`"${kw}" ${plat} ${country}`, 5));
      });

      // 3. Local TLD & Contact dorks
      if (cInfo.tld) searchTasks.push(unifiedSearch(`"${kw}" site:${cInfo.tld}`, 10));
      searchTasks.push(unifiedSearch(`"${kw}" ${country} "contact" OR "phone" OR "email"`, 10));
      searchTasks.push(unifiedSearch(`"${kw}" ${country} "WhatsApp" OR "Telegram"`, 10));
    }

    const resultChunks = await Promise.all(searchTasks);
    const allResults = resultChunks.flat();

    for (const r of allResults) {
      try {
        if (!r.href || !r.href.startsWith("http")) continue;
        const urlObj = new URL(r.href);
        const dom = urlObj.hostname.replace("www.", "");
        
        // Relevance Check: Title or Snippet must contain at least part of a keyword
        const content = (r.title + " " + (r.body || "")).toLowerCase();
        const kwRelevance = Array.from(kwSet).some(k => {
          const kwLow = k.toLowerCase();
          return content.includes(kwLow) || dom.includes(kwLow.replace(/\s+/g, ''));
        });
        
        if (!kwRelevance) continue; // Skip non-relevant "fake" results

        const emails = [...new Set(((r.title + " " + (r.body || "") + " " + r.href).match(EMAIL_REGEX) || []).map(e => e.toLowerCase()))];
        const phones = [...new Set((r.title + " " + (r.body || "")).match(PHONE_REGEX) || [])].filter(p => p.length > 8);
        
        const isSocial = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
        
        if (isSocial) {
          const [platform] = isSocial;
          if (!entityMap[dom]) entityMap[dom] = { name: r.title || dom, website: null, snippet: r.body || "", emails: [], phones: [], social_profiles: [] };
          // For social results, we want to capture the specific profile URL
          if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
             entityMap[dom].social_profiles.push({ platform, url: r.href });
          }
        } else {
          // General website result
          if (!entityMap[dom]) {
            entityMap[dom] = { name: r.title, website: r.href, snippet: r.body || "", emails: [], phones: [], social_profiles: [] };
          } else if (!entityMap[dom].website) {
            entityMap[dom].website = r.href;
            entityMap[dom].name = r.title;
          }
        }
        
        if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
        if (phones.length) entityMap[dom].phones = [...new Set([...entityMap[dom].phones, ...phones])];
      } catch { }
    }

    const final = Object.values(entityMap).filter(e => e.social_profiles.length > 0 || e.website || e.emails.length > 0 || e.phones.length > 0);
    
    final.sort((a, b) => {
      const score = e => (e.social_profiles.length * 2) + (e.emails.length * 3) + (e.phones.length * 4) + (e.website ? 5 : 0);
      return score(b) - score(a);
    });

    if (final.length === 0) {
      return res.status(200).json([{
        name: `Searching the entire web for ${keyword}...`,
        website: "#",
        snippet: "Processing deep data extraction. If no specific results show, the target may have restricted visibility.",
        emails: [], phones: [], social_profiles: []
      }]);
    }

    return res.status(200).json(final.slice(0, 80));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
