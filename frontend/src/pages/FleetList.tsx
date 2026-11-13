import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

interface Engine {
  engine_id: string
  rul: number
  confidence: number
  status: 'critical' | 'warning' | 'healthy'
}

export default function FleetList() {
  const [engines, setEngines] = useState<Engine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetch(api.ml('/engines'))
      .then((r) => r.json())
      .then((data) => { setEngines(data); setLoading(false) })
      .catch(() => { setError('Could not load engines'); setLoading(false) })
  }, [])

  return (
    <>
      <header>
        <div>
          <h1>PM Crew — Fleet Dashboard</h1>
          <div className="subtitle">Michigan DevFest + AI Hackathon · Nov 13, 2026</div>
        </div>
      </header>
      <div className="container">
        <h2 style={{ marginBottom: 16 }}>Fleet Overview</h2>
        {loading && <p>Loading engines…</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {engines.map((e) => (
          <div key={e.engine_id} className="card" onClick={() => navigate(`/engine/${e.engine_id}`)}>
            <div className="card-row">
              <div>
                <div className="card-title">{e.engine_id.replace('_', ' ').toUpperCase()}</div>
                <div className="card-meta">
                  RUL: <strong>{e.rul} cycles</strong> · Confidence: {Math.round(e.confidence * 100)}%
                </div>
              </div>
              <span className={`badge badge-${e.status}`}>{e.status}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
