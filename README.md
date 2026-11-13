# Predictive Maintenance Crew

> Michigan DevFest + AI Hackathon — Nov 13, 2026
> Focus area: **Modernizing Michigan Manufacturing**

An AI agent crew that warns a maintenance supervisor early about failing equipment, explains why, drafts a work order, and waits for human approval before acting.

---

## Architecture

```
React frontend
    |
    v
API gateway / BFF (Code Engine)
    |
    +--> services/ml        FastAPI + TensorFlow    RUL + subsystem scores
    +--> services/agents    LangGraph               Monitor -> Life -> Diagnose -> Plan -> [human approval]
    +--> services/data_rag  FastAPI + Chroma         manuals, history, parts; cited answers
              |
              +--> Cloudant        (work orders, parts, approvals)
              +--> Cloud Object Storage (C-MAPSS data, model weights, docs)

watsonx.ai: Granite LLM + embeddings (agents and RAG)
Speech to Text / Text to Speech: optional voice
```

## Repo Structure

```
pm-crew/
  frontend/            React: fleet list, engine detail, work order, chat
  services/
    ml/                FastAPI + model + precomputed scores
    agents/            LangGraph graph + approval endpoints
    data_rag/          FastAPI + Chroma + Cloudant client
  data/                sample docs, parts list, precomputed_scores.json
  README.md            architecture, tools used, AI disclosure
  .env.example         no real secrets
```

## Setup

### Prerequisites
- Node 20+ (frontend)
- Python 3.11+ (all backend services)
- IBM Cloud account with Code Engine project
- watsonx.ai project + API key

### Environment Variables
Copy `.env.example` to `.env` and fill in your values.

### Run locally

```bash
# ML service
cd services/ml && pip install -r requirements.txt && uvicorn main:app --port 8001 --reload

# Agent service
cd services/agents && pip install -r requirements.txt && uvicorn main:app --port 8002 --reload

# Data + RAG service
cd services/data_rag && pip install -r requirements.txt && uvicorn main:app --port 8003 --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Services Used

| Service | Purpose |
|---|---|
| watsonx.ai Runtime | Granite LLM (`ibm/granite-4-h-small`) via `langchain-ibm` for agents and RAG answers |
| Google Cloud Run | Hosts all 4 containers (frontend, ML, agents, data/RAG) |
| Google Artifact Registry | Container images |

> Hosting note: the target design was IBM Code Engine, Cloudant and Cloud Object Storage. The IBM account was on the Lite plan, which cannot create Code Engine projects, so the demo is deployed on Google Cloud Run. Cloudant, COS and Speech are **not** implemented.

## AI Tools Disclosed

- **watsonx.ai Granite** — LLM for all agents and RAG answers
- **LangGraph** — agent orchestration and human-in-the-loop approval
- **ChromaDB** (default MiniLM embeddings) — vector store for RAG
- **Synthetic turbofan data** — modelled on NASA C-MAPSS; maintenance docs and fault codes are synthetic
- **Precomputed RUL scores** — simulated per-engine values served from JSON (no live model inference yet)

> ⚠️ This demo runs on simulated NASA turbofan data, not a real manufacturing plant.
> Subsystem scores are influence indicators, not confirmed fault diagnoses.
> A real deployment would require retraining on customer machine data.

## Demo Flow

1. Supervisor opens the dashboard → sees fleet list with RUL and health status
2. Picks a flagged engine
3. Sees predicted RUL, confidence level, likely failing subsystem (Fan/LPC, HPC/Core, Turbine)
4. Sees drafted work order with parts availability check
5. Clicks **Approve**, **Edit**, or **Reject**
6. Optional: asks the chat assistant "why?" and gets a cited answer
