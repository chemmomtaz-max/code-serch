import re
import requests
from pydantic import BaseModel
from typing import List, Optional, Dict

# ---- Regex ----
email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
phone_regex = re.compile(r'(?:\+?\d{1,3}[-.\\s]?)?(?:\(?\d{2,4}\)?[-.\\s]?)?\d{3,4}[-.\\s]?\d{3,4}')

# ---- Pydantic Models ----
class SocialProfile(BaseModel):
    platform: str
    url: str

class EntityCard(BaseModel):
    name: str
    website: Optional[str] = None
    emails: List[str] = []
    phones: List[str] = []
    social_profiles: List[SocialProfile] = []
    snippet: str = ""

# ---- Country -> Language map ----
COUNTRY_LANG_MAP = {
    "iran": "fa", "iraq": "ar", "germany": "de", "france": "fr",
    "spain": "es", "italy": "it", "russia": "ru", "china": "zh-CN",
    "japan": "ja", "korea (south)": "ko", "turkey": "tr", "brazil": "pt",
    "saudi arabia": "ar", "egypt": "ar", "united arab emirates": "ar", "syria": "ar",
    "lebanon": "ar", "jordan": "ar", "kuwait": "ar", "qatar": "ar",
    "afghanistan": "fa", "pakistan": "ur", "india": "hi",
    "indonesia": "id", "malaysia": "ms", "vietnam": "vi", "thailand": "th",
    "ukraine": "uk", "poland": "pl", "netherlands": "nl", "sweden": "sv",
}

PLATFORM_SITES = {
    "facebook":  "site:facebook.com",
    "instagram": "site:instagram.com",
    "tiktok":    "site:tiktok.com",
    "linkedin":  "site:linkedin.com",
    "telegram":  "site:t.me",
    "whatsapp":  "site:wa.me",
}

PLATFORM_DOMAINS = {
    "facebook":  ["facebook.com", "fb.com", "fb.me"],
    "instagram": ["instagram.com"],
    "tiktok":    ["tiktok.com"],
    "linkedin":  ["linkedin.com"],
    "telegram":  ["t.me", "telegram.me"],
    "whatsapp":  ["whatsapp.com", "wa.me"],
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

def extract_contacts(text: str):
    emails = list(set(email_regex.findall(text)))
    phones = list(set(phone_regex.findall(text)))
    return emails, phones

def get_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url

def ddg_search(query: str, max_results: int = 10) -> List[Dict]:
    """Search DuckDuckGo using their free HTML API."""
    try:
        response = requests.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": 1, "no_redirect": 1, "kl": "us-en"},
            headers=HEADERS,
            timeout=15
        )
        data = response.json()
        results = []

        # Check RelatedTopics
        for item in data.get("RelatedTopics", []):
            if isinstance(item, dict):
                url = item.get("FirstURL", "")
                text = item.get("Text", "")
                if url and text:
                    results.append({"href": url, "title": text[:80], "body": text})

        # Supplement with Bing scraper if needed
        if len(results) < 3:
            bing_results = bing_search(query, max_results)
            results.extend(bing_results)

        return results[:max_results]
    except Exception as e:
        print(f"DDG search error: {e}")
        return bing_search(query, max_results)

def bing_search(query: str, max_results: int = 10) -> List[Dict]:
    """Fallback: Search using Bing."""
    try:
        resp = requests.get(
            "https://www.bing.com/search",
            params={"q": query, "count": max_results},
            headers=HEADERS,
            timeout=15
        )
        matches = re.findall(
            r'<a href="(https?://[^"]+?)"[^>]*><h2[^>]*>(.*?)</h2>',
            resp.text
        )
        results = []
        for url, title in matches:
            title_clean = re.sub(r'<[^>]+>', '', title).strip()
            if title_clean and "bing.com" not in url and "microsoft.com" not in url:
                results.append({"href": url, "title": title_clean, "body": title_clean})
        return results[:max_results]
    except Exception as e:
        print(f"Bing search error: {e}")
        return []

def translate_with_mymemory(text: str, target_lang: str) -> str:
    """Free translation using MyMemory API (no key required)."""
    try:
        resp = requests.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text, "langpair": f"auto|{target_lang}"},
            timeout=10
        )
        return resp.json()["responseData"]["translatedText"] or text
    except Exception:
        return text

class OSINTSearcher:
    def _get_all_keywords(self, keyword: str, country: str) -> List[str]:
        keywords = set([keyword])
        try:
            en = translate_with_mymemory(keyword, "en")
            if en and en != keyword:
                keywords.add(en)
        except Exception:
            pass
        lang = COUNTRY_LANG_MAP.get(country.lower().strip(), "")
        if lang and lang != "en":
            try:
                local = translate_with_mymemory(keyword, lang)
                if local and local != keyword:
                    keywords.add(local)
            except Exception:
                pass
        return list(keywords)

    def search_entities(self, keyword: str, country: str, max_results_per_platform: int = 10) -> List[EntityCard]:
        all_keywords = self._get_all_keywords(keyword, country)
        print(f"Searching with keywords: {all_keywords}")

        entity_map: Dict[str, EntityCard] = {}

        for kw in all_keywords:
            # General web search
            try:
                web_results = ddg_search(kw, max_results=max_results_per_platform)
                for r in web_results:
                    link = r.get("href", "")
                    title = r.get("title", "").strip()
                    snippet = r.get("body", "")
                    if not link or not title:
                        continue
                    if any(d in link.lower() for plat_domains in PLATFORM_DOMAINS.values() for d in plat_domains):
                        continue
                    domain = get_domain(link)
                    emails, phones = extract_contacts(f"{title} {snippet}")
                    if domain not in entity_map:
                        entity_map[domain] = EntityCard(name=title, website=link, snippet=snippet)
                    if emails:
                        entity_map[domain].emails = list(set(entity_map[domain].emails + emails))
                    if phones:
                        entity_map[domain].phones = list(set(entity_map[domain].phones + phones))
            except Exception as e:
                print(f"Web search error: {e}")

            # Social media searches
            for platform, site_op in PLATFORM_SITES.items():
                domains = PLATFORM_DOMAINS.get(platform, [])
                query = f'{site_op} "{kw}"'
                try:
                    raw = ddg_search(query, max_results=max_results_per_platform)
                    for r in raw:
                        link = r.get("href", "")
                        title = r.get("title", "").strip()
                        snippet = r.get("body", "")
                        if not link:
                            continue
                        if domains and not any(d in link.lower() for d in domains):
                            continue
                        domain = get_domain(link)
                        emails, phones = extract_contacts(f"{title} {snippet}")
                        if domain not in entity_map:
                            entity_map[domain] = EntityCard(name=title, snippet=snippet)
                        existing_urls = [p.url for p in entity_map[domain].social_profiles]
                        if link not in existing_urls:
                            entity_map[domain].social_profiles.append(
                                SocialProfile(platform=platform, url=link)
                            )
                        if emails:
                            entity_map[domain].emails = list(set(entity_map[domain].emails + emails))
                        if phones:
                            entity_map[domain].phones = list(set(entity_map[domain].phones + phones))
                except Exception as e:
                    print(f"Platform [{platform}] error: {e}")

        results = [e for e in entity_map.values() if e.website or e.social_profiles or e.emails or e.phones]
        return results[:60]
