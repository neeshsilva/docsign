import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

export default function Home() {
  const { user } = useAuth()

  return (
    <Layout>
      <div style={{ padding: '3rem 0 4rem' }}>
        <h1 style={{ fontSize: '2.75rem', maxWidth: '18ch' }}>
          Upload a document. Sign it. Keep the record.
        </h1>
        <p style={{ fontSize: '1.1rem', color: 'var(--slate)' }}>
          Inkline gives every signature a timestamp, a consent record, and
          a tamper-evident hash — free for up to 10 documents a month.
        </p>
        <Link to={user ? '/dashboard' : '/login'} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          {user ? 'Go to dashboard' : 'Get started free'}
        </Link>
      </div>

      <hr className="rule" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
        <div>
          <h3>1. Upload</h3>
          <p style={{ color: 'var(--slate)' }}>Drop in a PDF you need signed.</p>
        </div>
        <div>
          <h3>2. Consent & sign</h3>
          <p style={{ color: 'var(--slate)' }}>
            Confirm you're signing electronically, then draw your signature.
          </p>
        </div>
        <div>
          <h3>3. Download</h3>
          <p style={{ color: 'var(--slate)' }}>
            Get the signed PDF back with an audit trail attached to your account.
          </p>
        </div>
      </div>
    </Layout>
  )
}
