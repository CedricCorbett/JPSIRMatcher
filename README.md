# PhysMatch

**Physician Intelligence Platform** — Multi-tenant physician recruiting intelligence for Jackson Physician Search.

Built with React 19 + Vite + TypeScript + Tailwind CSS v4 + Supabase + Firecrawl + Claude API.

---

## Prerequisites

- Node.js 18+
- Supabase project (with Auth, Database, Edge Functions, Realtime enabled)
- Firecrawl API key
- Anthropic API key
- Supabase CLI (for edge function deployment)

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/CedricCorbett/JPSIRMatcher.git
cd JPSIRMatcher
npm install
```

### 2. Environment Variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_FIRECRAWL_API_KEY=your-firecrawl-key
VITE_ANTHROPIC_API_KEY=your-anthropic-key
```

### 3. Supabase Database Setup

Run the following SQL in the Supabase SQL Editor:

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
```

### 4. Enable Realtime

In the Supabase Dashboard, go to **Database > Replication** and enable realtime for the `physicians` table.

### 5. Deploy Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref your-project-ref

# Set secrets
supabase secrets set FIRECRAWL_API_KEY=your-key
supabase secrets set ANTHROPIC_API_KEY=your-key

# Deploy
supabase functions deploy process-physician
```

### 6. Create First User

In the Supabase Dashboard, go to **Authentication > Users** and create a user. Then update their profile role to `admin`:

```sql
update profiles set role = 'admin' where id = 'user-uuid-here';
```

---

## Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

---

## Architecture

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4
- **Auth & DB:** Supabase (PostgreSQL + Auth + RLS + Realtime)
- **Scraping:** Firecrawl Agent API (parallel site crawling)
- **AI Matching:** Anthropic Claude API (physician-to-job ranking)
- **Routing:** React Router v7

### Data Flow

1. Recruiter logs in via Supabase Auth
2. Recruiter submits a physician profile
3. Edge function is invoked with physician ID
4. Firecrawl agents search all active sites in parallel
5. Job listings are inserted into the database
6. Claude API ranks and scores each listing against the physician
7. Matches are inserted; physician status set to `complete`
8. Frontend receives updates via Supabase Realtime

---

*PhysMatch v1.0 | Obsidian Axis Group | Built for Jackson Physician Search*
