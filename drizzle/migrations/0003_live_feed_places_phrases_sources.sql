-- Live feed: stored place per vacancy, phrase keyword search, places by country
-- and remote region, "new since your last visit" counts, and career boards
-- added as sources from the Job search tab and from CV-tailored applications.

ALTER TABLE public.job_pool ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.job_pool ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.job_pool ADD COLUMN IF NOT EXISTS remote_region text;
COMMENT ON COLUMN public.job_pool.country_code IS 'Two-letter country of the first place the posting names, set by the job import';
COMMENT ON COLUMN public.job_pool.city IS 'City of the first place the posting names, tidied (Co. Dublin -> Dublin)';
COMMENT ON COLUMN public.job_pool.remote_region IS 'For remote postings: the region the remote work covers (Ireland, EU, EMEA, Europe, Worldwide)';
CREATE INDEX IF NOT EXISTS job_pool_country_code_idx ON public.job_pool (country_code);
CREATE INDEX IF NOT EXISTS job_pool_remote_region_idx ON public.job_pool (remote_region) WHERE remote_region IS NOT NULL;

-- "data engineer" as a phrase; the last word may be a prefix (engineers).
CREATE OR REPLACE FUNCTION public.jp_phrase_query(p_term text)
RETURNS tsquery
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(array_length(w, 1), 0) = 0 THEN NULL
    ELSE to_tsquery('simple',
      array_to_string(ARRAY(SELECT quote_literal(x) FROM unnest(w) x), ' <-> ') || ':*')
  END
  FROM (SELECT array_remove(regexp_split_to_array(lower(coalesce(p_term, '')), '[^a-z0-9]+'), '') AS w) s;
$$;

DROP FUNCTION IF EXISTS public.search_job_pool(text[], text[], text[], text, text[], text[], text[], integer, boolean, boolean, text, integer, integer);

CREATE FUNCTION public.search_job_pool(
  p_terms text[] DEFAULT '{}'::text[],
  p_skills text[] DEFAULT '{}'::text[],
  p_location_terms text[] DEFAULT '{}'::text[],
  p_company text DEFAULT ''::text,
  p_workplace text[] DEFAULT '{}'::text[],
  p_seniority text[] DEFAULT '{}'::text[],
  p_employment text[] DEFAULT '{}'::text[],
  p_max_age_hours integer DEFAULT NULL::integer,
  p_require_known_date boolean DEFAULT true,
  p_include_unverified boolean DEFAULT true,
  p_sort text DEFAULT 'newest'::text,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_country_code text DEFAULT NULL::text,
  p_remote_regions text[] DEFAULT '{}'::text[],
  p_seen_after timestamptz DEFAULT NULL::timestamptz
)
RETURNS TABLE(id uuid, provider text, title text, company text, location text, workplace_type text, employment_type text, department text, seniority text, url text, resolved_url text, description text, salary text, requisition_id text, posted_at timestamp with time zone, posted_at_known boolean, first_seen_at timestamp with time zone, link_status text, link_checked_at timestamp with time zone, link_http_status integer, link_note text, employer_direct boolean, risk_flags text[], duplicate_count integer, relevance real, total_count bigint, country_code text, city text, remote_region text, title_match boolean, new_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tsq tsquery := NULL;
  v_skill_tsq tsquery := NULL;
  v_t tsquery;
  v_term text;
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_cutoff timestamptz := CASE WHEN p_max_age_hours IS NULL THEN NULL
                               ELSE now() - make_interval(hours => p_max_age_hours) END;
BEGIN
  -- The role and its wordings are phrases, not loose words.
  FOREACH v_term IN ARRAY coalesce(p_terms, '{}'::text[]) LOOP
    v_t := public.jp_phrase_query(v_term);
    IF v_t IS NOT NULL THEN
      v_tsq := CASE WHEN v_tsq IS NULL THEN v_t ELSE v_tsq || v_t END;
    END IF;
  END LOOP;

  FOREACH v_term IN ARRAY coalesce(p_skills, '{}'::text[]) LOOP
    v_t := plainto_tsquery('simple', v_term);
    IF v_t IS NOT NULL AND v_t::text <> '' THEN
      v_skill_tsq := CASE WHEN v_skill_tsq IS NULL THEN v_t ELSE v_skill_tsq && v_t END;
    END IF;
  END LOOP;

  RETURN QUERY
  WITH dupes AS (
    SELECT d0.dedupe_key AS dedupe_key, count(*)::integer AS n
    FROM public.job_pool d0
    WHERE d0.link_status <> 'removed'
    GROUP BY d0.dedupe_key
  ),
  filtered AS (
    SELECT jp.*, coalesce(d.n, 1) - 1 AS dupe_extra,
      CASE WHEN v_tsq IS NULL THEN 0::real ELSE ts_rank_cd(jp.search_tsv, v_tsq) END AS rank_raw,
      (v_tsq IS NOT NULL AND to_tsvector('simple', coalesce(jp.title, '')) @@ v_tsq) AS title_hit
    FROM public.job_pool jp
    LEFT JOIN dupes d ON d.dedupe_key = jp.dedupe_key
    WHERE jp.is_canonical
      AND jp.link_status IN ('active', 'unverified')
      AND (p_include_unverified OR jp.link_status = 'active')
      AND (v_tsq IS NULL OR jp.search_tsv @@ v_tsq)
      AND (v_skill_tsq IS NULL OR jp.search_tsv @@ v_skill_tsq)
      AND (coalesce(p_company, '') = '' OR jp.company ILIKE '%' || p_company || '%')
      AND (
        coalesce(array_length(p_location_terms, 1), 0) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(p_location_terms) lt
          WHERE jp.location ILIKE '%' || lt || '%'
        )
        OR (p_country_code IS NOT NULL AND jp.country_code = p_country_code)
      )
      AND (
        coalesce(array_length(p_remote_regions, 1), 0) = 0
        OR jp.remote_region IS NULL
        OR jp.remote_region = ANY (p_remote_regions)
      )
      AND (coalesce(array_length(p_workplace, 1), 0) = 0 OR jp.workplace_type = ANY (p_workplace))
      AND (coalesce(array_length(p_seniority, 1), 0) = 0 OR jp.seniority = ANY (p_seniority))
      AND (
        coalesce(array_length(p_employment, 1), 0) = 0
        OR EXISTS (
          SELECT 1 FROM unnest(p_employment) et
          WHERE jp.employment_type ILIKE '%' || et || '%'
        )
      )
      AND (
        v_cutoff IS NULL
        OR (jp.posted_at_known AND jp.posted_at >= v_cutoff)
      )
      AND (NOT p_require_known_date OR v_cutoff IS NULL OR jp.posted_at_known)
  ),
  counted AS (
    SELECT f.*,
      count(*) OVER () AS total,
      count(*) FILTER (WHERE p_seen_after IS NOT NULL AND f.first_seen_at > p_seen_after) OVER () AS fresh
    FROM filtered f
  )
  SELECT
    c.id, c.provider, c.title, c.company, c.location, c.workplace_type,
    c.employment_type, c.department, c.seniority, c.url, c.resolved_url,
    left(coalesce(c.description, ''), 1200), c.salary, c.requisition_id,
    c.posted_at, c.posted_at_known, c.first_seen_at,
    c.link_status, c.link_checked_at, c.link_http_status, c.link_note,
    c.employer_direct, c.risk_flags, c.dupe_extra,
    (
      c.rank_raw * 10.0
      + CASE WHEN c.title_hit THEN 5 ELSE 0 END
      + CASE WHEN c.link_status = 'active' THEN 0.4 ELSE 0 END
      + CASE WHEN c.posted_at_known
             THEN greatest(0, 1.0 - (extract(epoch FROM now() - c.posted_at) / 2592000.0))::real
             ELSE 0 END
    )::real AS relevance,
    c.total,
    c.country_code, c.city, c.remote_region, c.title_hit, c.fresh
  FROM counted c
  ORDER BY
    -- Vacancies whose title names the role come first.
    c.title_hit DESC,
    CASE WHEN p_sort = 'relevance' THEN NULL ELSE 1 END,
    CASE WHEN p_sort = 'relevance' THEN (
      c.rank_raw * 10.0
      + CASE WHEN c.link_status = 'active' THEN 0.4 ELSE 0 END
      + CASE WHEN c.posted_at_known
             THEN greatest(0, 1.0 - (extract(epoch FROM now() - c.posted_at) / 2592000.0))::real
             ELSE 0 END
    ) END DESC NULLS LAST,
    c.posted_at_known DESC,
    c.posted_at DESC,
    c.first_seen_at DESC,
    c.id
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_job_pool(text[], text[], text[], text, text[], text[], text[], integer, boolean, boolean, text, integer, integer, text, text[], timestamptz) TO anon, authenticated, service_role;

-- The career board a job link belongs to, for the six boards the import reads.
CREATE OR REPLACE FUNCTION public.jp_board_source(p_url text)
RETURNS TABLE(provider text, token text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  u text := lower(coalesce(p_url, ''));
  m text[];
BEGIN
  IF u ~ 'greenhouse\.io' THEN
    m := regexp_match(u, '[?&]for=([a-z0-9_-]+)');
    IF m IS NULL THEN
      m := regexp_match(u, 'greenhouse\.io/(?!embed/|v1/)([a-z0-9_-]+)');
    END IF;
    IF m IS NOT NULL THEN provider := 'greenhouse'; token := m[1]; RETURN NEXT; END IF;
  ELSIF u ~ 'jobs\.(eu\.)?lever\.co/' THEN
    m := regexp_match(u, 'lever\.co/([a-z0-9_.-]+)');
    IF m IS NOT NULL THEN provider := 'lever'; token := m[1]; RETURN NEXT; END IF;
  ELSIF u ~ 'jobs\.ashbyhq\.com/' THEN
    m := regexp_match(u, 'ashbyhq\.com/([a-z0-9_.%-]+)');
    IF m IS NOT NULL THEN provider := 'ashby'; token := replace(m[1], '%20', ' '); RETURN NEXT; END IF;
  ELSIF u ~ '(jobs|careers)\.smartrecruiters\.com/' THEN
    -- SmartRecruiters company ids keep their capitals (BoschGroup).
    m := regexp_match(coalesce(p_url, ''), 'smartrecruiters\.com/([A-Za-z0-9_-]+)', 'i');
    IF m IS NOT NULL AND lower(m[1]) NOT IN ('oneclick-ui', 'job', 'jobs') THEN
      provider := 'smartrecruiters'; token := m[1]; RETURN NEXT;
    END IF;
  ELSIF u ~ 'apply\.workable\.com/' THEN
    m := regexp_match(u, 'apply\.workable\.com/(?!api/|j/)([a-z0-9_-]+)');
    IF m IS NOT NULL THEN provider := 'workable'; token := m[1]; RETURN NEXT; END IF;
  ELSIF u ~ '^https?://[a-z0-9-]+\.recruitee\.com' THEN
    m := regexp_match(u, '^https?://([a-z0-9-]+)\.recruitee\.com');
    IF m IS NOT NULL AND m[1] NOT IN ('www', 'app', 'api') THEN provider := 'recruitee'; token := m[1]; RETURN NEXT; END IF;
  END IF;
  RETURN;
END;
$$;

-- Add one career board to the shared sources, once (same board, any capitals).
-- Boards already known keep their state, including the failure breaker.
CREATE OR REPLACE FUNCTION public.jp_add_job_source(p_provider text, p_token text, p_company text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(p_provider, '') NOT IN ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee')
     OR coalesce(btrim(p_token), '') = '' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.job_sources s WHERE s.provider = p_provider AND lower(s.board_token) = lower(btrim(p_token))) THEN
    RETURN;
  END IF;
  INSERT INTO public.job_sources (provider, company_name, board_token, enabled)
  VALUES (p_provider, coalesce(nullif(btrim(p_company), ''), btrim(p_token)), btrim(p_token), true)
  ON CONFLICT (provider, board_token) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.jp_add_job_source(text, text, text) FROM PUBLIC, anon, authenticated;

-- Companies added on the Job search tab become sources of the Live feed.
CREATE OR REPLACE FUNCTION public.job_companies_to_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    PERFORM public.jp_add_job_source(NEW.board, NEW.token, initcap(replace(NEW.token, '-', ' ')));
  EXCEPTION WHEN others THEN
    NULL; -- adding a source must never stop a company being saved
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS job_companies_to_sources_trg ON public.job_companies;
CREATE TRIGGER job_companies_to_sources_trg
AFTER INSERT ON public.job_companies
FOR EACH ROW EXECUTE FUNCTION public.job_companies_to_sources();

-- An employer a CV was tailored for becomes a source when its job link names the board.
CREATE OR REPLACE FUNCTION public.applications_to_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_company text;
  r record;
BEGIN
  IF NEW.tailored_resume IS NULL OR (TG_OP = 'UPDATE' AND OLD.tailored_resume IS NOT NULL) THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT j.url, j.company INTO v_url, v_company FROM public.jobs j WHERE j.id = NEW.job_id;
    FOR r IN SELECT * FROM public.jp_board_source(v_url) LOOP
      PERFORM public.jp_add_job_source(r.provider, r.token, v_company);
    END LOOP;
  EXCEPTION WHEN others THEN
    NULL; -- adding a source must never stop an application being saved
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS applications_to_sources_trg ON public.applications;
CREATE TRIGGER applications_to_sources_trg
AFTER INSERT OR UPDATE OF tailored_resume ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.applications_to_sources();