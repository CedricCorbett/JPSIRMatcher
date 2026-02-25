import clsx from 'clsx'

interface ScoreGaugeProps {
  score: number
  size?: number
}

export default function ScoreGauge({ score, size = 64 }: ScoreGaugeProps) {
  const strokeWidth = size > 48 ? 4 : 3
  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const center = size / 2

  const getColor = (s: number) => {
    if (s >= 75) return 'var(--color-green)'
    if (s >= 50) return 'var(--color-amber)'
    return 'var(--color-red)'
  }

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      title="75+: Strong match · 50–74: Moderate match · Below 50: Weak match"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span
        className={clsx('absolute font-mono font-medium', size > 48 ? 'text-sm' : 'text-xs')}
        style={{ color: getColor(score) }}
      >
        {score}
      </span>
    </div>
  )
}
