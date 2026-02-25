import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.ts'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #070B14 0%, #0D1321 40%, #111827 70%, #070B14 100%)',
        backgroundSize: '400% 400%',
        animation: 'gradient-shift 15s ease infinite',
      }}
    >
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-bg-card/80 backdrop-blur-sm p-8 shadow-2xl shadow-black/40">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-bold text-gold mb-2">PhysMatch</h1>
            <p className="text-text-secondary text-sm tracking-wide uppercase">
              Physician Intelligence Platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors"
                placeholder="you@jacksonphysiciansearch.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-red text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #C9A84C, #E8C97A)',
                color: '#070B14',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-text-muted text-xs mt-6">
          Jackson Physician Search &middot; Powered by Obsidian Axis Group
        </p>
      </div>
    </div>
  )
}
