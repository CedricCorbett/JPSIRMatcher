export interface Profile {
  id: string
  full_name: string | null
  role: 'recruiter' | 'admin'
  company: string | null
  created_at: string
}

export interface RecruiterSite {
  id: string
  recruiter_id: string
  site_name: string
  base_url: string
  notes: string | null
  active: boolean
  is_global: boolean
  operating_regions: string[] | null
  created_at: string
}

export interface Physician {
  id: string
  recruiter_id: string
  created_at: string
  full_name: string
  specialty: string
  subspecialty: string | null
  years_experience: number | null
  board_certified: boolean
  current_state: string | null
  preferred_states: string[] | null
  practice_setting: 'Academic' | 'Private' | 'Hospital' | 'Any' | null
  compensation_min: number | null
  notes: string | null
  raw_cv_text: string | null
  status: 'pending' | 'processing' | 'complete' | 'error'
  error_message: string | null
}

export interface JobListing {
  id: string
  recruiter_id: string
  physician_id: string
  source_site: string | null
  source_url: string | null
  job_title: string | null
  organization: string | null
  location: string | null
  state: string | null
  specialty: string | null
  description: string | null
  job_url: string | null
  raw_content: string | null
  created_at: string
}

export interface Match {
  id: string
  recruiter_id: string
  physician_id: string
  job_listing_id: string
  match_score: number
  match_reasoning: string | null
  strengths: string[] | null
  gaps: string[] | null
  email_summary: string | null
  rank: number
  created_at: string
  job_listing?: JobListing
}

export const SPECIALTIES = [
  'Allergy & Immunology',
  'Anesthesiology',
  'Cardiology',
  'Cardiothoracic Surgery',
  'Colorectal Surgery',
  'Critical Care Medicine',
  'Dermatology',
  'Emergency Medicine',
  'Endocrinology',
  'Family Medicine',
  'Gastroenterology',
  'General Surgery',
  'Geriatric Medicine',
  'Hematology/Oncology',
  'Hospital Medicine',
  'Infectious Disease',
  'Internal Medicine',
  'Interventional Radiology',
  'Maternal-Fetal Medicine',
  'Nephrology',
  'Neurology',
  'Neurological Surgery',
  'Obstetrics & Gynecology',
  'Ophthalmology',
  'Oral & Maxillofacial Surgery',
  'Orthopedic Surgery',
  'Otolaryngology (ENT)',
  'Pain Management',
  'Palliative Care',
  'Pathology',
  'Pediatrics',
  'Pediatric Surgery',
  'Physical Medicine & Rehabilitation',
  'Plastic Surgery',
  'Psychiatry',
  'Pulmonology',
  'Radiation Oncology',
  'Radiology',
  'Rheumatology',
  'Sleep Medicine',
  'Sports Medicine',
  'Transplant Surgery',
  'Urology',
  'Vascular Surgery',
] as const

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const

export const REGION_GROUPS: Record<string, readonly string[]> = {
  'Northeast': ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VT'],
  'Southeast': ['AL','AR','FL','GA','KY','LA','MS','NC','SC','TN','VA','WV'],
  'Midwest': ['IA','IL','IN','KS','MI','MN','MO','ND','NE','OH','SD','WI'],
  'Southwest': ['AZ','NM','OK','TX'],
  'Mountain West': ['CO','ID','MT','NV','UT','WY'],
  'Pacific': ['AK','CA','HI','OR','WA'],
} as const
