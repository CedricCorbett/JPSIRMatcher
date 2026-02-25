import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, Clock, CheckCircle, Globe, Plus, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase.ts'
import type { Physician } from '../lib/types.ts'
import StatusBadge from '../components/StatusBadge.tsx'
import { StatSkeleton, TableRowSkeleton } from '../components/LoadingSkeleton.tsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const [physicians, setPhysicians] = useState<Physician[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, completedToday: 0, activeSites: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [physRes, sitesRes] = await Promise.all([
      supabase
        .from('physicians')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('recruiter_sites')
        .select('id')
        .eq('active', true),
    ])

    const phys = (physRes.data || []) as Physician[]
    setPhysicians(phys)

    const today = new Date().toISOString().split('T')[0]

    setStats({
      total: phys.length,
      pending: phys.filter((p) => p.status === 'pending' || p.status === 'processing').length,
      completedToday: phys.filter((p) => p.status === 'complete' && p.created_at.startsWith(today)).length,
      activeSites: sitesRes.data?.length || 0,
    })

    setLoading(false)
  }

  const statCards = [
    { label: 'Total Physicians', value: stats.total, icon: Users, color: 'text-gold' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber' },
    { label: 'Completed Today', value: stats.completedToday, icon: CheckCircle, color: 'text-green' },
    { label: 'Active Sites', value: stats.activeSites, icon: Globe, color: 'text-blue' },
  ]

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-1">Physician recruiting intelligence overview</p>
        </div>
        <Link
          to="/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: '#070B14' }}
        >
          <Plus className="w-4 h-4" />
          New Physician
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
          : statCards.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-bg-card p-5 transition-all duration-200 hover:bg-bg-card-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-text-muted uppercase tracking-wider">{stat.label}</span>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className={`font-mono text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
      </div>

      {/* Recent Submissions */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-text-primary">Recent Submissions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted uppercase tracking-wider border-b border-border">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Specialty</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Created</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} />)
                : physicians.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-text-muted">
                        No physicians submitted yet. Click "New Physician" to get started.
                      </td>
                    </tr>
                  )
                  : physicians.map((physician, idx) => (
                    <tr
                      key={physician.id}
                      className="hover:bg-bg-card-hover transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <td className="px-5 py-3 font-medium text-text-primary">{physician.full_name}</td>
                      <td className="px-5 py-3 text-text-secondary">{physician.specialty}</td>
                      <td className="px-5 py-3"><StatusBadge status={physician.status} /></td>
                      <td className="px-5 py-3 text-text-muted font-mono text-xs">
                        {new Date(physician.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => navigate(`/physician/${physician.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
                        >
                          View <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
