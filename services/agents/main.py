"""
Agent Service — Predictive Maintenance Crew
LangGraph crew: Monitor -> Life Estimator -> Diagnostician -> Planner -> Human Approval
"""
import os
from typing import TypedDict, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.graph import StateGraph, END

load_dotenv()

app = FastAPI(title="PM Crew — Agent Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ML_URL = os.getenv("ML_SERVICE_URL", "http://localhost:8001")
DATA_RAG_URL = os.getenv("DATA_RAG_SERVICE_URL", "http://localhost:8003")

# ---------------------------------------------------------------------------
# LLM factory — swap IBM <-> Google with one env var
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
# Shared state
# ---------------------------------------------------------------------------

class State(TypedDict, total=False):
    engine_id: str
    rul: float
    confidence: float
    subsystem: str          # "Fan/LPC" | "HPC/Core" | "Turbine"
    subsystem_scores: dict
    work_order: dict
    parts_check: dict       # {part_name: "in_stock" | "on_order" | "missing"}
    decision: str           # "approved" | "edited" | "rejected"
    escalate: bool
    error: str


# ---------------------------------------------------------------------------
# Agent nodes
# ---------------------------------------------------------------------------

def monitor(state: State) -> State:
    """Fetch ML scores, flag anomaly."""
    with httpx.Client() as client:
        resp = client.get(f"{ML_URL}/engines/{state['engine_id']}")
        resp.raise_for_status()
        data = resp.json()

    return {
        **state,
        "rul": data["rul"],
        "confidence": data["confidence"],
        "subsystem_scores": data.get("subsystem_scores", {}),
    }


def life_estimator(state: State) -> State:
    """Assess RUL and flag escalation if confidence is too low."""
    if state.get("confidence", 1.0) < 0.5:
        return {**state, "escalate": True}
    return state


def diagnostician(state: State) -> State:
    """Pick the top subsystem from scores."""
    scores = state.get("subsystem_scores", {})
    if not scores:
        return {**state, "subsystem": "Unknown"}
    top = max(scores, key=scores.get)
    return {**state, "subsystem": top}


def planner(state: State) -> State:
    """Draft a work order. Parts check is stubbed — connect Cloudant later."""
    work_order = {
        "engine_id": state["engine_id"],
        "rul": state["rul"],
        "subsystem": state.get("subsystem", "Unknown"),
        "recommended_action": f"Inspect and service {state.get('subsystem', 'Unknown')} assembly",
        "priority": "high" if state["rul"] <= 20 else "medium",
    }
    # Stub parts check — replace with real Cloudant lookup
    parts_check = {
        "Filter kit": "in_stock",
        "Bearing set": "on_order",
        "Seal gasket": "in_stock",
    }
    return {**state, "work_order": work_order, "parts_check": parts_check}


def human_gate(state: State) -> State:
    """
    Interrupt point. LangGraph pauses here until the frontend POSTs a decision.
    In the full build: compile with interrupt_before=["human"] and a checkpointer.
    """
    # decision will be injected by the approval endpoint
    return state


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

def route_after_life(state: State) -> str:
    return "stop" if state.get("escalate") else "go"


# ---------------------------------------------------------------------------
# Build graph
# ---------------------------------------------------------------------------

def _build_graph():
    g = StateGraph(State)
    g.add_node("monitor", monitor)
    g.add_node("life", life_estimator)
    g.add_node("diagnose", diagnostician)
    g.add_node("plan", planner)
    g.add_node("human", human_gate)

    g.set_entry_point("monitor")
    g.add_edge("monitor", "life")
    g.add_conditional_edges("life", route_after_life, {"go": "diagnose", "stop": END})
    g.add_edge("diagnose", "plan")
    g.add_edge("plan", "human")
    g.add_edge("human", END)

    # TODO: add a Cloudant-backed checkpointer + interrupt_before=["human"]
    return g.compile()


crew = _build_graph()


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/run/{engine_id}")
def run_crew(engine_id: str):
    """Kick off the agent crew for one engine."""
    try:
        result = crew.invoke({"engine_id": engine_id})
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/approve/{engine_id}")
def approve(engine_id: str, body: dict):
    """
    Receive the supervisor's decision (approve / edit / reject).
    In the full build, this resumes the interrupted LangGraph thread.
    """
    decision = body.get("decision")
    if decision not in {"approved", "edited", "rejected"}:
        raise HTTPException(status_code=400, detail="decision must be approved | edited | rejected")

    # TODO: resume the checkpointed graph thread with the decision
    return {"engine_id": engine_id, "decision": decision, "status": "recorded"}
