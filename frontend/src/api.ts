// Central API config — reads build-time env vars injected by Dockerfile
// Falls back to localhost for local dev (vite proxy handles /api/* in dev)

const ML_URL    = import.meta.env.VITE_ML_URL    ?? '/api/ml'
const AGENT_URL = import.meta.env.VITE_AGENT_URL ?? '/api/agents'
const RAG_URL   = import.meta.env.VITE_RAG_URL   ?? '/api/rag'

export const api = {
  ml:    (path: string) => `${ML_URL}${path}`,
  agent: (path: string) => `${AGENT_URL}${path}`,
  rag:   (path: string) => `${RAG_URL}${path}`,
}
