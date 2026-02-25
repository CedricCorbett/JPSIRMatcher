import clsx from 'clsx'
import { MapPin, Building2 } from 'lucide-react'
import ScoreGauge from './ScoreGauge.tsx'
import type { Match } from '../lib/types.ts'

interface MatchCardProps {
  match: Match
  selected?: boolean
  onClick?: () => void
}

export default function MatchCard({ match, selected, onClick }: MatchCardProps) {
  const job = match.job_listing

  return (
    <div
      onClick={onClick}
      className={clsx(
        'relative rounded-xl border p-4 cursor-pointer transition-all duration-200',
        'hover:bg-bg-card-hover',
        selected
          ? 'border-gold bg-bg-card-hover shadow-lg shadow-gold/5'
          : 'border-border bg-bg-card',
        match.rank === 1 && 'border-t-2 border-t-gold'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'flex items-center justify-center w-8 h-8 rounded-lg font-mono text-sm font-medium shrink-0',
            match.rank === 1
              ? 'bg-gold/20 text-gold'
              : 'bg-border/50 text-text-secondary'
          )}
        >
          #{match.rank}
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-text-primary truncate">
            {job?.job_title || 'Untitled Position'}
          </h4>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
            <span className="flex items-center gap-1 truncate">
              <Building2 className="w-3 h-3 shrink-0" />
              {job?.organization || 'Unknown'}
            </span>
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 shrink-0" />
              {job?.location || 'Unknown'}
            </span>
          </div>
        </div>

        <ScoreGauge score={match.match_score} size={48} />
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {match.strengths?.slice(0, 2).map((s, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green/10 text-green truncate max-w-[140px]">
            {s}
          </span>
        ))}
        {match.gaps?.slice(0, 1).map((g, i) => (
          <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber/10 text-amber truncate max-w-[140px]">
            {g}
          </span>
        ))}
      </div>
    </div>
  )
}
