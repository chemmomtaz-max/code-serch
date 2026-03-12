import re
from ddgs import DDGS
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Set
from deep_translator import GoogleTranslator

# ---- Regex ----
email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')
phone_regex = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}')

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
    "portugal": "pt", "saudi arabia": "ar", "egypt": "ar",
    "united arab emirates": "ar", "syria": "ar", "lebanon": "ar",
    "jordan": "ar", "kuwait": "ar", "qatar": "ar", "bahrain": "ar",
    "oman": "ar", "yemen": "ar", "morocco": "ar", "algeria": "ar",
    "tunisia": "ar", "afghanistan": "fa", "pakistan": "ur",
    "india": "hi", "indonesia": "id", "malaysia": "ms",
    "vietnam": "vi", "thailand": "th", "ukraine": "uk", "poland": "pl",
    "greece": "el", "netherlands": "nl", "sweden": "sv",
}

PLATFORM_SITES = {
    "facebook":  "site:facebook.com",
    "instagram": "site:instagram.com",
    "tiktok":    "site:tiktok.com",
    "linkedin":  "site:linkedin.com",
    "telegram":  "site:t.me",
    "whatsapp":  "site:wa.me OR site:chat.whatsapp.com",
}

PLATFORM_DOMAINS = {
    "facebook":  ["facebook.com", "fb.com", "fb.me"],
    "instagram": ["instagram.com", "instagr.am"],
    "tiktok":    ["tiktok.com"],
    "linkedin":  ["linkedin.com"],
    "telegram":  ["t.me", "telegram.me", "telegram.org"],
    "whatsapp":  ["whatsapp.com", "wa.me"],
}

PLATFORM_ICONS = {
    "facebook": "🔵",
    "instagram": "📸",
    "tiktok": "🎵",
    "linkedin": "💼",
    "telegram": "✈️",
    "whatsapp": "💬",
    "website": "🌐",
}

def extract_contacts(text: str):
    emails = list(set(email_regex.findall(text)))
    phones = list(set(phone_regex.findall(text)))
    return emails, phones


def get_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        return domain
    except Exception:
        return url


class OSINTSearcher:
    def __init__(self):
        self.ddgs = DDGS()

    def _translate(self, keyword: str, dest: str) -> str:
        try:
            return GoogleTranslator(source="auto", target=dest).translate(keyword) or keyword
        except Exception:
            return keyword

    def _get_all_keywords(self, keyword: str, country: str) -> List[str]:
        keywords = set([keyword])
        en = self._translate(keyword, "en")
        if en: keywords.add(en)
        lang = COUNTRY_LANG_MAP.get(country.lower().strip(), "en")
        if lang != "en":
            local = self._translate(keyword, lang)
            if local: keywords.add(local)
        return list(keywords)

    def _search_platform(self, keyword: str, platform: str, max_results: int) -> List[Dict]:
        site_op = PLATFORM_SITES.get(platform, "")
        domains = PLATFORM_DOMAINS.get(platform, [])
        query = f'{site_op} {keyword}'.strip()
        results = []
        try:
            raw = list(self.ddgs.text(query, max_results=max_results))
            for r in raw:
                link = r.get("href", "")
                if not link:
                    continue
                if domains and not any(d in link.lower() for d in domains):
                    continue
                results.append({
                    "title": r.get("title", ""),
                    "link": link,
                    "snippet": r.get("body", ""),
                    "platform": platform,
                })
        except Exception as e:
            print(f"  Error [{platform}]: {e}")
        return results

    def search_entities(self, keyword: str, country: str, max_results_per_platform: int = 15) -> List[EntityCard]:
        all_keywords = self._get_all_keywords(keyword, country)
        print(f"Searching with keywords: {all_keywords}")

        # Collect all raw results from all platforms
        entity_map: Dict[str, EntityCard] = {}

        platforms = list(PLATFORM_SITES.keys())

        for kw in all_keywords:
            # General web search (for website + contacts)
            try:
                web_results = list(self.ddgs.text(kw, max_results=max_results_per_platform))
                for r in web_results:
                    link = r.get("href", "")
                    title = r.get("title", "").strip()
                    snippet = r.get("body", "")
                    if not link or not title:
                        continue
                    domain = get_domain(link)
                    # Skip social media from general results
                    if any(d in link.lower() for plat_domains in PLATFORM_DOMAINS.values() for d in plat_domains):
                        continue
                    emails, phones = extract_contacts(f"{title} {snippet}")
                    key = domain
                    if key not in entity_map:
                        entity_map[key] = EntityCard(name=title, website=link, snippet=snippet)
                    if emails:
                        entity_map[key].emails = list(set(entity_map[key].emails + emails))
                    if phones:
                        entity_map[key].phones = list(set(entity_map[key].phones + phones))
            except Exception as e:
                print(f"  Web search error: {e}")

            # Social media searches
            for platform in platforms:
                raw = self._search_platform(kw, platform, max_results_per_platform)
                for r in raw:
                    link = r["link"]
                    title = r["title"].strip()
                    snippet = r["snippet"]
                    domain = get_domain(link)
                    emails, phones = extract_contacts(f"{title} {snippet}")

                    # Key by domain
                    key = domain
                    if key not in entity_map:
                        entity_map[key] = EntityCard(name=title, snippet=snippet)

                    # Add social profile if not already there
                    existing_urls = [p.url for p in entity_map[key].social_profiles]
                    if link not in existing_urls:
                        entity_map[key].social_profiles.append(
                            SocialProfile(platform=platform, url=link)
                        )
                    if emails:
                        entity_map[key].emails = list(set(entity_map[key].emails + emails))
                    if phones:
                        entity_map[key].phones = list(set(entity_map[key].phones + phones))

        # Return only entities that have at least one piece of useful contact/social info
        results = [e for e in entity_map.values() if e.website or e.social_profiles or e.emails or e.phones]
        return results[:80]
