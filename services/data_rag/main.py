"""
Data + RAG Service — Predictive Maintenance Crew
FastAPI + ChromaDB for cited answers. Cloudant for work orders and approvals.
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="PM Crew — Data & RAG Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# ChromaDB + WatsonxEmbeddings — initialized lazily
# ---------------------------------------------------------------------------

_chroma_client = None
_collection = None


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        import chromadb
        from langchain_ibm import WatsonxEmbeddings

        _chroma_client = chromadb.Client()
        _collection = _chroma_client.get_or_create_collection("pm-docs")

        # Seed with documents from data/ if the collection is empty
        if _collection.count() == 0:
            _seed_documents()

    return _collection


def _seed_documents():
    """Load synthetic maintenance docs from data/ into Chroma."""
    docs_path = Path(__file__).parent / "docs"
    if not docs_path.exists():
        return

    ids, texts, metadatas = [], [], []
    for i, doc_file in enumerate(sorted(docs_path.glob("*.txt"))):
        texts.append(doc_file.read_text())
        ids.append(f"doc_{i}")
        metadatas.append({"source": doc_file.name})

    if texts:
        _collection.add(documents=texts, ids=ids, metadatas=metadatas)


# ---------------------------------------------------------------------------
# LLM factory (same pattern as agent service)
# ---------------------------------------------------------------------------

def get_llm():
    if os.getenv("LLM_PROVIDER") == "google":
        from langchain_google_vertexai import ChatVertexAI
        return ChatVertexAI(model_name=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"))
    from langchain_ibm import ChatWatsonx
    return ChatWatsonx(
        model_id=os.getenv("WATSONX_MODEL_ID", "ibm/granite-3-8b-instruct"),
        url=os.getenv("WATSONX_URL"),
        apikey=os.getenv("WATSONX_API_KEY"),
        project_id=os.getenv("WATSONX_PROJECT_ID"),
        params={"max_new_tokens": 512, "temperature": 0.1},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
def chat(body: dict):
    """
    RAG chat endpoint. Returns answer + cited sources.
    Body: { "question": "...", "engine_id": "optional" }
    """
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    collection = _get_collection()
    results = collection.query(query_texts=[question], n_results=4)
    docs = results.get("documents", [[]])[0]
    sources = [m.get("source", "unknown") for m in results.get("metadatas", [[]])[0]]

    if not docs:
        return {"answer": "I don't have that information.", "sources": []}

    context = "\n\n".join(docs)
    prompt = (
        f"You are a maintenance assistant. Answer using ONLY the context below.\n"
        f"If the answer is not in the context, say 'I don't have that information.'\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\nAnswer:"
    )

    try:
        llm = get_llm()
        response = llm.invoke(prompt)
        answer = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        import traceback; print("LLM_ERROR", str(e)[:700], "|", str(getattr(e, "error_msg", ""))[:500], flush=True)
        # LLM unavailable: fall back to the best-matching document excerpts
        answer = "(LLM unavailable — showing matching manual excerpts)\n\n" + docs[0][:1200]

    return {"answer": answer, "sources": sources}


@app.get("/workorders")
def list_workorders():
    """List work orders from Cloudant. Stub — replace with real Cloudant client."""
    # TODO: connect ibmcloudant SDK
    return {"workorders": [], "note": "Cloudant not connected yet"}


@app.post("/workorders")
def create_workorder(body: dict):
    """Save an approved work order to Cloudant."""
    # TODO: connect ibmcloudant SDK
    return {"status": "saved", "doc": body, "note": "Cloudant not connected yet"}
