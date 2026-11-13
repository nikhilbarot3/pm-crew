import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

interface Engine { engine_id: string; rul: number; confidence: number; status: 'critical' | 'warning' | 'healthy' }
interface Detail extends Engine { subsystem_scores: Record<string, number> }
interface AgentResult {
  subsystem: string
  work_order: { recommended_action: string; priority: string }
  parts_check: Record<string, string>
}
interface Msg { role: 'user' | 'bot'; text: string; sources?: string[] }

const label = { critical: 'Critical', warning: 'Watch', healthy: 'Healthy' }
const name = (id: string) => 'Engine ' + parseInt(id.replace(/\D/g, ''), 10)
const conf = (c: number) => (c >= 0.85 ? 'High' : c >= 0.7 ? 'Medium' : 'Low')
const pretty = (s: string) => s.replace('_', ' ')

function Trend({ rul, threshold = 30 }: { rul: number; threshold?: number }) {
  // Illustrative trend derived from the current RUL estimate (no history is served by the ML API)
  const W = 560, H = 190, pad = 24
  const pts = Array.from({ length: 8 }, (_, i) => {
    const v = rul + (7 - i) * (rul * 0.45 + 6) * (1 - i * 0.04)
    return v
  })
  const max = Math.max(...pts, threshold + 10)
  const x = (i: number) => pad + (i * (W - 2 * pad)) / 7
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad)
  const path = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const ty = y(threshold)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label="Remaining life trend">
      <line x1={pad} x2={W - pad} y1={ty} y2={ty} stroke="#9aa0a6" strokeDasharray="4 4" />
      <text x={W - pad} y={ty - 6} textAnchor="end" fontSize="12" fill="#6b7280">Alert threshold</text>
      <path d={path} fill="none" stroke="#dc4a4a" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(7)} cy={y(pts[7])} r="5" fill="#dc4a4a" />
    </svg>
  )
}

export default function Dashboard() {
  const [engines, setEngines] = useState<Engine[]>([])
  const [selected, setSelected] = useState<string>('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [agent, setAgent] = useState<AgentResult | null>(null)
  const [running, setRunning] = useState(false)
  const [decision, setDecision] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const chatEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(api.ml('/engines')).then((r) => r.json()).then((d: Engine[]) => {
      const sorted = [...d].sort((a, b) => a.rul - b.rul)
      setEngines(sorted)
      if (sorted[0]) setSelected(sorted[0].engine_id)
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    setDetail(null); setAgent(null); setDecision(null); setEditing(false); setMsgs([])
    fetch(api.ml(`/engines/${selected}`)).then((r) => r.json()).then(setDetail)
    setRunning(true)
    fetch(api.agent(`/run/${selected}`), { method: 'POST' })
      .then((r) => r.json()).then(setAgent).catch(() => {}).finally(() => setRunning(false))
  }, [selected])

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])

  const decide = (d: string) =>
    fetch(api.agent(`/approve/${selected}`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: d }),
    }).then(() => setDecision(d))

  const ask = (q?: string) => {
    const question = (q ?? input).trim()
    if (!question) return
    setInput(''); setMsgs((m) => [...m, { role: 'user', text: question }]); setBusy(true)
    fetch(api.rag('/chat'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, engine_id: selected }),
    }).then((r) => r.json())
      .then((d) => setMsgs((m) => [...m, { role: 'bot', text: d.answer, sources: d.sources }]))
      .catch(() => setMsgs((m) => [...m, { role: 'bot', text: 'Assistant unavailable — please ask a person.' }]))
      .finally(() => setBusy(false))
  }

  const subs = Object.entries(detail?.subsystem_scores ?? {}).sort((a, b) => b[1] - a[1])
  const status = detail?.status as Engine['status'] | undefined

  return (
    <div className="shell">
      <main className="main">
        <section className="panel">
          <div className="panel-label">Fleet, ranked by remaining life</div>
          <div className="fleet">
            {engines.map((e) => (
              <button key={e.engine_id} className={`row ${selected === e.engine_id ? 'sel' : ''}`}
                onClick={() => setSelected(e.engine_id)}>
                <span>{name(e.engine_id)}</span>
                <span className="mid">{e.rul} cycles</span>
                <span className={`pill pill-${e.status}`}>{label[e.status]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="title-row">
            <h2>{selected ? name(selected) : 'Loading…'}</h2>
            <span className="muted">Precomputed scores</span>
          </div>
          {detail && (
            <>
              <div className="stats">
                <div className="stat"><div className="muted">Remaining life</div><div className="big">{detail.rul} cycles</div></div>
                <div className="stat"><div className="muted">Confidence</div><div className="big">{conf(detail.confidence)}</div></div>
                <div className="stat"><div className="muted">Alert</div><div className="big">{status === 'healthy' ? 'None' : 'Raised'}</div></div>
              </div>
              <div className="two">
                <div>
                  <div className="panel-label">Remaining life trend <span className="muted">(illustrative)</span></div>
                  <Trend rul={detail.rul} />
                </div>
                <div>
                  <div className="panel-label">Likely contributing subsystem</div>
                  {subs.map(([s, v], i) => (
                    <div key={s} className="bar-row">
                      <div className="bar-head"><span>{s}</span><span>{Math.round(v * 100)}%</span></div>
                      <div className="bar-bg"><div className={`bar-fill ${i === 0 ? 'top' : ''}`} style={{ width: `${v * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <div className="title-row">
            <h2>Draft work order</h2>
            {decision
              ? <span className={`pill pill-${decision === 'approved' ? 'healthy' : decision === 'rejected' ? 'critical' : 'warning'}`}>{decision}</span>
              : <span className="pill pill-warning">{running ? 'Drafting…' : 'Awaiting approval'}</span>}
          </div>
          {agent ? (
            <>
              <p className="wo">{agent.work_order.recommended_action} on {selected && name(selected)} — priority {agent.work_order.priority}.</p>
              <p className="muted small">Parts check: {Object.entries(agent.parts_check).map(([p, s]) => `${p} ${pretty(s)}`).join(' · ')}</p>
              <p className="muted small">Based on: RUL model, subsystem scores, maintenance history</p>
              {editing && (
                <textarea className="wo-edit" value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
              )}
              {!decision && !editing && (
                <div className="btns">
                  <button onClick={() => decide('approved')}>Approve</button>
                  <button onClick={() => { setDraft(agent.work_order.recommended_action); setEditing(true) }}>Edit</button>
                  <button onClick={() => decide('rejected')}>Reject</button>
                </div>
              )}
              {!decision && editing && (
                <div className="btns">
                  <button onClick={() => {
                    setAgent({ ...agent, work_order: { ...agent.work_order, recommended_action: draft } })
                    setEditing(false); decide('edited')
                  }}>Save &amp; approve</button>
                  <button onClick={() => setEditing(false)}>Cancel</button>
                </div>
              )}
              {decision && (
                <p className="muted small">
                  Recorded as {decision}. Nothing moves without a person's approval.{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setDecision(null) }}>Reopen</a>
                </p>
              )}
            </>
          ) : <p className="muted">{running ? 'The crew is analysing this engine…' : 'No work order available.'}</p>}
        </section>
      </main>

      <aside className="panel assistant">
        <div className="panel-label">Assistant</div>
        <div className="chat">
          {msgs.length === 0 && (
            <button className="suggest" onClick={() => ask('Has this happened before?')}>Has this happened before?</button>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div>{m.text}</div>
              {m.sources?.map((s) => <span key={s} className="chip">{s.replace('.txt', '')}</span>)}
            </div>
          ))}
          {busy && <div className="msg bot muted">Thinking…</div>}
          <div ref={chatEnd} />
        </div>
        <div className="muted small hint">Cites sources and hands off to a person when unsure.</div>
        <div className="ask">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()} placeholder={`Ask about ${selected ? name(selected) : 'an engine'}`} />
          <button onClick={() => ask()} aria-label="Send">➤</button>
        </div>
      </aside>
    </div>
  )
}
