import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function callClaude(apiKey: string, model: string, maxTokens: number, prompt: string, log: (msg: string) => void): Promise<any> {
  const models = [model, 'claude-haiku-4-5-20251001']
  let lastStatus = 0

  for (const currentModel of models) {
    const maxRetries = 3
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: currentModel,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (response.status === 200) {
        log(`Claude success with ${currentModel} on attempt ${attempt}`)
        return await response.json()
      }

      lastStatus = response.status
      const isRetryable = response.status === 429 || response.status === 529 || response.status >= 500
      log(`Claude ${currentModel} attempt ${attempt}/${maxRetries} failed: status ${response.status}`)

      if (!isRetryable || attempt === maxRetries) {
        const errorData = await response.json().catch(() => ({}))
        if (currentModel !== models[models.length - 1]) {
          log(`Falling back to next model...`)
          break
        }
        log(`Claude final error: ${JSON.stringify(errorData)}`)
        return { _apiError: true, status: lastStatus, message: `Claude API error ${lastStatus} after all retries exhausted` }
      }

      // Use longer backoff for 500 errors (server issues need more recovery time)
      const delay = response.status >= 500 && response.status !== 529
        ? Math.pow(2, attempt) * 2000
        : Math.pow(2, attempt) * 1000
      log(`Retrying in ${delay}ms...`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  return { _apiError: true, status: lastStatus, message: 'Claude API unavailable after all retries exhausted' }
}

async function firecrawlScrape(url: string, fcKey: string, waitFor = 0): Promise<string> {
  const body: any = { url, formats: ['markdown', 'links'] }
  if (waitFor > 0) body.waitFor = waitFor

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fcKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (result?.success) {
    return result.data?.markdown || ''
  }
  return ''
}

function hasRelevantListings(md: string, specialty: string): boolean {
  const mdLower = md.toLowerCase()
  const specLower = specialty.toLowerCase()
  const specShort = specialty.split(/[&\/]/)[0].trim().toLowerCase()

  const hasJobIndicators = mdLower.includes('physician') || mdLower.includes('doctor') ||
    mdLower.includes('position') || mdLower.includes('apply now')
  const hasSpecialty = mdLower.includes(specLower) || mdLower.includes(specShort)

  return md.length > 300 && hasJobIndicators && hasSpecialty
}

async function scrapeSite(site: any, specialty: string, fcKey: string, anthropicKey: string, log: (msg: string) => void): Promise<string> {
  const baseUrl = site.base_url.replace(/\/$/, '')
  const specShort = specialty.split(/[&\/]/)[0].trim()

  // Build search URL candidates
  const searchTerms = [
    encodeURIComponent(specialty),
    encodeURIComponent(specialty.replace(/&/g, 'and')),
    encodeURIComponent(specShort),
  ]

  const searchUrls = [
    `${baseUrl}/search-results?keywords=${searchTerms[0]}`,
    `${baseUrl}/search-results?keywords=${searchTerms[1]}`,
    `${baseUrl}/search-results?keywords=${searchTerms[2]}`,
    `${baseUrl}/search?q=${searchTerms[0]}`,
    `${baseUrl}/search?q=${searchTerms[2]}`,
    `${baseUrl}/jobs/search?ss=1&searchKeyword=${searchTerms[2]}&searchRelation=keyword_all`,
    `${baseUrl}/jobs?search=${searchTerms[0]}`,
  ]

  // Phase 1: Try direct search URL patterns (standard scrape)
  for (const url of searchUrls) {
    try {
      log(`  Trying: ${url}`)
      const md = await firecrawlScrape(url, fcKey)

      if (hasRelevantListings(md, specialty)) {
        log(`  Found listings: ${md.length} chars`)
        return md.substring(0, 15000)
      }

      if (md.length > 0) {
        log(`  Got ${md.length} chars but no relevant listings`)
      }
    } catch (err: any) {
      log(`  Error: ${err.message}`)
    }
  }

  // Phase 2: Retry base URL with waitFor (handles JS-rendered SPAs)
  log(`  Phase 2: Trying base URL with headless browser wait (waitFor: 5000ms)...`)
  try {
    const md = await firecrawlScrape(baseUrl, fcKey, 5000)
    if (hasRelevantListings(md, specialty)) {
      log(`  Found listings via waitFor: ${md.length} chars`)
      return md.substring(0, 15000)
    }
    if (md.length > 0) {
      log(`  waitFor got ${md.length} chars but no relevant listings`)
    }
  } catch (err: any) {
    log(`  waitFor error: ${err.message}`)
  }

  // Phase 3: Scrape base URL and ask Claude to find the real job search URL
  log(`  Phase 3: Discovering job search URL from landing page...`)
  try {
    const landingMd = await firecrawlScrape(baseUrl, fcKey)

    if (landingMd.length > 100) {
      const discoveryPrompt = `Analyze this career website's landing page content and find the URL where actual job listings/search results live.

WEBSITE: ${site.site_name} (${baseUrl})
I need to search for "${specialty}" physician positions.

PAGE CONTENT:
${landingMd.substring(0, 8000)}

Look for:
- Links to job search pages, ATS systems (ICIMS, Workday, Taleo, Greenhouse, etc.)
- Search/filter URLs with parameters
- "View Careers", "Search Jobs", "Open Positions" type links
- External job board URLs embedded in the page
- iframe sources pointing to job platforms

Return ONLY the best URL to scrape for "${specShort}" physician job listings.
If you can construct a search URL with the specialty as a keyword, do that.
Return just the URL string, nothing else. If you can't find one, return "NONE".`

      const discoveryData = await callClaude(anthropicKey, 'claude-haiku-4-5-20251001', 500, discoveryPrompt, log)
      const discoveredUrl = discoveryData?.content?.[0]?.text?.trim() || ''

      if (discoveredUrl && discoveredUrl !== 'NONE' && discoveredUrl.startsWith('http')) {
        log(`  Discovered job search URL: ${discoveredUrl}`)
        // Try discovered URL first without waitFor, then with waitFor
        let md = await firecrawlScrape(discoveredUrl, fcKey)
        if (md.length < 200) {
          log(`  Thin result, retrying discovered URL with waitFor...`)
          md = await firecrawlScrape(discoveredUrl, fcKey, 5000)
        }

        if (md.length > 200) {
          log(`  Got ${md.length} chars from discovered URL`)
          return md.substring(0, 15000)
        }
      } else {
        log(`  No job search URL discovered`)
      }
    }
  } catch (err: any) {
    log(`  Discovery error: ${err.message}`)
  }

  log(`  No relevant content found for ${site.site_name}`)
  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const debugLog: string[] = []
  function log(msg: string) {
    console.log(msg)
    debugLog.push(msg)
  }

  try {
    const { physician_id, recruiter_id } = await req.json()
    log(`Starting process for physician ${physician_id}`)

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
    const { data: physician, error: physError } = await supabase
      .from('physicians')
      .select('*')
      .eq('id', physician_id)
      .single()

    if (physError || !physician) {
      throw new Error(`Physician not found: ${physError?.message}`)
    }
    log(`Specialty: ${physician.specialty}`)

    // Fetch recruiter's active sites (own + global)
    const { data: sites } = await supabase
      .from('recruiter_sites')
      .select('*')
      .eq('active', true)
      .or(`recruiter_id.eq.${recruiter_id},is_global.eq.true`)

    log(`Found ${sites?.length || 0} active sites`)

    if (!sites || sites.length === 0) {
      throw new Error('No active sites found for this recruiter')
    }

    const fcKey = Deno.env.get('FIRECRAWL_API_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    // Region-based filtering: map physician preferred_states to regions, filter sites
    const REGION_GROUPS: Record<string, string[]> = {
      'Northeast': ['CT','DE','MA','MD','ME','NH','NJ','NY','PA','RI','VT'],
      'Southeast': ['AL','AR','FL','GA','KY','LA','MS','NC','SC','TN','VA','WV'],
      'Midwest': ['IA','IL','IN','KS','MI','MN','MO','ND','NE','OH','SD','WI'],
      'Southwest': ['AZ','NM','OK','TX'],
      'Mountain West': ['CO','ID','MT','NV','UT','WY'],
      'Pacific': ['AK','CA','HI','OR','WA'],
    }

    function getRegionsForStates(states: string[]): string[] {
      const regions = new Set<string>()
      for (const [region, regionStates] of Object.entries(REGION_GROUPS)) {
        if (states.some((s) => regionStates.includes(s))) {
          regions.add(region)
        }
      }
      return [...regions]
    }

    // Filter sites by region overlap (null operating_regions = national/all)
    const physicianRegions = physician.preferred_states?.length
      ? getRegionsForStates(physician.preferred_states)
      : []

    const filteredSites = physicianRegions.length > 0
      ? sites.filter((site: any) => {
          if (!site.operating_regions || site.operating_regions.length === 0) return true // national
          return site.operating_regions.some((r: string) => physicianRegions.includes(r))
        })
      : sites // no preferred states = search all sites

    log(`Filtered to ${filteredSites.length} sites after region matching (physician regions: ${physicianRegions.join(', ') || 'all'})`)

    // STEP 1: Scrape sites SEQUENTIALLY to avoid rate limits
    let claudeFailures = 0
    const allJobs: any[] = []

    for (const site of filteredSites) {
      log(`--- Scraping ${site.site_name} (${site.base_url}) ---`)

      const content = await scrapeSite(site, physician.specialty, fcKey, anthropicKey, log)

      if (content.length < 100) {
        log(`Skipping ${site.site_name} — no usable content`)
        continue
      }

      // STEP 2: Extract ONLY specialty-relevant listings from this site
      const extractPrompt = `You are a physician job listing extractor. Your job is to extract ONLY listings that are relevant to the target specialty.

TARGET SPECIALTY: ${physician.specialty}
${physician.subspecialty ? `TARGET SUBSPECIALTY: ${physician.subspecialty}` : ''}
SITE: ${site.site_name}

SCRAPED CONTENT FROM ${site.base_url}:
${content}

RULES:
1. Extract ONLY job listings for physicians/doctors in "${physician.specialty}" or closely related subspecialties
2. DO NOT include listings for other specialties (e.g. if searching for OBGYN, do not include Cardiology, Family Medicine, etc.)
3. DO NOT include non-physician roles (nurses, PAs, technicians, dietitians, medical assistants, etc.)
4. For each listing extract:
   - job_title (string)
   - organization (string) — the employer name
   - location (string) — city and state
   - state (string) — 2-letter state code
   - specialty (string) — the actual medical specialty of this listing
   - description (string) — first 200 characters of any description
   - job_url (string) — direct URL if visible, otherwise ""

Return ONLY a valid JSON array. No markdown, no explanation. Return [] if no relevant listings found.`

      log(`Extracting ${physician.specialty} listings from ${site.site_name}...`)
      const extractData = await callClaude(anthropicKey, 'claude-sonnet-4-6', 8000, extractPrompt, log)

      if (extractData?._apiError) {
        claudeFailures++
        log(`Claude API failed for extraction on ${site.site_name} (failures: ${claudeFailures}): ${extractData.message}`)
        continue
      }

      if (extractData?.error) {
        log(`Extraction error for ${site.site_name}: ${JSON.stringify(extractData.error)}`)
        continue
      }

      const extractText = extractData?.content?.[0]?.text || '[]'
      let jobs: any[] = []
      try {
        const cleaned = extractText.replace(/```json|```/g, '').trim()
        jobs = JSON.parse(cleaned)
        if (!Array.isArray(jobs)) jobs = []
      } catch {
        log(`Failed to parse extraction for ${site.site_name}`)
        jobs = []
      }

      log(`Extracted ${jobs.length} relevant listings from ${site.site_name}`)

      for (const job of jobs) {
        allJobs.push({
          recruiter_id,
          physician_id,
          source_site: site.site_name,
          source_url: site.base_url,
          job_title: job.job_title || '',
          organization: job.organization || site.site_name,
          location: job.location || '',
          state: job.state || '',
          specialty: job.specialty || physician.specialty,
          description: job.description || '',
          job_url: job.job_url || '',
          raw_content: JSON.stringify(job),
        })
      }
    }

    log(`Total specialty-relevant jobs across all sites: ${allJobs.length}`)

    // Insert all job listings
    let insertedJobs: any[] = []
    if (allJobs.length > 0) {
      const { data: jobData, error: insertError } = await supabase
        .from('job_listings')
        .insert(allJobs)
        .select()
      if (insertError) log(`Job insert error: ${insertError.message}`)
      insertedJobs = jobData || []
    }

    log(`Jobs inserted: ${insertedJobs.length}`)

    if (insertedJobs.length === 0) {
      await supabase
        .from('physicians')
        .update({ status: 'complete', error_message: `No ${physician.specialty} listings found across your registered sites.` })
        .eq('id', physician_id)
      return new Response(JSON.stringify({ success: true, matches: 0, debug: debugLog }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // STEP 3: Match physician profile to jobs — use data points, NOT name
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

    const matchPrompt = `You are a senior physician recruiter evaluating job matches for a candidate.

CANDIDATE PROFILE (do NOT reference the candidate's name in your output — refer to them as "the candidate" or "this physician"):
Specialty: ${physician.specialty}
Subspecialty: ${physician.subspecialty || 'None specified'}
Years of Experience: ${physician.years_experience || 'Not specified'}
Board Certified: ${physician.board_certified ? 'Yes' : 'No/Unknown'}
Current State: ${physician.current_state || 'Not specified'}
Preferred States: ${physician.preferred_states?.join(', ') || 'Open to any'}
Practice Setting Preference: ${physician.practice_setting || 'Any'}
Minimum Compensation: ${physician.compensation_min ? '$' + physician.compensation_min.toLocaleString() : 'Not specified'}
Additional Notes: ${physician.notes || 'None'}
CV/Profile Summary: ${physician.raw_cv_text ? physician.raw_cv_text.substring(0, 2000) : 'Not provided'}

JOB LISTINGS TO EVALUATE:
${JSON.stringify(jobsSummary, null, 2)}

TASK:
Score each listing based on how well it matches THIS candidate's specialty, location preferences, experience level, and other profile data.
You MUST return one object for EVERY listing. Do NOT skip any.
Do NOT use the candidate's name anywhere in your output — use "the candidate" or "this physician" instead.

Each object must have:
- job_listing_id: (string, must match the id field exactly)
- match_score: (integer 0-100)
- match_reasoning: (string, 2-3 sentences explaining the score based on specialty fit, location, experience)
- strengths: (array of exactly 3 strings — specific match strengths tied to the candidate's profile data)
- gaps: (array of strings — concerns or missing info, can be empty)
- email_summary: (string, a professional paragraph a recruiter could send to the hiring org introducing this candidate — do NOT use the candidate's name, use "our candidate" instead)
- rank: (integer, 1 = best match, unique rank per listing)

Sort by rank ascending. Return ONLY the raw JSON array.`

    log(`Matching ${jobsSummary.length} jobs against candidate profile...`)
    const matchData = await callClaude(anthropicKey, 'claude-sonnet-4-6', 16000, matchPrompt, log)

    let matchingFailed = false

    if (matchData?._apiError) {
      claudeFailures++
      matchingFailed = true
      log(`Claude API failed for matching (failures: ${claudeFailures}): ${matchData.message}`)
    } else if (matchData?.error) {
      log(`Matching error: ${JSON.stringify(matchData.error)}`)
    }

    let matches: any[] = []

    if (matchingFailed) {
      // AI fallback: create placeholder matches with score -1
      log(`AI fallback: creating ${insertedJobs.length} unscored matches`)
      matches = insertedJobs.map((j: any, idx: number) => ({
        job_listing_id: j.id,
        match_score: -1,
        match_reasoning: 'AI scoring was temporarily unavailable. This listing was found for the correct specialty and may be a good fit — please review manually.',
        strengths: ['Specialty-relevant listing found', 'Position is currently active', 'Within registered site network'],
        gaps: ['AI scoring unavailable — manual review recommended'],
        email_summary: `A ${j.specialty || 'physician'} position at ${j.organization || 'this organization'} in ${j.location || 'an unspecified location'} was identified and may warrant further review.`,
        rank: idx + 1,
      }))
    } else {
      const matchText = matchData?.content?.[0]?.text || '[]'
      log(`Match response length: ${matchText.length}`)

      try {
        const cleaned = matchText.replace(/```json|```/g, '').trim()
        matches = JSON.parse(cleaned)
        if (!Array.isArray(matches)) matches = []
      } catch {
        log(`Failed to parse match response`)
        matches = []
      }

      // Backfill any missed listings
      const matchedJobIds = new Set(matches.map((m: any) => m.job_listing_id))
      const missingJobs = insertedJobs.filter((j: any) => !matchedJobIds.has(j.id))

      if (missingJobs.length > 0) {
        log(`Backfilling ${missingJobs.length} missed listings`)
        const maxRank = matches.length > 0 ? Math.max(...matches.map((m: any) => m.rank || 0)) : 0
        missingJobs.forEach((j: any, idx: number) => {
          matches.push({
            job_listing_id: j.id,
            match_score: 0,
            match_reasoning: 'This listing could not be evaluated automatically. Please review manually.',
            strengths: ['Specialty-relevant listing found', 'Position is currently active', 'Within registered site network'],
            gaps: ['Requires manual review'],
            email_summary: `A ${j.specialty || 'physician'} position at ${j.organization || 'this organization'} in ${j.location || 'an unspecified location'} was identified and may warrant further review.`,
            rank: maxRank + idx + 1,
          })
        })
      }
    }

    log(`Total matches: ${matches.length}`)

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
      const { error: matchInsertError } = await supabase.from('matches').insert(matchRows)
      if (matchInsertError) log(`Match insert error: ${matchInsertError.message}`)
    }

    // Mark complete (note if AI scoring was degraded)
    const statusUpdate: any = { status: 'complete' }
    if (claudeFailures > 0) {
      statusUpdate.error_message = `Completed with ${claudeFailures} AI failure(s). Some matches may need manual review.`
    }
    await supabase
      .from('physicians')
      .update(statusUpdate)
      .eq('id', physician_id)

    log(`Done! ${insertedJobs.length} jobs, ${matches.length} matches, ${claudeFailures} Claude failures`)

    return new Response(
      JSON.stringify({ success: true, jobs_found: insertedJobs.length, matches_created: matches.length, debug: debugLog }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    log(`FATAL ERROR: ${error.message}`)

    try {
      const body = await req.clone().json().catch(() => null)
      if (body?.physician_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await supabase
          .from('physicians')
          .update({ status: 'error', error_message: error.message || 'An unexpected error occurred' })
          .eq('id', body.physician_id)
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message, debug: debugLog }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
