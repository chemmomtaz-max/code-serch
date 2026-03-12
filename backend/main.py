from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uvicorn
import traceback

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

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend is running!"}

@app.post("/api/search", response_model=List[EntityCard])
def search(query: SearchQuery):
    try:
        return searcher.search_entities(query.keyword, query.country)
    except Exception as e:
        error_msg = f"Backend Error: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
