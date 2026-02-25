import { useState, useEffect } from 'react'
import { Users, Globe, Activity, BarChart3, Plus, Trash2, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../App.tsx'
import { useToast } from '../components/Toast.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import type { Profile, RecruiterSite } from '../lib/types.ts'
import { StatSkeleton } from '../components/LoadingSkeleton.tsx'

export default function AdminPanel() {
  const { profile } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [recruiters, setRecruiters] = useState<Profile[]>([])
  const [globalSites, setGlobalSites] = useState<RecruiterSite[]>([])
  const [stats, setStats] = useState({ totalRecruiters: 0, totalPhysicians: 0, totalMatches: 0, totalSites: 0 })
  const [showSiteForm, setShowSiteForm] = useState(false)
  const [siteForm, setSiteForm] = useState({ site_name: '', base_url: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    try {
      const [recruitersRes, physRes, matchesRes, sitesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('physicians').select('id', { count: 'exact', head: true }),
        supabase.from('matches').select('id', { count: 'exact', head: true }),
        supabase.from('recruiter_sites').select('*').eq('is_global', true).order('created_at', { ascending: false }),
      ])

      setRecruiters((recruitersRes.data || []) as Profile[])
      setGlobalSites((sitesRes.data || []) as RecruiterSite[])
      setStats({
        totalRecruiters: recruitersRes.data?.length || 0,
        totalPhysicians: physRes.count || 0,
        totalMatches: matchesRes.count || 0,
        totalSites: sitesRes.data?.length || 0,
      })
    } catch {
      addToast('Failed to load admin data', 'error')
    }
    setLoading(false)
  }

  async function addGlobalSite(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.id) return

    setSubmitting(true)

    const { error } = await supabase.from('recruiter_sites').insert({
      recruiter_id: profile.id,
      site_name: siteForm.site_name,
      base_url: siteForm.base_url,
      notes: siteForm.notes || null,
      active: true,
      is_global: true,
    })

    if (error) {
      addToast(error.message, 'error')
    } else {
      addToast('Global site added', 'success')
      setSiteForm({ site_name: '', base_url: '', notes: '' })
      setShowSiteForm(false)
      fetchAll()
    }

    setSubmitting(false)
  }

  async function confirmDeleteGlobalSite() {
    if (!deleteTarget) return

    const { error } = await supabase
      .from('recruiter_sites')
      .delete()
      .eq('id', deleteTarget)

    if (error) {
      addToast(error.message, 'error')
    } else {
      addToast('Global site removed', 'info')
      fetchAll()
    }

    setDeleteTarget(null)
  }

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors'

  const statCards = [
    { label: 'Total Recruiters', value: stats.totalRecruiters, icon: Users, color: 'text-gold' },
    { label: 'Total Physicians', value: stats.totalPhysicians, icon: Activity, color: 'text-blue' },
    { label: 'Total Matches', value: stats.totalMatches, icon: BarChart3, color: 'text-green' },
    { label: 'Global Sites', value: stats.totalSites, icon: Globe, color: 'text-amber' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">Admin Panel</h1>
        <p className="text-sm text-text-secondary mt-1">Platform-wide management and statistics</p>
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

      {/* Recruiters Table */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-text-primary">Recruiters</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted uppercase tracking-wider border-b border-border">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recruiters.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-text-muted">No recruiters found.</td></tr>
              ) : recruiters.map((r) => (
                <tr key={r.id} className="hover:bg-bg-card-hover transition-colors">
                  <td className="px-5 py-3 font-medium text-text-primary">{r.full_name || 'Unnamed'}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.role === 'admin' ? 'bg-gold/15 text-gold' : 'bg-blue/15 text-blue'}`}>
                      {r.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{r.company || '—'}</td>
                  <td className="px-5 py-3 text-text-muted font-mono text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Site Management */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-text-primary">Global Site Registry</h2>
          <button
            onClick={() => setShowSiteForm(!showSiteForm)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-gold hover:bg-gold/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Global Site
          </button>
        </div>

        {showSiteForm && (
          <form onSubmit={addGlobalSite} className="p-5 border-b border-border space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                required
                value={siteForm.site_name}
                onChange={(e) => setSiteForm({ ...siteForm, site_name: e.target.value })}
                className={inputClass}
                placeholder="Site Name"
              />
              <input
                type="url"
                required
                value={siteForm.base_url}
                onChange={(e) => setSiteForm({ ...siteForm, base_url: e.target.value })}
                className={inputClass}
                placeholder="https://..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: '#070B14' }}
              >
                {submitting ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => setShowSiteForm(false)}
                className="px-4 py-2 rounded-lg text-sm text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted uppercase tracking-wider border-b border-border">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">URL</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {globalSites.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-text-muted">No global sites.</td></tr>
              ) : globalSites.map((site) => (
                <tr key={site.id} className="hover:bg-bg-card-hover transition-colors">
                  <td className="px-5 py-3 font-medium text-text-primary">{site.site_name}</td>
                  <td className="px-5 py-3">
                    <a
                      href={site.base_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-text-secondary hover:text-gold transition-colors text-xs font-mono"
                    >
                      {site.base_url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-5 py-3">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green/10 text-green">Active</span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setDeleteTarget(site.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red hover:bg-red/10 transition-colors"
                      aria-label={`Delete ${site.site_name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Global Site"
        message="Are you sure you want to remove this global site? All recruiters will lose access to it."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDeleteGlobalSite}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
