import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center max-w-sm mx-4">
        <Search className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <h1 className="font-display text-4xl font-bold text-text-primary mb-2">404</h1>
        <p className="text-sm text-text-secondary mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: '#070B14' }}
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
