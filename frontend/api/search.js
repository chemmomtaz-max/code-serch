/** 
 * OSINT Search API - Categorized Multi-Platform Version
 * Fires 15+ variations in parallel and returns data grouped by platform
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
    Facebook: ["facebook.com", "fb.com"],
    Instagram: ["instagram.com"],
    TikTok: ["tiktok.com"],
    LinkedIn: ["linkedin.com"],
    Twitter: ["twitter.com", "x.com"],
    Telegram: ["t.me", "telegram.me"],
    WhatsApp: ["whatsapp.com", "wa.me"],
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
      for (const m of m2) if (!m[1].includes("bing.com")) results.push({ href: m[1], title: m[2].replace(/<[^>]+>/g, ""), body: "" });
      if (Array.isArray(r3)) results.push(...r3);
    } catch { }
    return results.slice(0, limit);
  }

  try {
    const kwSet = new Set([keyword]);
    const lang = LANG_MAP[country.toLowerCase().trim()] || "en";
    const [en, local] = await Promise.all([translate(keyword, "en"), translate(keyword, lang)]);
    kwSet.add(en); kwSet.add(local);

    const categories = {
      Web: [], Facebook: [], Instagram: [], TikTok: [], LinkedIn: [], Twitter: [], Telegram: [], WhatsApp: []
    };
    const searchTasks = [];

    // Parallel Search variations
    for (const kw of kwSet) {
      if (!kw) continue;
      searchTasks.push(unifiedSearch(`"${kw}" "${country}"`, 15));
      Object.entries(PLATFORM_DOMAINS).forEach(([plat, ds]) => {
        searchTasks.push(unifiedSearch(`site:${ds[0]} "${kw}"`, 10));
      });
    }

    const allResults = (await Promise.all(searchTasks)).flat();
    const seenUrls = new Set();

    for (const r of allResults) {
      if (!r.href || seenUrls.has(r.href)) continue;
      seenUrls.add(r.href);

      try {
        const dom = new URL(r.href).hostname.replace("www.", "");
        const emails = [...new Set((r.title + " " + r.body + " " + r.href).match(EMAIL_REGEX) || [])].map(e => e.toLowerCase());
        const phones = [...new Set((r.title + " " + r.body).match(PHONE_REGEX) || [])].filter(p => p.length > 8);
        
        const resObj = { 
          title: r.title, 
          link: r.href, 
          snippet: r.body, 
          emails: emails, 
          phones: phones 
        };

        const platEntry = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
        if (platEntry) {
          categories[platEntry[0]].push(resObj);
        } else {
          categories.Web.push(resObj);
        }
      } catch { }
    }

    // Filter out empty categories
    const finalResponse = {};
    Object.entries(categories).forEach(([name, list]) => {
      if (list.length > 0) finalResponse[name] = list.slice(0, 50);
    });

    return res.status(200).json(finalResponse);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
