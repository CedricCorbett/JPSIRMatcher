import { useState, useEffect } from 'react'
import { Plus, Trash2, Lock, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../App.tsx'
import { useToast } from '../components/Toast.tsx'
import ConfirmDialog from '../components/ConfirmDialog.tsx'
import { TableRowSkeleton } from '../components/LoadingSkeleton.tsx'
import type { RecruiterSite } from '../lib/types.ts'

export default function MySites() {
  const { session } = useAuth()
  const { addToast } = useToast()
  const [sites, setSites] = useState<RecruiterSite[]>([])
  const [globalSites, setGlobalSites] = useState<RecruiterSite[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ site_name: '', base_url: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    fetchSites()
  }, [])

  async function fetchSites() {
    try {
      const { data } = await supabase
        .from('recruiter_sites')
        .select('*')
        .order('created_at', { ascending: false })

      const all = (data || []) as RecruiterSite[]
      setSites(all.filter((s) => !s.is_global && s.recruiter_id === session?.user?.id))
      setGlobalSites(all.filter((s) => s.is_global))
    } catch {
      addToast('Failed to load sites', 'error')
    }
    setLoading(false)
  }

  async function addSite(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user?.id) return

    setSubmitting(true)

    const { error } = await supabase.from('recruiter_sites').insert({
      recruiter_id: session.user.id,
      site_name: form.site_name,
      base_url: form.base_url,
      notes: form.notes || null,
      active: true,
      is_global: false,
    })

    if (error) {
      addToast(error.message, 'error')
    } else {
      addToast('Site added successfully', 'success')
      setForm({ site_name: '', base_url: '', notes: '' })
      setShowForm(false)
      fetchSites()
    }

    setSubmitting(false)
  }

  async function toggleActive(site: RecruiterSite) {
    const { error } = await supabase
      .from('recruiter_sites')
      .update({ active: !site.active })
      .eq('id', site.id)

    if (error) {
      addToast(error.message, 'error')
    } else {
      fetchSites()
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return

    const { error } = await supabase
      .from('recruiter_sites')
      .delete()
      .eq('id', deleteTarget)

    if (error) {
      addToast(error.message, 'error')
    } else {
      addToast('Site removed', 'info')
      fetchSites()
    }

    setDeleteTarget(null)
  }

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors'

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">My Sites</h1>
          <p className="text-sm text-text-secondary mt-1">Manage your job site registry for searches</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
          style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: '#070B14' }}
        >
          <Plus className="w-4 h-4" />
          Add Site
        </button>
      </div>

      {/* Add Site Form */}
      {showForm && (
        <form onSubmit={addSite} className="rounded-xl border border-gold/20 bg-bg-card p-5 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Site Name *
              </label>
              <input
                type="text"
                required
                value={form.site_name}
                onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                className={inputClass}
                placeholder="PracticeLink"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                Base URL *
              </label>
              <input
                type="url"
                required
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                className={inputClass}
                placeholder="https://www.practicelink.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              Notes
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputClass}
              placeholder="Optional notes about this site..."
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #C9A84C, #E8C97A)', color: '#070B14' }}
            >
              {submitting ? 'Adding...' : 'Add Site'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 py-2.5 rounded-lg text-sm text-text-secondary border border-border hover:bg-bg-card-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* My Sites Table */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display text-lg font-semibold text-text-primary">Your Sites</h2>
        </div>
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
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <TableRowSkeleton key={i} />)
              ) : sites.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-text-muted">No custom sites yet. Add one above.</td></tr>
              ) : sites.map((site) => (
                <SiteRow key={site.id} site={site} onToggle={toggleActive} onDelete={(id) => setDeleteTarget(id)} canDelete />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Sites */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Lock className="w-4 h-4 text-text-muted" />
          <h2 className="font-display text-lg font-semibold text-text-primary">Global Sites</h2>
          <span className="text-xs text-text-muted">(managed by admin)</span>
        </div>
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
                <tr><td colSpan={4} className="px-5 py-8 text-center text-text-muted">No global sites configured.</td></tr>
              ) : globalSites.map((site) => (
                <SiteRow key={site.id} site={site} onToggle={() => {}} onDelete={() => {}} canDelete={false} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Site"
        message="Are you sure you want to remove this site? This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function SiteRow({
  site,
  onToggle,
  onDelete,
  canDelete,
}: {
  site: RecruiterSite
  onToggle: (site: RecruiterSite) => void
  onDelete: (id: string) => void
  canDelete: boolean
}) {
  return (
    <tr className="hover:bg-bg-card-hover transition-colors">
      <td className="px-5 py-3">
        <div className="font-medium text-text-primary">{site.site_name}</div>
        {site.notes && <div className="text-xs text-text-muted mt-0.5">{site.notes}</div>}
      </td>
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
        <button
          onClick={() => onToggle(site)}
          disabled={!canDelete}
          className={clsx(
            'px-3 py-1 rounded-full text-xs font-medium transition-colors',
            site.active
              ? 'bg-green/10 text-green'
              : 'bg-text-muted/10 text-text-muted',
            canDelete && 'cursor-pointer hover:opacity-80'
          )}
        >
          {site.active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-5 py-3">
        {canDelete && (
          <button
            onClick={() => onDelete(site.id)}
            className="p-1.5 rounded-lg text-text-muted hover:text-red hover:bg-red/10 transition-colors"
            aria-label={`Delete ${site.site_name}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  )
}
