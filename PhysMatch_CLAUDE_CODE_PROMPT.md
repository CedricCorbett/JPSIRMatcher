# PhysMatch — Claude Code Build Prompt
### Paste this entire file into Claude Code after project setup

---

You are building **PhysMatch** — a multi-tenant physician recruiting intelligence platform for Jackson Physician Search.

## Tech Stack
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + React Router v6
- **Backend/DB:** Supabase (Auth + PostgreSQL + Edge Functions + Realtime)
- **AI Scraping:** Firecrawl API (Agent mode)
- **AI Matching:** Anthropic Claude API (claude-sonnet-4-6)
- **Deployment:** Vercel

## Environment Variables Needed
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  (Edge Functions only)
FIRECRAWL_API_KEY=
ANTHROPIC_API_KEY=
```

---

## DATABASE SCHEMA

Run this SQL in Supabase SQL Editor first:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users(id) primary key,
  full_name text,
  role text default 'recruiter' check (role in ('recruiter', 'admin')),
  company text default 'Jackson Physician Search',
  created_at timestamp with time zone default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'recruiter');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Recruiter site registry
create table recruiter_sites (
  id uuid default gen_random_uuid() primary key,
  recruiter_id uuid references auth.users(id) not null,
  site_name text not null,
  base_url text not null,
  notes text,
  active boolean default true,
  is_global boolean default false,
  created_at timestamp with time zone default now()
);

-- Physicians
create table physicians (
  id uuid default gen_random_uuid() primary key,
  recruiter_id uuid references auth.users(id) not null,
  created_at timestamp with time zone default now(),
  full_name text not null,
  specialty text not null,
  subspecialty text,
  years_experience integer,
  board_certified boolean default false,
  current_state text,
  preferred_states text[],
  practice_setting text check (practice_setting in ('Academic', 'Private', 'Hospital', 'Any')),
  compensation_min integer,
  notes text,
  raw_cv_text text,
  status text default 'pending' check (status in ('pending', 'processing', 'complete', 'error')),
  error_message text
);

-- Job listings
create table job_listings (
  id uuid default gen_random_uuid() primary key,
  recruiter_id uuid references auth.users(id) not null,
  physician_id uuid references physicians(id) on delete cascade,
  source_site text,
  source_url text,
  job_title text,
  organization text,
  location text,
  state text,
  specialty text,
  description text,
  job_url text,
  raw_content text,
  created_at timestamp with time zone default now()
);

-- Matches
create table matches (
  id uuid default gen_random_uuid() primary key,
  recruiter_id uuid references auth.users(id) not null,
  physician_id uuid references physicians(id) on delete cascade,
  job_listing_id uuid references job_listings(id) on delete cascade,
  match_score integer check (match_score between 0 and 100),
  match_reasoning text,
  strengths text[],
  gaps text[],
  email_summary text,
  rank integer,
  created_at timestamp with time zone default now()
);

-- Row Level Security
alter table profiles enable row level security;
alter table recruiter_sites enable row level security;
alter table physicians enable row level security;
alter table job_listings enable row level security;
alter table matches enable row level security;

-- RLS Policies
create policy "users_own_profile" on profiles for all using (auth.uid() = id);

create policy "recruiters_own_sites" on recruiter_sites
  for all using (auth.uid() = recruiter_id);

create policy "recruiters_see_global_sites" on recruiter_sites
  for select using (is_global = true or auth.uid() = recruiter_id);

create policy "recruiters_own_physicians" on physicians
  for all using (auth.uid() = recruiter_id);

create policy "recruiters_own_job_listings" on job_listings
  for all using (auth.uid() = recruiter_id);

create policy "recruiters_own_matches" on matches
  for all using (auth.uid() = recruiter_id);

-- Seed global sites (admin can add more)
insert into recruiter_sites (recruiter_id, site_name, base_url, active, is_global)
select 
  (select id from auth.users limit 1),
  site_name, base_url, true, true
from (values
  ('PracticeLink', 'https://www.practicelink.com'),
  ('NEJM CareerCenter', 'https://www.nejmcareercenter.org'),
  ('PracticeMatch', 'https://www.practicematch.com'),
  ('Doximity Jobs', 'https://www.doximity.com/jobs'),
  ('Health eCareers', 'https://www.healthecareers.com'),
  ('MDJobSite', 'https://www.mdjobsite.com'),
  ('Merritt Hawkins', 'https://www.merritthawkins.com/find-a-job'),
  ('AMN Healthcare', 'https://www.amnhealthcare.com/allied-travel-jobs'),
  ('CompHealth', 'https://www.comphealth.com/jobs'),
  ('Jackson Physician Search', 'https://www.jacksonphysiciansearch.com/physician-jobs')
) as t(site_name, base_url);
```

---

## EDGE FUNCTION: process-physician

Create this file at `supabase/functions/process-physician/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { physician_id, recruiter_id } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Update status to processing
    await supabase
      .from('physicians')
      .update({ status: 'processing' })
      .eq('id', physician_id)

    // Fetch physician profile
    const { data: physician } = await supabase
      .from('physicians')
      .select('*')
      .eq('id', physician_id)
      .single()

    // Fetch recruiter's active sites (own + global)
    const { data: sites } = await supabase
      .from('recruiter_sites')
      .select('*')
      .eq('active', true)
      .or(`recruiter_id.eq.${recruiter_id},is_global.eq.true`)

    if (!sites || sites.length === 0) {
      throw new Error('No active sites found for this recruiter')
    }

    // FIRECRAWL: Run all sites in parallel
    const firecrawlPromises = sites.map(async (site) => {
      try {
        const agentPrompt = `You are a physician recruiting research agent.

Specialty to search: ${physician.specialty}
${physician.subspecialty ? `Subspecialty: ${physician.subspecialty}` : ''}

Tasks:
1. Go to this URL: ${site.base_url}
2. If it is a job board, search for "${physician.specialty}" physician positions
3. If it is a hospital or health system, find their physician careers page first, then search for "${physician.specialty}"
4. Extract ALL matching job listings found
5. For each listing return these exact fields:
   - job_title (string)
   - organization (string)
   - location (city and state as string)
   - state (2-letter state code)
   - specialty (string)
   - description (first 200 characters of job description)
   - job_url (direct URL to this job listing)

Return ONLY a valid JSON array of job objects. No markdown, no explanation, no wrapper object. Just the raw JSON array starting with [ and ending with ].`

        const response = await fetch('https://api.firecrawl.dev/v1/agent', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('FIRECRAWL_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: agentPrompt,
            timeout: 60000,
          }),
        })

        const result = await response.json()
        const rawText = result?.data?.result || result?.result || '[]'
        
        let jobs = []
        try {
          const cleaned = rawText.replace(/```json|```/g, '').trim()
          jobs = JSON.parse(cleaned)
          if (!Array.isArray(jobs)) jobs = []
        } catch { jobs = [] }

        return jobs.map((job: any) => ({
          recruiter_id,
          physician_id,
          source_site: site.site_name,
          source_url: site.base_url,
          job_title: job.job_title || '',
          organization: job.organization || '',
          location: job.location || '',
          state: job.state || '',
          specialty: job.specialty || physician.specialty,
          description: job.description || '',
          job_url: job.job_url || '',
          raw_content: JSON.stringify(job),
        }))
      } catch (err) {
        console.error(`Firecrawl error for ${site.site_name}:`, err)
        return []
      }
    })

    const allJobArrays = await Promise.all(firecrawlPromises)
    const allJobs = allJobArrays.flat()

    // Insert all job listings
    let insertedJobs: any[] = []
    if (allJobs.length > 0) {
      const { data: jobData } = await supabase
        .from('job_listings')
        .insert(allJobs)
        .select()
      insertedJobs = jobData || []
    }

    if (insertedJobs.length === 0) {
      await supabase
        .from('physicians')
        .update({ status: 'complete', error_message: 'No job listings found across your registered sites.' })
        .eq('id', physician_id)
      return new Response(JSON.stringify({ success: true, matches: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // CLAUDE: Match physician to jobs
    const jobsSummary = insertedJobs.map(j => ({
      id: j.id,
      job_title: j.job_title,
      organization: j.organization,
      location: j.location,
      state: j.state,
      specialty: j.specialty,
      description: j.description,
      job_url: j.job_url,
    }))

    const claudePrompt = `You are a senior physician recruiter with 20 years of experience at a top firm.

PHYSICIAN PROFILE:
Name: ${physician.full_name}
Specialty: ${physician.specialty}
Subspecialty: ${physician.subspecialty || 'None specified'}
Years of Experience: ${physician.years_experience || 'Not specified'}
Board Certified: ${physician.board_certified ? 'Yes' : 'No/Unknown'}
Current State: ${physician.current_state || 'Not specified'}
Preferred States: ${physician.preferred_states?.join(', ') || 'Open to any'}
Practice Setting Preference: ${physician.practice_setting || 'Any'}
Minimum Compensation: ${physician.compensation_min ? '$' + physician.compensation_min.toLocaleString() : 'Not specified'}
Additional Notes: ${physician.notes || 'None'}
CV/Profile Text: ${physician.raw_cv_text ? physician.raw_cv_text.substring(0, 2000) : 'Not provided'}

JOB LISTINGS TO EVALUATE:
${JSON.stringify(jobsSummary, null, 2)}

TASK:
Analyze each job listing and determine how well it matches this physician.
Return a JSON array with one object per job listing.

Each object must have these exact fields:
- job_listing_id: (string, the id field from the listing)
- match_score: (integer 0-100, where 100 is perfect match)
- match_reasoning: (string, 2-3 sentences explaining the score)
- strengths: (array of exactly 3 strings, specific reasons this is a good match)
- gaps: (array of strings, concerns or missing information — can be empty array)
- email_summary: (string, one professional paragraph the recruiter could use to introduce this physician to the hiring organization — do not use placeholder names)
- rank: (integer, 1 = best match overall)

Sort by rank ascending (rank 1 first).
Return ONLY the raw JSON array. No markdown fences, no explanation, no wrapper.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    })

    const claudeData = await claudeResponse.json()
    const claudeText = claudeData.content?.[0]?.text || '[]'

    let matches = []
    try {
      const cleaned = claudeText.replace(/```json|```/g, '').trim()
      matches = JSON.parse(cleaned)
      if (!Array.isArray(matches)) matches = []
    } catch { matches = [] }

    // Insert matches
    if (matches.length > 0) {
      const matchRows = matches.map((m: any) => ({
        recruiter_id,
        physician_id,
        job_listing_id: m.job_listing_id,
        match_score: m.match_score,
        match_reasoning: m.match_reasoning,
        strengths: m.strengths,
        gaps: m.gaps,
        email_summary: m.email_summary,
        rank: m.rank,
      }))
      await supabase.from('matches').insert(matchRows)
    }

    // Mark complete
    await supabase
      .from('physicians')
      .update({ status: 'complete' })
      .eq('id', physician_id)

    return new Response(
      JSON.stringify({ success: true, jobs_found: insertedJobs.length, matches_created: matches.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## REACT APPLICATION

Build the complete React application with the following structure:

```
src/
  lib/
    supabase.ts          (Supabase client)
    types.ts             (TypeScript interfaces)
  components/
    Layout.tsx           (Nav + sidebar)
    StatusBadge.tsx      (pending/processing/complete/error)
    ScoreGauge.tsx       (circular score display)
    MatchCard.tsx        (job match card)
    PhysicianCard.tsx    (profile summary)
    LoadingSkeleton.tsx
    Toast.tsx
  pages/
    Login.tsx
    Dashboard.tsx
    NewPhysician.tsx
    MatchResults.tsx
    MySites.tsx
    AdminPanel.tsx       (admin role only)
  App.tsx
  main.tsx
```

### AESTHETIC SPECIFICATION

**Theme:** Dark luxury executive — Bloomberg Terminal meets a premium medical journal. Authoritative, data-dense, deeply professional.

**Colors (use as CSS variables):**
```css
--bg-primary: #070B14;
--bg-secondary: #0D1321;
--bg-card: #111827;
--bg-card-hover: #1A2338;
--border: #1E2D45;
--border-accent: #C9A84C;
--gold: #C9A84C;
--gold-light: #E8C97A;
--gold-dim: #8A6F2E;
--text-primary: #F0F4FF;
--text-secondary: #8899BB;
--text-muted: #4A5568;
--green: #10B981;
--amber: #F59E0B;
--red: #EF4444;
--blue: #3B82F6;
```

**Typography:**
- Display/Headers: `Cormorant Garamond` (Google Fonts) — sophisticated, medical-journal energy
- Body/UI: `DM Sans` (Google Fonts) — clean and modern
- Data/Numbers: `DM Mono` (Google Fonts) — precise, terminal-feel

**Visual Details:**
- Subtle dot-grid texture on main background (CSS radial-gradient)
- Cards: `background: var(--bg-card)`, `border: 1px solid var(--border)`, `border-radius: 12px`
- Gold accent line on top of active/selected cards
- All buttons: gold gradient (`linear-gradient(135deg, #C9A84C, #E8C97A)`) with dark text
- Input fields: dark background, gold border on focus
- Sidebar: slightly lighter than main bg, gold dot next to active item
- Smooth transitions: `transition: all 0.2s ease`
- Staggered fade-in on list items using animation-delay

**Match Score Gauge:**
SVG circular progress ring. Gold stroke, dark track. Score number in center in DM Mono. Color shifts: 0-49 red, 50-74 amber, 75-100 gold/green.

---

### PAGE SPECIFICATIONS

**Login Page (`/login`)**
- Full-screen dark background with subtle animated gradient
- Centered card with logo "PhysMatch" in Cormorant Garamond
- Tagline: "Physician Intelligence Platform"
- Email + password fields
- Gold "Sign In" button
- Supabase Auth email/password login
- Redirect to dashboard on success

**Dashboard (`/`)**
- Top bar: "PhysMatch" logo left, recruiter name + avatar right
- Left sidebar: nav links (Dashboard, New Physician, My Sites, Admin if role=admin)
- Stats row (4 cards): Total Physicians | Pending | Completed Today | Active Sites
- Recent submissions table: Name, Specialty, Status badge, Created, Action button → view results
- Status badges: pending=amber pill, processing=blue animated pulse, complete=green, error=red

**New Physician (`/new`)**
- Two-column form layout
- Left column: Name, Specialty (comprehensive dropdown — include all major specialties), Subspecialty, Years Experience, Board Certified toggle, Current State, Preferred States (multi-chip select), Practice Setting, Compensation Min
- Right column: Notes textarea, Raw CV / Profile Text (large textarea with placeholder "Paste full CV text, email profile, or referral notes here...")
- Bottom: "Find Matches" gold button, full width
- On submit:
  1. INSERT to physicians table (with recruiter_id = auth.uid())
  2. Call Edge Function `process-physician` with physician_id + recruiter_id
  3. Navigate to `/physician/{id}` immediately (don't wait for results)

**Match Results (`/physician/:id`)**
- Back button → Dashboard
- Physician profile card across top (all fields, collapsed layout)
- Status bar below profile:
  - pending: amber "Queued..."
  - processing: blue animated "Firecrawl searching [site count] sites..." with spinner
  - complete: green "Results Ready — [X] matches found"
  - error: red banner with error_message
- Poll every 5 seconds while status is pending or processing
- Once complete, render two-panel layout:
  - LEFT (40%): Scrollable ranked match cards
    - Each card: Rank badge (#1, #2...), Job Title, Organization, Location, Score gauge
    - Strengths: green chips, Gaps: amber chips
    - Gold top border on rank #1
    - Click to select → highlights and shows detail in right panel
  - RIGHT (60%): Selected match detail
    - Job title + org prominent
    - Full match reasoning
    - Strengths list (green checkmarks)
    - Gaps list (amber warnings)
    - Email Summary section with copy-to-clipboard button
    - "View Original Posting" external link button

**My Sites (`/sites`)**
- Table of recruiter's own sites: Name, URL, Status toggle, Notes, Delete
- Global sites shown below with lock icon (cannot delete, can deactivate for yourself)
- "Add Site" form at top: Name, URL, Notes → INSERT to recruiter_sites
- Toggle active/inactive inline

**Admin Panel (`/admin`)** — only visible if profile.role = 'admin'
- Platform stats (all recruiters)
- Recruiters table: Name, Email, Site Count, Physician Count, Last Active
- Global site management (same UI as My Sites but manages is_global=true sites)
- Invite user form (Supabase admin invite)

---

### SPECIALTY DROPDOWN LIST

Use this comprehensive list for the specialty dropdown:
Allergy & Immunology, Anesthesiology, Cardiology, Cardiothoracic Surgery, Colorectal Surgery, Critical Care Medicine, Dermatology, Emergency Medicine, Endocrinology, Family Medicine, Gastroenterology, General Surgery, Geriatric Medicine, Hematology/Oncology, Hospital Medicine, Infectious Disease, Internal Medicine, Interventional Radiology, Maternal-Fetal Medicine, Nephrology, Neurology, Neurological Surgery, Obstetrics & Gynecology, Ophthalmology, Oral & Maxillofacial Surgery, Orthopedic Surgery, Otolaryngology (ENT), Pain Management, Palliative Care, Pathology, Pediatrics, Pediatric Surgery, Physical Medicine & Rehabilitation, Plastic Surgery, Psychiatry, Pulmonology, Radiation Oncology, Radiology, Rheumatology, Sleep Medicine, Sports Medicine, Transplant Surgery, Urology, Vascular Surgery

---

### ADDITIONAL REQUIREMENTS

- TypeScript strict mode throughout
- All Supabase calls use typed responses (define interfaces in types.ts)
- Loading skeletons on all data-fetching states
- Toast notifications: success (green), error (red), info (blue) — bottom right corner
- React Router v6 with protected routes (redirect to /login if not authenticated)
- Supabase Realtime subscription on physician status changes (instead of polling — use `.on('UPDATE')`)
- Fully responsive: mobile collapses sidebar to bottom nav, two-panel becomes stacked
- .env.local file for all secrets (never hardcoded)
- README.md with setup steps

---

### PACKAGE.JSON DEPENDENCIES

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "@supabase/supabase-js": "^2.39.0",
    "lucide-react": "^0.263.1",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.1.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

Build the complete application. All pages functional. All Supabase queries real. No mock data. No placeholder components. The UI must look like a premium enterprise SaaS product.
