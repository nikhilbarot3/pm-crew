import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

interface EngineDetail {
  engine_id: string
  rul: number
  confidence: number
  status: string
  subsystem_scores: Record<string, number>
  sensor_snapshot: Record<string, number>
}

interface AgentResult {
  subsystem: string
  work_order: {
    recommended_action: string
    priority: string
  }
  parts_check: Record<string, string>
}

interface ChatMessage {
  role: 'user' | 'bot'
  text: string
  sources?: string[]
}

export default function EngineDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [engine, setEngine] = useState<EngineDetail | null>(null)
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null)
  const [running, setRunning] = useState(false)
  const [decision, setDecision] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    fetch(api.ml(`/engines/${id}`))
      .then((r) => r.json())
      .then(setEngine)
  }, [id])

  const runCrew = () => {
    setRunning(true)
    fetch(api.agent(`/run/${id}`), { method: 'POST' })
      .then((r) => r.json())
      .then((data) => { setAgentResult(data); setRunning(false) })
      .catch(() => setRunning(false))
  }

  const sendDecision = (d: string) => {
    fetch(api.agent(`/approve/${id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: d }),
    }).then(() => setDecision(d))
  }

  const sendChat = () => {
    if (!chatInput.trim()) return
    const question = chatInput
    setChatInput('')
    setChatMessages((m) => [...m, { role: 'user', text: question }])
    setChatLoading(true)
    fetch(api.rag('/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, engine_id: id }),
    })
      .then((r) => r.json())
      .then((data) => {
        setChatMessages((m) => [...m, { role: 'bot', text: data.answer, sources: data.sources }])
        setChatLoading(false)
      })
      .catch(() => setChatLoading(false))
  }

  if (!engine) return <div className="container"><p>Loading…</p></div>

  const topSubsystem = engine.subsystem_scores
    ? Object.entries(engine.subsystem_scores).sort((a, b) => b[1] - a[1])[0]?.[0]
    : '—'

  return (
    <>
      <header>
        <button onClick={() => navigate('/')} style={{ marginRight: 12, background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>← Fleet</button>
        <div>
          <h1>{engine.engine_id.replace('_', ' ').toUpperCase()}</h1>
          <div className="subtitle">RUL: {engine.rul} cycles · Confidence: {Math.round(engine.confidence * 100)}%</div>
        </div>
        <span className={`badge badge-${engine.status}`} style={{ marginLeft: 'auto' }}>{engine.status}</span>
      </header>

      <div className="container">

        {/* Subsystem scores */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Subsystem Influence Scores</h3>
          <p style={{ fontSize: 12, color: '#57606a', marginBottom: 12 }}>
            These are attention-based influence indicators, not confirmed fault labels.
          </p>
          {Object.entries(engine.subsystem_scores || {})
            .sort((a, b) => b[1] - a[1])
            .map(([sub, score]) => (
              <div key={sub} className="sub-bar-wrap">
                <div className="sub-label">
                  <span>{sub}</span><span>{Math.round(score * 100)}%</span>
                </div>
                <div className="sub-bar-bg">
                  <div className="sub-bar-fill" style={{ width: `${score * 100}%` }} />
                </div>
              </div>
            ))}
        </div>

        {/* Run crew */}
        {!agentResult && !running && (
          <div className="card">
            <p>Top suspect subsystem: <strong>{topSubsystem}</strong></p>
            <button className="btn btn-approve" style={{ marginTop: 12 }} onClick={runCrew}>
              Run AI Crew →
            </button>
          </div>
        )}
        {running && <div className="card"><p>Running AI crew…</p></div>}

        {/* Work order */}
        {agentResult && !decision && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Drafted Work Order</h3>
            <p><strong>Subsystem:</strong> {agentResult.subsystem}</p>
            <p><strong>Action:</strong> {agentResult.work_order?.recommended_action}</p>
            <p><strong>Priority:</strong> {agentResult.work_order?.priority}</p>
            <h4 style={{ marginTop: 14, marginBottom: 6 }}>Parts Check</h4>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <tbody>
                {Object.entries(agentResult.parts_check || {}).map(([part, status]) => (
                  <tr key={part}>
                    <td style={{ padding: '4px 0' }}>{part}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge ${status === 'in_stock' ? 'badge-healthy' : status === 'on_order' ? 'badge-warning' : 'badge-critical'}`}>
                        {status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-group">
              <button className="btn btn-approve" onClick={() => sendDecision('approved')}>✓ Approve</button>
              <button className="btn btn-edit"    onClick={() => sendDecision('edited')}>✎ Edit</button>
              <button className="btn btn-reject"  onClick={() => sendDecision('rejected')}>✕ Reject</button>
            </div>
          </div>
        )}

        {decision && (
          <div className="card">
            <p>Work order <strong>{decision}</strong>. Nothing moves without your approval.</p>
          </div>
        )}

        {/* Chat assistant */}
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Ask the Maintenance Assistant</h3>
          <div className="chat-box">
            <div className="chat-messages">
              {chatMessages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  {m.role === 'user' ? <strong>You:</strong> : <strong>Assistant:</strong>} {m.text}
                  {m.sources && m.sources.length > 0 && (
                    <div className="chat-source">Sources: {m.sources.join(', ')}</div>
                  )}
                </div>
              ))}
              {chatLoading && <div className="chat-msg bot">Thinking…</div>}
            </div>
            <div className="chat-input-row">
              <input
                className="chat-input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                placeholder={`Why is ${id} flagged?`}
              />
              <button className="chat-send" onClick={sendChat}>Send</button>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
