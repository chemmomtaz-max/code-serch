import re
import sys
import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import traceback

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Regex ----
email_regex = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')

COUNTRY_LANG_MAP = {
    "iran": "fa", "iraq": "ar", "germany": "de", "france": "fr",
    "spain": "es", "italy": "it", "russia": "ru", "china": "zh-CN",
    "japan": "ja", "turkey": "tr", "brazil": "pt",
    "saudi arabia": "ar", "egypt": "ar", "united arab emirates": "ar",
    "syria": "ar", "lebanon": "ar", "afghanistan": "fa", "india": "hi",
    "indonesia": "id", "malaysia": "ms", "pakistan": "ur",
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
    "facebook":  ["facebook.com", "fb.com"],
    "instagram": ["instagram.com"],
    "tiktok":    ["tiktok.com"],
    "linkedin":  ["linkedin.com"],
    "telegram":  ["t.me", "telegram.me"],
    "whatsapp":  ["whatsapp.com", "wa.me"],
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

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

class SearchQuery(BaseModel):
    keyword: str
    country: str

def get_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc.replace("www.", "")
    except Exception:
        return url

def bing_search(query: str, max_results: int = 8) -> List[Dict]:
    try:
        resp = requests.get(
            "https://www.bing.com/search",
            params={"q": query, "count": max_results},
            headers=HEADERS,
            timeout=20
        )
        links = re.findall(r'<a href="(https?://[^"&]+)"[^>]*><h2', resp.text)
        titles = re.findall(r'<h2[^>]*>(.*?)</h2>', resp.text)
        snippets = re.findall(r'<p[^>]*class="b_lineclamp[^"]*"[^>]*>(.*?)</p>', resp.text)
        results = []
        for i, link in enumerate(links[:max_results]):
            if "bing.com" in link or "microsoft.com" in link:
                continue
            title = re.sub(r'<[^>]+>', '', titles[i] if i < len(titles) else link)
            snip = re.sub(r'<[^>]+>', '', snippets[i] if i < len(snippets) else "")
            results.append({"href": link, "title": title.strip(), "body": snip.strip()})
        return results
    except Exception as e:
        print(f"Bing error: {e}")
        return []

def translate_text(text: str, lang: str) -> str:
    try:
        resp = requests.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text, "langpair": f"en|{lang}"},
            timeout=8
        )
        translated = resp.json()["responseData"]["translatedText"]
        return translated if translated and translated.lower() != text.lower() else text
    except Exception:
        return text

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/search", response_model=List[EntityCard])
def search(query: SearchQuery):
    try:
        keyword = query.keyword.strip()
        country = query.country.strip().lower()
        keywords = [keyword]
        lang = COUNTRY_LANG_MAP.get(country, "")
        if lang and lang != "en":
            try:
                translated = translate_text(keyword, lang)
                if translated != keyword:
                    keywords.append(translated)
            except Exception:
                pass

        entity_map: Dict[str, EntityCard] = {}

        for kw in keywords:
            # General web search
            raw = bing_search(kw, max_results=8)
            for r in raw:
                link = r.get("href", "")
                title = r.get("title", "").strip()
                snippet = r.get("body", "")
                if not link or not title:
                    continue
                if any(d in link.lower() for plat_d in PLATFORM_DOMAINS.values() for d in plat_d):
                    continue
                domain = get_domain(link)
                emails = list(set(email_regex.findall(f"{title} {snippet}")))
                if domain not in entity_map:
                    entity_map[domain] = EntityCard(name=title, website=link, snippet=snippet[:200])
                if emails:
                    entity_map[domain].emails = list(set(entity_map[domain].emails + emails))

            # Social platform searches
            for platform, site_op in PLATFORM_SITES.items():
                domains = PLATFORM_DOMAINS.get(platform, [])
                plat_results = bing_search(f'{site_op} "{kw}"', max_results=5)
                for r in plat_results:
                    link = r.get("href", "")
                    title = r.get("title", "").strip()
                    snippet = r.get("body", "")
                    if not link:
                        continue
                    if domains and not any(d in link.lower() for d in domains):
                        continue
                    domain = get_domain(link)
                    emails = list(set(email_regex.findall(f"{title} {snippet}")))
                    if domain not in entity_map:
                        entity_map[domain] = EntityCard(name=title, snippet=snippet[:200])
                    existing_urls = [p.url for p in entity_map[domain].social_profiles]
                    if link not in existing_urls:
                        entity_map[domain].social_profiles.append(SocialProfile(platform=platform, url=link))
                    if emails:
                        entity_map[domain].emails = list(set(entity_map[domain].emails + emails))

        results = [e for e in entity_map.values() if e.website or e.social_profiles or e.emails]
        return results[:50]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{str(e)}\n{traceback.format_exc()}")
