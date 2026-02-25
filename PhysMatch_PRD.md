# PhysMatch — Product Requirements Document
**Version:** 1.0  
**Status:** Approved for Build  
**Owner:** Cedric | Obsidian Axis Group  
**Client:** Jackson Physician Search  
**Stack:** React + Vite · Supabase · Firecrawl · Claude API · Vercel  

---

## 1. Executive Summary

PhysMatch is a multi-tenant physician recruiting intelligence platform. It enables individual recruiters to maintain their own curated job site registries, submit physician profiles via a structured intake form, and receive AI-ranked opportunity matches — all without leaving a single interface.

The core loop:
1. Recruiter inputs a physician profile (manually or via CV paste)
2. System fires Firecrawl Agent against that recruiter's registered URLs
3. Firecrawl discovers and extracts matching job listings
4. Claude API matches physician profile against listings
5. Recruiter receives a ranked match list, reasoning, and email-ready summaries

No N8N. No third-party orchestration. All pipeline logic runs as Supabase Edge Functions — included in the Supabase subscription.

---

## 2. Problem Statement

Physician recruiters at Jackson Physician Search currently:
- Manually search multiple job boards per candidate
- Copy/paste job descriptions into spreadsheets for comparison
- Write outreach emails from scratch for each opportunity
- Have no centralized system for tracking candidate-to-opportunity fit

**Result:** Hours of manual research per candidate, inconsistent quality, missed opportunities, and no institutional memory of what sites work best for which specialties.

**PhysMatch eliminates all four problems.**

---

## 3. Users & Roles

| Role | Description | Permissions |
|---|---|---|
| **Recruiter** | Individual team member at Jackson Physician Search | Own physician records, own URL registry, own matches |
| **Admin** | Platform administrator (initially Cedric) | All data, user management, system site registry, billing |
| **Viewer** *(future)* | Read-only stakeholder access | View matches only, no edit |

### Multi-Tenancy Model

- Each recruiter has a Supabase Auth account
- All data tables include `recruiter_id` foreign key
- Row Level Security (RLS) enforced at database level — recruiters cannot see each other's data
- Admin bypasses RLS via service role
- URL registries are per-recruiter — each recruiter owns their site list
- A **global site registry** (admin-managed) provides default URLs that all recruiters inherit but can override

---

## 4. Core Features

### 4.1 Authentication
- Supabase Auth (email + password)
- Invite-only user creation (admin sends invite link)
- Session persistence across browser tabs
- Password reset via email

### 4.2 Recruiter URL Registry
- Each recruiter maintains their own list of job sites
- Fields: Site Name, Base URL, Notes, Active toggle
- Max 25 URLs per recruiter (scalable)
- Global registry (admin) provides shared defaults
- Recruiter can inherit global sites, override, or add their own
- Firecrawl only fires on the submitting recruiter's active URLs

### 4.3 Physician Intake
- Structured form fields (see Section 6 for full field list)
- Large CV text area (paste raw CV or profile text)
- Auto-extracts specialty from CV text if form field left blank (Claude)
- Saves to `physicians` table with `status: 'pending'`
- Triggers Edge Function automatically on insert

### 4.4 Firecrawl Agent Pipeline
- On physician insert, Edge Function loops through recruiter's active URLs
- For each URL, sends Firecrawl Agent prompt with specialty + site
- Agent autonomously:
  - Navigates to site
  - Discovers careers/jobs page if needed
  - Searches for physician specialty
  - Extracts all matching listings
- Results stored per-listing in `job_listings` table
- Runs all sites in parallel (Promise.all) for speed

### 4.5 Claude AI Matching
- After all Firecrawl jobs complete, Edge Function calls Claude API
- Passes full physician profile + all scraped listings
- Claude returns ranked matches with:
  - Match score (0–100)
  - Match reasoning (2–3 sentences)
  - Strengths (3 bullet points)
  - Gaps / concerns
  - Email-ready outreach summary
- Results stored in `matches` table
- Physician status updated to `'complete'`

### 4.6 Match Results UI
- Polling: UI checks status every 5 seconds while `pending`
- Results view:
  - **Left panel:** Ranked match cards with score gauge, strength chips, gap chips
  - **Right panel:** Full reasoning + email summary with one-click copy
  - **Top:** Physician profile summary card
- Export: Download all matches as PDF or CSV (v1.1)

### 4.7 Dashboard
- Per-recruiter stats: Total physicians, pending, completed today
- Recent activity feed (last 10 submissions)
- Quick-action: "New Physician" button
- Admin dashboard: platform-wide stats, all recruiters, system health

---

## 5. Multi-Tenancy Architecture

### Data Isolation Strategy: Row Level Security (RLS)

Every table has `recruiter_id uuid references auth.users(id)`.

RLS policies ensure:
```sql
-- Recruiters see only their own rows
CREATE POLICY "recruiter_isolation" ON physicians
  FOR ALL USING (auth.uid() = recruiter_id);
```

### URL Registry Hierarchy

```
Global Registry (admin)
      ↓ (inherited by all recruiters)
Recruiter Registry (per recruiter)
      ↓ (union of both, recruiter overrides win)
Active URLs for this run (filtered: active = true)
```

### Edge Function Tenant Awareness

Every Edge Function call includes the authenticated user's JWT. Edge Functions extract `recruiter_id` from the JWT and scope all queries accordingly. No cross-tenant data access is possible.

---

## 6. Data Schema

### Table: `profiles` (extends Supabase auth.users)
```
id              uuid (FK → auth.users)
full_name       text
role            text ('recruiter' | 'admin')
company         text
created_at      timestamp
```

### Table: `physicians`
```
id                uuid PK
recruiter_id      uuid FK → auth.users
created_at        timestamp
full_name         text NOT NULL
specialty         text NOT NULL
subspecialty      text
years_experience  integer
board_certified   boolean
current_state     text (2-letter)
preferred_states  text[]
practice_setting  text ('Academic' | 'Private' | 'Hospital' | 'Any')
compensation_min  integer
notes             text
raw_cv_text       text
status            text ('pending' | 'processing' | 'complete' | 'error')
error_message     text
```

### Table: `recruiter_sites`
```
id              uuid PK
recruiter_id    uuid FK → auth.users
site_name       text NOT NULL
base_url        text NOT NULL
notes           text
active          boolean default true
is_global       boolean default false (admin-set)
created_at      timestamp
```

### Table: `job_listings`
```
id              uuid PK
recruiter_id    uuid FK → auth.users
physician_id    uuid FK → physicians
source_site     text
source_url      text
job_title       text
organization    text
location        text
state           text
specialty       text
description     text
job_url         text
raw_content     text
created_at      timestamp
```

### Table: `matches`
```
id              uuid PK
recruiter_id    uuid FK → auth.users
physician_id    uuid FK → physicians
job_listing_id  uuid FK → job_listings
match_score     integer (0–100)
match_reasoning text
strengths       text[]
gaps            text[]
email_summary   text
rank            integer
created_at      timestamp
```

---

## 7. Edge Functions

### Function 1: `process-physician`
**Trigger:** Supabase Database Webhook on INSERT to `physicians`  
**Responsibilities:**
1. Fetch recruiter's active URLs from `recruiter_sites`
2. Call Firecrawl Agent for each URL (parallel)
3. Parse and insert results to `job_listings`
4. Call Claude API with physician + all listings
5. Parse and insert matches to `matches`
6. Update physician status to `complete` or `error`

**Timeout:** 180 seconds (Supabase Edge Function max)  
**Error handling:** On failure, set `status = 'error'`, write `error_message`

### Function 2: `extract-cv` *(optional enhancement)*
**Trigger:** Manual call from UI  
**Responsibilities:**
1. Accept raw CV text
2. Call Claude API to extract structured fields
3. Return pre-filled form data to UI

---

## 8. UI Views

### View 1: Dashboard `/`
- Recruiter-scoped stats (total, pending, complete, active sites)
- Recent physician submissions table with status badges
- "New Physician" CTA button

### View 2: Physician Intake `/new`
- Full structured form (all fields from schema)
- CV paste area
- "Find Matches" submit → inserts record → redirects to results with loading state

### View 3: Match Results `/physician/:id`
- Physician profile card (top)
- Processing state: animated pulse + "Firecrawl searching [site name]..." live status
- Results: split panel (ranked cards left, detail right)
- Email summary with copy button

### View 4: My Sites `/sites`
- Recruiter's URL registry table
- Add / toggle / delete
- Global sites shown with lock icon (view only unless admin)

### View 5: Admin Panel `/admin` *(admin role only)*
- All recruiters list
- Platform-wide stats
- Global site registry management
- User invite form

---

## 9. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Firecrawl per-site timeout | 60 seconds |
| Total pipeline completion | < 3 minutes for 10 sites |
| UI polling interval | 5 seconds |
| Supabase RLS | Enforced on all tables |
| Vercel deployment | Production + Preview environments |
| Mobile responsive | Yes (stacked layout) |
| Browser support | Chrome, Safari, Edge (last 2 versions) |

---

## 10. Out of Scope — v1.0

- Outlook / email inbox integration (v1.1)
- Automated scheduling / recurring searches
- PDF export of match results
- Candidate pipeline / CRM tracking
- Third-party ATS integration
- Mobile app

---

## 11. Cost Model

| Service | Plan | Monthly Cost |
|---|---|---|
| Supabase | Pro | $25 |
| Firecrawl | Standard (100K pages) | $83 |
| Claude API | Pay per use (~50 runs/mo) | ~$5–15 |
| Vercel | Hobby (free) | $0 |
| **Total** | | **~$113–123/mo** |

Cost per physician match run: ~$0.10–0.50 depending on site count and CV length.

---

## 12. Success Metrics

- Time from physician input to ranked results: < 3 minutes
- Recruiter adoption: 100% of Jackson Physician Search team within 30 days
- Match quality: Recruiter rates top result as relevant in >80% of runs
- System uptime: >99% (Supabase + Vercel SLA)

---

*PhysMatch v1.0 | Obsidian Axis Group | Built on DefaultFail principles — no waste, no subscriptions that don't earn their seat*
