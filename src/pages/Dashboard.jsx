import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { getMonthlySignedCount } from '../lib/usage'
import Layout from '../components/Layout'
import UsageBadge from '../components/UsageBadge'

export default function Dashboard() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [usedThisMonth, setUsedThisMonth] = useState(0)
  const [plan, setPlan] = useState('free')
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (loading) return
    if (!user) {
      navigate('/login')
      return
    }
    void loadData()
  }, [user, loading])

  async function loadData() {
    setBusy(true)
    const [{ data: docs }, count, { data: profile }] = await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
      getMonthlySignedCount(user.id),
      supabase.from('profiles').select('plan').eq('id', user.id).single(),
    ])
    setDocuments(docs ?? [])
    setUsedThisMonth(count)
    setPlan(profile?.plan ?? 'free')
    setBusy(false)
  }

  const atLimit = plan === 'free' && usedThisMonth >= 10

  return (
    <Layout>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Your documents</h1>
        <UsageBadge used={usedThisMonth} plan={plan} />
      </div>

      {atLimit && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--seal)' }}>
          <p style={{ margin: 0 }}>
            You've used all 10 free signatures this month. Limit resets on the 1st.
          </p>
        </div>
      )}

      <Link
        to={atLimit ? '#' : '/sign/new'}
        className="btn btn-primary"
        style={{ marginBottom: '2rem', pointerEvents: atLimit ? 'none' : 'auto', opacity: atLimit ? 0.5 : 1 }}
      >
        Upload a document
      </Link>

      <div className="card">
        {busy ? (
          <p>Loading…</p>
        ) : documents.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--slate)' }}>
            No documents yet. Upload one to get started.
          </p>
        ) : (
          documents.map((doc) => (
            <div className="doc-row" key={doc.id}>
              <div>
                <div>{doc.file_name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--slate)' }}>
                  {new Date(doc.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className={`status-tag ${doc.status}`}>{doc.status}</span>
            </div>
          ))
        )}
      </div>
    </Layout>
  )
}
