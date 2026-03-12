from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn

from search_service import OSINTSearcher, EntityCard

app = FastAPI(title="OSINT Search API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

searcher = OSINTSearcher()

class SearchQuery(BaseModel):
    keyword: str
    country: str

@app.post("/api/search", response_model=List[EntityCard])
def search(query: SearchQuery):
    return searcher.search_entities(query.keyword, query.country)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
