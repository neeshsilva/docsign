import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Layout({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="container">
      <nav className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          Inkline
        </Link>
        <div>
          {user ? (
            <>
              <Link to="/dashboard">Dashboard</Link>
              <a href="#" onClick={(e) => { e.preventDefault(); handleSignOut() }}>Sign out</a>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </div>
      </nav>
      {children}
      <hr className="rule" />
      <footer style={{ fontSize: '0.8rem', color: 'var(--slate)', paddingBottom: '2rem' }}>
        <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
      </footer>
    </div>
  )
}
