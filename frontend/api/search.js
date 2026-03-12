/** 
 * OSINT Search API - Ultra Reliable Version
 * Using Google Accessible, Qwant, and Bing fallback
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
    facebook: "site:facebook.com",
    instagram: "site:instagram.com",
    tiktok: "site:tiktok.com",
    linkedin: "site:linkedin.com",
    telegram: "site:t.me",
    whatsapp: "site:wa.me"
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

  async function translate(text, target) {
    try {
      const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`);
      const d = await r.json();
      return d?.responseData?.translatedText || text;
    } catch { return text; }
  }

  async function fetchResults(query, limit = 8) {
    const results = [];
    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ];
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Try Google Accessible Interface (gbv=1)
    try {
      const gUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&gbv=1&num=${limit}`;
      const gResp = await fetch(gUrl, { headers: { "User-Agent": ua } });
      const gHtml = await gResp.text();
      
      const gMatches = gHtml.matchAll(/<a href="\/url\?q=([^&]+)&amp;[^>]*><h3[^>]*>(.*?)<\/h3>/g);
      for (const m of gMatches) {
        const url = decodeURIComponent(m[1]);
        const title = m[2].replace(/<[^>]+>/g, "").trim();
        if (url.startsWith("http") && !url.includes("google.com")) {
          results.push({ href: url, title, body: title });
        }
      }
    } catch (e) { console.error("G Error", e); }

    if (results.length >= 3) return results.slice(0, limit);

    // Fallback: Qwant (Good for no-js scraping)
    try {
      const qUrl = `https://api.qwant.com/v3/search/web?q=${encodeURIComponent(query)}&count=${limit}&locale=en_US`;
      const qResp = await fetch(qUrl, { headers: { "User-Agent": ua } });
      const qData = await qResp.json();
      if (qData?.data?.result?.items) {
        for (const item of qData.data.result.items) {
          results.push({ href: item.url, title: item.title, body: item.desc });
        }
      }
    } catch (e) { console.error("Q Error", e); }

    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const targetLang = LANG_MAP[country.toLowerCase().trim()] || "en";
    
    const [en, local] = await Promise.all([
      translate(keyword, "en"),
      translate(keyword, targetLang)
    ]);
    if (en) kwSet.add(en);
    if (local) kwSet.add(local);

    const entityMap = {};
    for (const kw of kwSet) {
      // 1. General search
      const web = await fetchResults(kw, 10);
      for (const r of web) {
        const isSocial = Object.values(PLATFORM_DOMAINS).some(ds => ds.some(d => r.href.toLowerCase().includes(d)));
        if (isSocial) continue;
        const dom = new URL(r.href).hostname.replace("www.", "");
        const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
        if (!entityMap[dom]) entityMap[dom] = { name: r.title, website: r.href, snippet: r.body.slice(0, 200), emails: [], phones: [], social_profiles: [] };
        if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
      }

      // 2. Social specific
      for (const [plat, siteOp] of Object.entries(PLATFORMS)) {
        const social = await fetchResults(`${siteOp} "${kw}"`, 5);
        for (const r of social) {
          const dom = new URL(r.href).hostname.replace("www.", "");
          if (!entityMap[dom]) entityMap[dom] = { name: r.title, website: null, snippet: r.body.slice(0, 200), emails: [], phones: [], social_profiles: [] };
          if (!entityMap[dom].social_profiles.find(p => p.url === r.href)) {
            entityMap[dom].social_profiles.push({ platform: plat, url: r.href });
          }
          const emails = [...new Set((r.title + " " + r.body).match(EMAIL_REGEX) || [])];
          if (emails.length) entityMap[dom].emails = [...new Set([...entityMap[dom].emails, ...emails])];
        }
      }
    }

    const final = Object.values(entityMap).filter(e => e.website || e.social_profiles.length || e.emails.length);
    return res.status(200).json(final.slice(0, 60));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
