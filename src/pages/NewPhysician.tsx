import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, X, ChevronDown, Search } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from '../App.tsx'
import { useToast } from '../components/Toast.tsx'
import { SPECIALTIES, US_STATES, REGION_GROUPS } from '../lib/types.ts'

const AUTOSAVE_KEY = 'physmatch_new_physician_draft'

interface FormState {
  full_name: string
  specialty: string
  subspecialty: string
  years_experience: string
  board_certified: boolean
  current_state: string
  preferred_states: string[]
  practice_setting: string
  compensation_min: string
  notes: string
  raw_cv_text: string
}

const initialForm: FormState = {
  full_name: '',
  specialty: '',
  subspecialty: '',
  years_experience: '',
  board_certified: false,
  current_state: '',
  preferred_states: [],
  practice_setting: '',
  compensation_min: '',
  notes: '',
  raw_cv_text: '',
}

type FormErrors = Partial<Record<keyof FormState, string>>

function StateMultiSelect({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (states: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = US_STATES.filter(
    (s) =>
      !selected.includes(s) &&
      s.toLowerCase().includes(search.toLowerCase())
  )

  function toggle(state: string) {
    if (selected.includes(state)) {
      onChange(selected.filter((s) => s !== state))
    } else {
      onChange([...selected, state])
      setSearch('')
    }
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-bg-primary border border-border text-sm cursor-text flex flex-wrap gap-1.5 items-center focus-within:border-gold transition-colors"
        onClick={() => setOpen(true)}
      >
        {selected.map((state) => (
          <button
            key={state}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggle(state)
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gold/15 text-gold text-xs font-medium hover:bg-gold/25 transition-colors"
          >
            {state}
            <X className="w-3 h-3" />
          </button>
        ))}
        <div className="relative flex-1 min-w-[80px]">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length === 0 ? 'Search states...' : ''}
            className="w-full bg-transparent outline-none text-text-primary text-sm placeholder:text-text-muted"
          />
        </div>
        <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-bg-card shadow-lg">
          {filtered.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => toggle(state)}
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-gold/10 hover:text-gold transition-colors"
            >
              {state}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function NewPhysician() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  // Restore draft from localStorage on mount
  const [form, setForm] = useState<FormState>(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY)
      if (saved) return { ...initialForm, ...JSON.parse(saved) }
    } catch { /* ignore */ }
    return initialForm
  })

  // Autosave on 500ms debounce
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form))
    }, 500)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [form])

  const update = useCallback((field: keyof FormState, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!form.full_name.trim()) errs.full_name = 'Full name is required'
    if (!form.specialty) errs.specialty = 'Specialty is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user?.id) return
    if (!validate()) return

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

    // Clear autosave on successful submit
    localStorage.removeItem(AUTOSAVE_KEY)

    addToast('Physician submitted — matching in progress', 'success')
    navigate(`/physician/${data.id}`)

    // Fire the edge function AFTER navigation so page change doesn't abort the request
    // Use fetch directly to avoid Supabase client abort-on-unmount behavior
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${supabaseUrl}/functions/v1/process-physician`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ physician_id: data.id, recruiter_id: session.user.id }),
      keepalive: true,
    }).catch((err) => {
      console.error('Edge function call error:', err)
    })
  }

  const inputClass =
    'w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-gold transition-colors'

  const errorInputClass =
    'w-full px-4 py-2.5 rounded-lg bg-bg-primary border border-red text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-red transition-colors'

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
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                  className={errors.full_name ? errorInputClass : inputClass}
                  placeholder="Dr. Jane Smith"
                />
                {errors.full_name && (
                  <p className="text-xs text-red mt-1">{errors.full_name}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  Specialty *
                </label>
                <select
                  value={form.specialty}
                  onChange={(e) => update('specialty', e.target.value)}
                  className={errors.specialty ? errorInputClass : inputClass}
                >
                  <option value="">Select specialty...</option>
                  {SPECIALTIES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.specialty && (
                  <p className="text-xs text-red mt-1">{errors.specialty}</p>
                )}
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
                    <option value="">Select...</option>
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
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.entries(REGION_GROUPS).map(([region, states]) => {
                    const allSelected = states.every((s) => form.preferred_states.includes(s))
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            update('preferred_states', form.preferred_states.filter((s) => !states.includes(s)))
                          } else {
                            const merged = new Set([...form.preferred_states, ...states])
                            update('preferred_states', [...merged])
                          }
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          allSelected
                            ? 'bg-gold/20 text-gold border border-gold/30'
                            : 'bg-bg-primary text-text-secondary border border-border hover:border-gold/30 hover:text-gold'
                        }`}
                      >
                        {region}
                      </button>
                    )
                  })}
                </div>
                <StateMultiSelect
                  selected={form.preferred_states}
                  onChange={(states) => update('preferred_states', states)}
                />
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-bg-card p-5">
              <button
                type="button"
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="flex items-center justify-between w-full"
              >
                <h3 className="font-display text-base font-semibold text-text-primary">Additional Details</h3>
                <ChevronDown
                  className={clsx(
                    'w-5 h-5 text-text-muted transition-transform duration-200',
                    detailsOpen && 'rotate-180'
                  )}
                />
              </button>

              {detailsOpen && (
                <div className="space-y-4 mt-4 animate-fade-in">
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
              )}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
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
