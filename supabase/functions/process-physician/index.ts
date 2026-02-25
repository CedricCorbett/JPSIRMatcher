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
    const firecrawlPromises = sites.map(async (site: any) => {
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

        let jobs: any[] = []
        try {
          const cleaned = rawText.replace(/```json|```/g, '').trim()
          jobs = JSON.parse(cleaned)
          if (!Array.isArray(jobs)) jobs = []
        } catch {
          jobs = []
        }

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // CLAUDE: Match physician to jobs
    const jobsSummary = insertedJobs.map((j: any) => ({
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
You MUST return EXACTLY one object for EVERY job listing provided — do NOT skip, omit, or filter out any listing regardless of match quality. Even a 0% match must be included with a score and ranking. The total number of objects in your response MUST equal the total number of job listings above (${jobsSummary.length} listings).

Each object must have these exact fields:
- job_listing_id: (string, the id field from the listing — must match exactly)
- match_score: (integer 0-100, where 100 is perfect match)
- match_reasoning: (string, 2-3 sentences explaining the score)
- strengths: (array of exactly 3 strings, specific reasons this is a good match)
- gaps: (array of strings, concerns or missing information — can be empty array)
- email_summary: (string, one professional paragraph the recruiter could use to introduce this physician to the hiring organization — do not use placeholder names)
- rank: (integer, 1 = best match overall, every listing gets a unique rank from 1 to ${jobsSummary.length})

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
        max_tokens: 16000,
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    })

    const claudeData = await claudeResponse.json()
    const claudeText = claudeData.content?.[0]?.text || '[]'

    let matches: any[] = []
    try {
      const cleaned = claudeText.replace(/```json|```/g, '').trim()
      matches = JSON.parse(cleaned)
      if (!Array.isArray(matches)) matches = []
    } catch {
      matches = []
    }

    // Ensure every job listing has a match — backfill any Claude missed
    const matchedJobIds = new Set(matches.map((m: any) => m.job_listing_id))
    const missingJobs = insertedJobs.filter((j: any) => !matchedJobIds.has(j.id))

    if (missingJobs.length > 0) {
      console.warn(`Claude missed ${missingJobs.length} of ${insertedJobs.length} listings — backfilling`)
      const maxRank = matches.length > 0 ? Math.max(...matches.map((m: any) => m.rank || 0)) : 0
      missingJobs.forEach((j: any, idx: number) => {
        matches.push({
          job_listing_id: j.id,
          match_score: 0,
          match_reasoning: 'This listing was found but could not be evaluated by the AI matching system. Review manually.',
          strengths: ['Specialty-relevant listing found', 'Position is currently active', 'Within registered site network'],
          gaps: ['Requires manual review'],
          email_summary: `A ${j.specialty || 'physician'} position at ${j.organization || 'this organization'} in ${j.location || 'an unspecified location'} was identified and may warrant further review.`,
          rank: maxRank + idx + 1,
        })
      })
    }

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
  } catch (error: any) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
