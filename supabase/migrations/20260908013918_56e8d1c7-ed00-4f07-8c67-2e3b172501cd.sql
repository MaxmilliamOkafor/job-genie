CREATE OR REPLACE FUNCTION public.search_job_pool(
  p_terms text[] DEFAULT '{}',
  p_skills text[] DEFAULT '{}',
  p_location_terms text[] DEFAULT '{}',
  p_company text DEFAULT '',
  p_workplace text[] DEFAULT '{}',
  p_seniority text[] DEFAULT '{}',
  p_employment text[] DEFAULT '{}',
  p_max_age_hours integer DEFAULT NULL,
  p_require_known_date boolean DEFAULT true,
  p_include_unverified boolean DEFAULT true,
  p_sort text DEFAULT 'newest',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  provider text,
  title text,
  company text,
  location text,
  workplace_type text,
  employment_type text,
  department text,
  seniority text,
  url text,
  resolved_url text,
  description text,
  salary text,
  requisition_id text,
  posted_at timestamptz,
  posted_at_known boolean,
  first_seen_at timestamptz,
  link_status text,
  link_checked_at timestamptz,
  link_http_status integer,
  link_note text,
  employer_direct boolean,
  risk_flags text[],
  duplicate_count integer,
  relevance real,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
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
  -- Free-text terms and their synonyms are ORed: any of them may match.
  FOREACH v_term IN ARRAY coalesce(p_terms, '{}'::text[]) LOOP
    v_t := plainto_tsquery('simple', v_term);
    IF v_t IS NOT NULL AND v_t::text <> '' THEN
      v_tsq := CASE WHEN v_tsq IS NULL THEN v_t ELSE v_tsq || v_t END;
    END IF;
  END LOOP;

  -- Every requested skill must appear: skills are ANDed.
  FOREACH v_term IN ARRAY coalesce(p_skills, '{}'::text[]) LOOP
    v_t := plainto_tsquery('simple', v_term);
    IF v_t IS NOT NULL AND v_t::text <> '' THEN
      v_skill_tsq := CASE WHEN v_skill_tsq IS NULL THEN v_t ELSE v_skill_tsq && v_t END;
    END IF;
  END LOOP;

  RETURN QUERY
  WITH dupes AS (
    SELECT dedupe_key, count(*)::integer AS n
    FROM public.job_pool
    WHERE link_status <> 'removed'
    GROUP BY dedupe_key
  ),
  filtered AS (
    SELECT jp.*, coalesce(d.n, 1) - 1 AS dupe_extra,
      CASE
        WHEN v_tsq IS NULL THEN 0::real
        ELSE ts_rank_cd(jp.search_tsv, v_tsq)
      END AS rank_raw
    FROM public.job_pool jp
    LEFT JOIN dupes d ON d.dedupe_key = jp.dedupe_key
    WHERE jp.is_canonical
      -- Closed, removed and redirected listings never appear in active results.
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
      -- Strict freshness windows exclude listings whose real posting date is unknown.
      AND (
        v_cutoff IS NULL
        OR (jp.posted_at_known AND jp.posted_at >= v_cutoff)
      )
      AND (NOT p_require_known_date OR v_cutoff IS NULL OR jp.posted_at_known)
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS total FROM filtered f
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
      + CASE WHEN c.link_status = 'active' THEN 0.4 ELSE 0 END
      + CASE WHEN c.posted_at_known
             THEN greatest(0, 1.0 - (extract(epoch FROM now() - c.posted_at) / 2592000.0))::real
             ELSE 0 END
    )::real AS relevance,
    c.total
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'relevance' THEN NULL ELSE 1 END,
    CASE WHEN p_sort = 'relevance' THEN (
      c.rank_raw * 10.0
      + CASE WHEN c.link_status = 'active' THEN 0.4 ELSE 0 END
      + CASE WHEN c.posted_at_known
             THEN greatest(0, 1.0 - (extract(epoch FROM now() - c.posted_at) / 2592000.0))::real
             ELSE 0 END
    ) END DESC NULLS LAST,
    -- Newest ordering trusts the employer's posting date, never the import time.
    c.posted_at_known DESC,
    c.posted_at DESC,
    c.first_seen_at DESC,
    c.id
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_job_pool(text[], text[], text[], text, text[], text[], text[], integer, boolean, boolean, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_job_pool(text[], text[], text[], text, text[], text[], text[], integer, boolean, boolean, text, integer, integer) TO authenticated, service_role;