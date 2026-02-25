import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Copy, ExternalLink, CheckCircle, AlertTriangle,
  Loader2, Search, ChevronRight, Trash2, RotateCcw
} from 'lucide-react'
import { supabase } from '../lib/supabase.ts'
import type { Physician, Match } from '../lib/types.ts'
import PhysicianCard from '../components/PhysicianCard.tsx'
import MatchCard from '../components/MatchCard.tsx'
import ScoreGauge from '../components/ScoreGauge.tsx'
import { CardSkeleton } from '../components/LoadingSkeleton.tsx'
import { useToast } from '../components/Toast.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { useAuth } from '../App.tsx'

const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export default function MatchResults() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { addToast } = useToast()

  const [physician, setPhysician] = useState<Physician | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null)
  const [loading, setLoading] = useState(true)
  const [timedOut, setTimedOut] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showReprocessConfirm, setShowReprocessConfirm] = useState(false)
  const [reprocessing, setReprocessing] = useState(false)

  const processingStartRef = useRef<number | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    if (!id) return

    const { data: phys, error: physError } = await supabase
      .from('physicians')
      .select('*')
      .eq('id', id)
      .single()

    if (physError) {
      addToast('Failed to load physician data', 'error')
      setLoading(false)
      return
    }

    if (phys) setPhysician(phys as Physician)

    if (phys?.status === 'complete') {
      const { data: matchData, error: matchError } = await supabase
        .from('matches')
        .select('*, job_listing:job_listings(*)')
        .eq('physician_id', id)
        .order('rank', { ascending: true })

      if (matchError) {
        addToast('Failed to load match results', 'error')
      }

      const m = (matchData || []) as Match[]
      setMatches(m)
      if (m.length > 0 && !selectedMatch) {
        setSelectedMatch(m[0])
      }
    }

    setLoading(false)
  }, [id])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription for physician status changes
  useEffect(() => {
    if (!id) return

    const channel = supabase
      .channel(`physician-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'physicians',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Physician
          setPhysician(updated)
          if (updated.status === 'complete') {
            fetchData()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, fetchData])

  // Polling fallback while processing + timeout tracking
  useEffect(() => {
    if (!physician || (physician.status !== 'pending' && physician.status !== 'processing')) {
      processingStartRef.current = null
      return
    }

    if (!processingStartRef.current) {
      processingStartRef.current = Date.now()
    }

    const interval = setInterval(() => {
      if (processingStartRef.current && Date.now() - processingStartRef.current > PROCESSING_TIMEOUT_MS) {
        setTimedOut(true)
        clearInterval(interval)
        return
      }
      fetchData()
    }, 5000)

    return () => clearInterval(interval)
  }, [physician?.status, fetchData])

  function handleSelectMatch(match: Match) {
    setSelectedMatch(match)
    // Scroll detail into view on mobile
    if (window.innerWidth < 1024 && detailRef.current) {
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  function copyEmail(text: string) {
    navigator.clipboard.writeText(text)
    addToast('Email summary copied to clipboard', 'success')
  }

  async function confirmDelete() {
    if (!id) return
    const { error } = await supabase.from('physicians').delete().eq('id', id)
    if (error) {
      addToast(error.message, 'error')
    } else {
      addToast('Physician deleted', 'info')
      navigate('/')
    }
    setShowDeleteConfirm(false)
  }

  async function confirmReprocess() {
    if (!id || !session?.user?.id) return
    setReprocessing(true)
    setShowReprocessConfirm(false)

    // Delete existing matches and job_listings for this physician
    await supabase.from('matches').delete().eq('physician_id', id)
    await supabase.from('job_listings').delete().eq('physician_id', id)

    // Reset status to pending
    await supabase.from('physicians').update({ status: 'pending', error_message: null }).eq('id', id)

    setMatches([])
    setSelectedMatch(null)
    setTimedOut(false)
    processingStartRef.current = null
    addToast('Reprocessing started', 'success')

    // Re-call edge function
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${supabaseUrl}/functions/v1/process-physician`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ physician_id: id, recruiter_id: session.user.id }),
      keepalive: true,
    }).catch((err) => {
      console.error('Reprocess edge function error:', err)
    })

    setReprocessing(false)
    fetchData()
  }

  if (loading) {
    return (
      <div className="space-y-6 pb-20 md:pb-0">
        <CardSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <CardSkeleton />
            <CardSkeleton />
          </div>
          <div className="lg:col-span-3">
            <CardSkeleton />
          </div>
        </div>
      </div>
    )
  }

  if (!physician) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">Physician not found.</p>
        <button onClick={() => navigate('/')} className="text-gold text-sm mt-4 hover:underline">
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Breadcrumbs + Actions */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1.5 text-sm">
          <Link to="/" className="text-text-secondary hover:text-text-primary transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-primary font-medium">
            {physician.full_name}
          </span>
        </nav>
        <div className="flex items-center gap-2">
          {(physician.status === 'complete' || physician.status === 'error') && (
            <button
              onClick={() => setShowReprocessConfirm(true)}
              disabled={reprocessing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue border border-blue/30 hover:bg-blue/10 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reprocess
            </button>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red border border-red/30 hover:bg-red/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Physician Card */}
      <PhysicianCard physician={physician} />

      {/* Status Bar */}
      <StatusBar physician={physician} matchCount={matches.length} timedOut={timedOut} />

      {/* Match Results */}
      {physician.status === 'complete' && matches.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Match cards */}
          <div className="lg:col-span-2 space-y-3 lg:max-h-[calc(100vh-400px)] lg:overflow-y-auto lg:pr-2">
            {matches.map((match, idx) => (
              <div key={match.id} className="animate-fade-in" style={{ animationDelay: `${idx * 80}ms` }}>
                <MatchCard
                  match={match}
                  selected={selectedMatch?.id === match.id}
                  onClick={() => handleSelectMatch(match)}
                />
              </div>
            ))}
          </div>

          {/* Right: Detail panel */}
          <div className="lg:col-span-3" ref={detailRef}>
            {selectedMatch && <MatchDetail match={selectedMatch} onCopyEmail={copyEmail} />}
          </div>
        </div>
      )}

      {physician.status === 'complete' && matches.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-card p-12 text-center">
          <Search className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary">No matches found.</p>
          <p className="text-text-muted text-sm mt-1">
            {physician.error_message || 'Try adding more sites to your registry or adjusting the physician profile.'}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Physician"
        message="This will permanently delete this physician and all associated job listings and matches. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <ConfirmDialog
        open={showReprocessConfirm}
        title="Reprocess Physician"
        message="This will delete all existing matches and re-run the search from scratch. Continue?"
        confirmLabel="Reprocess"
        onConfirm={confirmReprocess}
        onCancel={() => setShowReprocessConfirm(false)}
      />
    </div>
  )
}

function StatusBar({ physician, matchCount, timedOut }: { physician: Physician; matchCount: number; timedOut: boolean }) {
  if (timedOut && (physician.status === 'pending' || physician.status === 'processing')) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red/5 border border-red/20">
        <AlertTriangle className="w-4 h-4 text-red" />
        <span className="text-sm text-red">
          Processing is taking longer than expected. Please refresh the page or try again later.
        </span>
      </div>
    )
  }

  if (physician.status === 'pending') {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-amber/5 border border-amber/20">
        <Loader2 className="w-4 h-4 text-amber animate-spin" />
        <span className="text-sm text-amber">Queued for processing...</span>
      </div>
    )
  }

  if (physician.status === 'processing') {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-blue/5 border border-blue/20">
        <Loader2 className="w-4 h-4 text-blue animate-spin" />
        <span className="text-sm text-blue">Searching your registered job sites for matches...</span>
      </div>
    )
  }

  if (physician.status === 'error') {
    return (
      <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-red/5 border border-red/20">
        <AlertTriangle className="w-4 h-4 text-red" />
        <span className="text-sm text-red">{physician.error_message || 'An error occurred during processing.'}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-green/5 border border-green/20">
      <CheckCircle className="w-4 h-4 text-green" />
      <span className="text-sm text-green">
        Results Ready — {matchCount} match{matchCount !== 1 ? 'es' : ''} found
      </span>
    </div>
  )
}

function MatchDetail({ match, onCopyEmail }: { match: Match; onCopyEmail: (text: string) => void }) {
  const job = match.job_listing

  return (
    <div className="rounded-xl border border-border bg-bg-card p-6 space-y-6 animate-slide-in sticky top-0">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-xl font-bold text-text-primary">
            {job?.job_title || 'Untitled Position'}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            {job?.organization} &middot; {job?.location}
          </p>
        </div>
        <ScoreGauge score={match.match_score} size={72} />
      </div>

      {/* Reasoning */}
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Match Reasoning</h4>
        <p className="text-sm text-text-secondary leading-relaxed">{match.match_reasoning}</p>
      </div>

      {/* Strengths */}
      {match.strengths && match.strengths.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Strengths</h4>
          <ul className="space-y-2">
            {match.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <CheckCircle className="w-4 h-4 text-green shrink-0 mt-0.5" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Considerations (renamed from Gaps/Concerns) */}
      {match.gaps && match.gaps.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Considerations</h4>
          <ul className="space-y-2">
            {match.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                <AlertTriangle className="w-4 h-4 text-amber shrink-0 mt-0.5" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Email Summary */}
      {match.email_summary && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider">Email Summary</h4>
            <button
              onClick={() => onCopyEmail(match.email_summary!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
          </div>
          <div className="p-4 rounded-lg bg-bg-primary border border-border">
            <p className="text-sm text-text-secondary leading-relaxed">{match.email_summary}</p>
          </div>
        </div>
      )}

      {/* External Link */}
      {job?.job_url && (
        <a
          href={job.job_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-card-hover hover:text-text-primary transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          View Original Posting
        </a>
      )}
    </div>
  )
}
