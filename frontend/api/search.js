/** 
 * OSINT Search API - High Reliability Categorized Version
 * Batches queries to handle Vercel limits and uses robust scrapers.
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

  async function unifiedSearch(query, limit = 15) {
    const results = [];
    try {
      // Use Mojeek, Bing Mobile, and DuckDuckGo Lite
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
      
      // Mojeek scraper
      const m1 = h1.matchAll(/<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<p[^>]*class="s"[^>]*>(.*?)<\/p>/gs);
      for (const m of m1) {
        results.push({ 
          href: m[1], 
          title: m[2].replace(/<[^>]+>/g, "").replace(/^.*https?:\/\//, "").trim(),
          body: m[3].replace(/<[^>]+>/g, "").trim() 
        });
      }

      // DuckDuckGo Lite scraper
      const dMatches = h3.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>.*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gs);
      for (const m of dMatches) {
        let url = m[1];
        if (url.includes("uddg=")) {
           url = decodeURIComponent(url.split("uddg=")[1].split("&")[0]);
        }
        results.push({
          href: url,
          title: m[2].replace(/<[^>]+>/g, "").trim(),
          body: m[3].replace(/<[^>]+>/g, "").trim()
        });
      }

      // Bing scraper
      const bMatches = h2.matchAll(/<li[^>]*class="b_algo"[^>]*>.*?<h2><a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>.*?<p[^>]*>(.*?)<\/p>/gs);
      for (const m of bMatches) {
        results.push({
          href: m[1],
          title: m[2].replace(/<[^>]+>/g, "").trim(),
          body: m[3].replace(/<[^>]+>/g, "").trim()
        });
      }
      
      if (results.length < 5) {
        const m2 = h2.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/g);
        for (const m of m2) {
          const url = m[1];
          const title = m[2].replace(/<[^>]+>/g, "").trim();
          if (!url.includes("bing.com") && title.length > 5) {
            results.push({ href: url, title: title, body: "" });
          }
        }
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

    const categories = {
      Web: [], 
      Facebook: [], 
      Instagram: [], 
      TikTok: [], 
      LinkedIn: [], 
      Twitter: [], 
      Telegram: [], 
      WhatsApp: []
    };
    const seenUrls = new Set();

    // Strategy: Batch queries to keep Vercel happy
    const kwList = Array.from(kwSet);
    for (const kw of kwList) {
      if (!kw) continue;
      
      // 1. General search (High depth)
      searchTasks.push(unifiedSearch(`"${kw}" "${country}"`, 20));
      searchTasks.push(unifiedSearch(`"${kw}" official profile`, 15));
      searchTasks.push(unifiedSearch(`#${kw.replace(/\s+/g, '')} ${country}`, 15)); // Hashtag search
      
      // 2. Parallel social dorks for this keyword (Strict targets)
      const platformKeys = ["Facebook", "Instagram", "TikTok", "LinkedIn", "Twitter", "Telegram", "WhatsApp"];
      const chunks = Array.from({ length: Math.ceil(platformKeys.length / 3) }, (_, i) => platformKeys.slice(i * 3, i * 3 + 3));
      
      for (const chunk of chunks) {
        const dorkTasks = [];
        chunk.forEach(p => {
          const domains = PLATFORM_DOMAINS[p];
          // Use up to 2 domains per platform for dorking depth
          domains.slice(0, 2).forEach(dom => {
            dorkTasks.push(unifiedSearch(`site:${dom} "${kw}"`, 10));
            dorkTasks.push(unifiedSearch(`site:${dom} #${kw.replace(/\s+/g, '')}`, 8));
          });
        });
        
        const platResults = await Promise.all(dorkTasks);
        
        // Flatten and categorize
        let taskIdx = 0;
        chunk.forEach(p => {
          const domains = PLATFORM_DOMAINS[p];
          domains.slice(0, 2).forEach(() => {
            // Processing results from two tasks (exact and hashtag) per domain
            [platResults[taskIdx++], platResults[taskIdx++]].forEach(list => {
              if (!list) return;
              list.forEach(r => {
                if (seenUrls.has(r.href)) return;
                const content = (r.title + " " + r.body).toLowerCase();
                if (!kwList.some(k => content.includes(k.toLowerCase())) && !content.includes(country.toLowerCase())) return;

                seenUrls.add(r.href);
                categories[p].push({ title: r.title, link: r.href, snippet: r.body, emails: [], phones: [] });
              });
            });
          });
        });
      }

      // Add web results to categories by site mapping
      const webBatches = await Promise.all(searchTasks);
      webBatches.flat().forEach(r => {
        if (!r.href || seenUrls.has(r.href)) return;
        
        const content = (r.title + " " + r.body).toLowerCase();
        const isHighlyRelevant = kwList.some(k => content.includes(k.toLowerCase()));
        if (!isHighlyRelevant && !content.includes(country.toLowerCase())) return; // Anti-Fake filter

        seenUrls.add(r.href);
        try {
          const dom = new URL(r.href).hostname.toLowerCase();
          const platEntry = Object.entries(PLATFORM_DOMAINS).find(([p, ds]) => ds.some(d => dom.includes(d)));
          if (platEntry) {
            categories[platEntry[0]].push({ title: r.title, link: r.href, snippet: r.body, emails: [], phones: [] });
          } else {
            categories.Web.push({ title: r.title, link: r.href, snippet: r.body, emails: [], phones: [] });
          }
        } catch {
          categories.Web.push({ title: r.title, link: r.href, snippet: r.body, emails: [], phones: [] });
        }
      });
    }

    // 3. Contact extraction from ALL found results
    Object.values(categories).flat().forEach(item => {
      const text = `${item.title} ${item.snippet} ${item.link}`;
      item.emails = [...new Set((text.match(EMAIL_REGEX) || []).map(e => e.toLowerCase()))];
      item.phones = [...new Set((text.match(PHONE_REGEX) || []))].filter(p => p.length > 8);
    });

    const finalResponse = {};
    Object.entries(categories).forEach(([name, list]) => {
      if (list.length > 0) finalResponse[name] = list.slice(0, 50);
    });

    return res.status(200).json(finalResponse);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
