"""
ML Service — Predictive Maintenance Crew
Serves precomputed RUL scores for FD004 engines.
Live inference can be added later if time allows.
"""
import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PM Crew — ML Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Load precomputed scores at startup
# ---------------------------------------------------------------------------
_DATA_PATH = Path(__file__).parent / "precomputed_scores.json"


def _load_scores() -> dict:
    if _DATA_PATH.exists():
        with open(_DATA_PATH) as f:
            return json.load(f)
    return {}


_scores: dict = _load_scores()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "engines_loaded": len(_scores)}


@app.get("/engines")
def list_engines():
    """Return all engines with RUL and health status."""
    result = []
    for engine_id, data in _scores.items():
        rul = data.get("rul", 0)
        result.append({
            "engine_id": engine_id,
            "rul": rul,
            "confidence": data.get("confidence", 0.0),
            "status": _health_status(rul),
        })
    return sorted(result, key=lambda e: e["rul"])


@app.get("/engines/{engine_id}")
def get_engine(engine_id: str):
    """Return full detail for one engine: RUL, confidence, subsystem scores."""
    data = _scores.get(engine_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Engine {engine_id} not found")
    return {
        "engine_id": engine_id,
        "rul": data.get("rul"),
        "confidence": data.get("confidence"),
        "status": _health_status(data.get("rul", 0)),
        "subsystem_scores": data.get("subsystem_scores", {}),
        "sensor_snapshot": data.get("sensor_snapshot", {}),
    }


def _health_status(rul: float) -> str:
    if rul <= 20:
        return "critical"
    if rul <= 50:
        return "warning"
    return "healthy"
