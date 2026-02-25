import { User, Stethoscope, MapPin, Award, Clock, Building2, DollarSign } from 'lucide-react'
import type { Physician } from '../lib/types.ts'
import StatusBadge from './StatusBadge.tsx'

interface PhysicianCardProps {
  physician: Physician
  compact?: boolean
}

export default function PhysicianCard({ physician, compact }: PhysicianCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
            <User className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-text-primary">
              {physician.full_name}
            </h3>
            <p className="text-sm text-text-secondary flex items-center gap-1">
              <Stethoscope className="w-3.5 h-3.5" />
              {physician.specialty}
              {physician.subspecialty && ` — ${physician.subspecialty}`}
            </p>
          </div>
        </div>
        <StatusBadge status={physician.status} />
      </div>

      {!compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {physician.years_experience != null && (
            <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="Experience" value={`${physician.years_experience} yrs`} />
          )}
          {physician.board_certified && (
            <InfoItem icon={<Award className="w-3.5 h-3.5" />} label="Board" value="Certified" />
          )}
          {physician.current_state && (
            <InfoItem icon={<MapPin className="w-3.5 h-3.5" />} label="Current" value={physician.current_state} />
          )}
          {physician.practice_setting && (
            <InfoItem icon={<Building2 className="w-3.5 h-3.5" />} label="Setting" value={physician.practice_setting} />
          )}
          {physician.compensation_min != null && (
            <InfoItem icon={<DollarSign className="w-3.5 h-3.5" />} label="Min Comp" value={`$${physician.compensation_min.toLocaleString()}`} />
          )}
          {physician.preferred_states && physician.preferred_states.length > 0 && (
            <div className="col-span-2">
              <InfoItem icon={<MapPin className="w-3.5 h-3.5" />} label="Preferred States" value={physician.preferred_states.join(', ')} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-muted">{icon}</span>
      <div>
        <span className="text-text-muted">{label}: </span>
        <span className="text-text-secondary font-medium">{value}</span>
      </div>
    </div>
  )
}
