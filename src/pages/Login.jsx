import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  if (user) {
    navigate('/dashboard')
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <Layout>
      <div className="card" style={{ maxWidth: 420, margin: '3rem auto' }}>
        <h2>Sign in</h2>
        {sent ? (
          <p>Check <strong>{email}</strong> for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" className="btn btn-primary">Send sign-in link</button>
          </form>
        )}
      </div>
    </Layout>
  )
}
