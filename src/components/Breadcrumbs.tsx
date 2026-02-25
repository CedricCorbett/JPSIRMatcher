import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface Crumb {
  label: string
  to?: string
}

interface BreadcrumbsProps {
  crumbs: Crumb[]
}

export default function Breadcrumbs({ crumbs }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="text-text-secondary hover:text-text-primary transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-text-primary font-medium' : 'text-text-secondary'}>
                {crumb.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
