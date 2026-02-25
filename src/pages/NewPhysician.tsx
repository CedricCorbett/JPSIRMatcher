import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../App.tsx'
import { useToast } from '../components/Toast.tsx'
import { SPECIALTIES, US_STATES } from '../lib/types.ts'

export default function NewPhysician() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    full_name: '',
    specialty: '',
    subspecialty: '',
    years_experience: '',
    board_certified: false,
    current_state: '',
    preferred_states: [] as string[],
    practice_setting: '' as string,
    compensation_min: '',
    notes: '',
    raw_cv_text: '',
  })

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleState(state: string) {
    setForm((prev) => ({
      ...prev,
      preferred_states: prev.preferred_states.includes(state)
        ? prev.preferred_states.filter((s) => s !== state)
        : [...prev.preferred_states, state],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user?.id) return

    setLoading(true)

    const payload = {
      recruiter_id: session.user.id,
      full_name: form.full_name,
      specialty: form.specialty,
      subspecialty: form.subspecialty || null,
      years_experience: form.years_experience ? parseInt(form.years_experience) : null,
      board_certified: form.board_certified,
      current_state: form.current_state || null,
      preferred_states: form.preferred_states.length > 0 ? form.preferred_states : null,
      practice_setting: form.practice_setting || null,
      compensation_min: form.compensation_min ? parseInt(form.compensation_min) : null,
      notes: form.notes || null,
      raw_cv_text: form.raw_cv_text || null,
      status: 'pending' as const,
    }

    const { data, error } = await supabase
      .from('physicians')
      .insert(payload)
      .select()
      .single()

    if (error) {
      addToast(error.message, 'error')
      setLoading(false)
      return
    }

    // Fire the edge function (don't await)
    supabase.functions.invoke('process-physician', {
      body: { physician_id: data.id, recruiter_id: session.user.id },
    })

    addToast('Physician submitted — matching in progress', 'success')
    navigate(`/physician/${data.id}`)
  }

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors'

  return (
    <div className="max-w-5xl mx-auto pb-20 md:pb-0">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-text-primary">New Physician</h1>
        <p className="text-sm text-text-secondary mt-1">
          Enter physician details to find matching opportunities
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
              <h3 className="font-display text-base font-semibold text-text-primary">Profile Information</h3>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                  className={inputClass}
                  placeholder="Dr. Jane Smith"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Specialty *
                </label>
                <select
                  required
                  value={form.specialty}
                  onChange={(e) => update('specialty', e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select specialty...</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Subspecialty
                </label>
                <input
                  type="text"
                  value={form.subspecialty}
                  onChange={(e) => update('subspecialty', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Interventional Cardiology"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Years Experience
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={form.years_experience}
                    onChange={(e) => update('years_experience', e.target.value)}
                    className={inputClass}
                    placeholder="10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Board Certified
                  </label>
                  <button
                    type="button"
                    onClick={() => update('board_certified', !form.board_certified)}
                    className={clsx(
                      'w-full px-4 py-2.5 rounded-lg border text-sm text-left transition-colors',
                      form.board_certified
                        ? 'bg-green/10 border-green/30 text-green'
                        : 'bg-bg-primary border-border text-text-muted'
                    )}
                  >
                    {form.board_certified ? 'Yes — Board Certified' : 'No'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Current State
                  </label>
                  <select
                    value={form.current_state}
                    onChange={(e) => update('current_state', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select...</option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Practice Setting
                  </label>
                  <select
                    value={form.practice_setting}
                    onChange={(e) => update('practice_setting', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Any</option>
                    <option value="Academic">Academic</option>
                    <option value="Private">Private</option>
                    <option value="Hospital">Hospital</option>
                    <option value="Any">Any</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Minimum Compensation ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={form.compensation_min}
                  onChange={(e) => update('compensation_min', e.target.value)}
                  className={inputClass}
                  placeholder="300000"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Preferred States
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border bg-bg-primary min-h-[42px]">
                  {form.preferred_states.length === 0 && (
                    <span className="text-text-muted text-xs">Click states below to add...</span>
                  )}
                  {form.preferred_states.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 text-gold text-xs font-medium"
                    >
                      {state}
                      <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {US_STATES.filter((s) => !form.preferred_states.includes(s)).map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => toggleState(state)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono text-text-muted hover:text-gold hover:bg-gold/10 transition-colors"
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
              <h3 className="font-display text-base font-semibold text-text-primary">Additional Information</h3>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  className={clsx(inputClass, 'h-32 resize-none')}
                  placeholder="Any additional context about the physician..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Raw CV / Profile Text
                </label>
                <textarea
                  value={form.raw_cv_text}
                  onChange={(e) => update('raw_cv_text', e.target.value)}
                  className={clsx(inputClass, 'h-72 resize-none font-mono text-xs')}
                  placeholder="Paste full CV text, email profile, or referral notes here..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !form.full_name || !form.specialty}
          className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            background: 'linear-gradient(135deg, #C9A84C, #E8C97A)',
            color: '#070B14',
          }}
        >
          <Send className="w-4 h-4" />
          {loading ? 'Submitting...' : 'Find Matches'}
        </button>
      </form>
    </div>
  )
}
