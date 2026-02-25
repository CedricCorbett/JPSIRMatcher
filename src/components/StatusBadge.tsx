import clsx from 'clsx'

interface StatusBadgeProps {
  status: 'pending' | 'processing' | 'complete' | 'error'
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium font-mono',
        status === 'pending' && 'bg-amber/15 text-amber',
        status === 'processing' && 'bg-blue/15 text-blue animate-pulse',
        status === 'complete' && 'bg-green/15 text-green',
        status === 'error' && 'bg-red/15 text-red'
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          status === 'pending' && 'bg-amber',
          status === 'processing' && 'bg-blue',
          status === 'complete' && 'bg-green',
          status === 'error' && 'bg-red'
        )}
      />
      {status === 'complete' ? 'Complete' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
