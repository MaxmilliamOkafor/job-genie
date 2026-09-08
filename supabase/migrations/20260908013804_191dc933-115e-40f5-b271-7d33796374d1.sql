-- 1. Trust and lifecycle columns on the shared job pool
ALTER TABLE public.job_pool
  ADD COLUMN IF NOT EXISTS link_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS link_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS link_http_status integer,
  ADD COLUMN IF NOT EXISTS resolved_url text,
  ADD COLUMN IF NOT EXISTS link_note text,
  ADD COLUMN IF NOT EXISTS posted_at_known boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requisition_id text,
  ADD COLUMN IF NOT EXISTS seniority text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.job_pool(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employer_direct boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_seen_in_feed_at timestamptz;

ALTER TABLE public.job_pool
  DROP CONSTRAINT IF EXISTS job_pool_link_status_check;
ALTER TABLE public.job_pool
  ADD CONSTRAINT job_pool_link_status_check
  CHECK (link_status IN ('active','closed','removed','redirected','unverified'));

-- 2. Normalisation helpers (immutable so they can back generated columns / indexes)
CREATE OR REPLACE FUNCTION public.jp_norm_text(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(regexp_replace(lower(coalesce(v,'')), '[^a-z0-9]+', ' ', 'g'), ' ');
$$;

CREATE OR REPLACE FUNCTION public.jp_norm_title(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(lower(coalesce(v,'')),
      '\y(senior|snr|sr|junior|jnr|jr|lead|principal|staff|mid|midlevel|i|ii|iii|iv|remote|hybrid|onsite|full time|part time|contract|intern|internship|graduate|m f d|f m d|w m d)\y',
      ' ', 'g'),
    '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.jp_norm_location(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(split_part(coalesce(v,''), ',', 1)), '[^a-z0-9]+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.jp_seniority(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(v,'')) ~ '\y(intern|internship|placement|working student)\y' THEN 'internship'
    WHEN lower(coalesce(v,'')) ~ '\y(graduate|entry level|junior|jnr|jr)\y' THEN 'entry'
    WHEN lower(coalesce(v,'')) ~ '\y(vp|vice president|head of|director|chief|cto|cfo|ceo)\y' THEN 'executive'
    WHEN lower(coalesce(v,'')) ~ '\y(principal|staff|distinguished|architect)\y' THEN 'principal'
    WHEN lower(coalesce(v,'')) ~ '\y(lead|manager|mgr)\y' THEN 'lead'
    WHEN lower(coalesce(v,'')) ~ '\y(senior|snr|sr)\y' THEN 'senior'
    ELSE 'mid'
  END;
$$;

-- 3. Requisition id extracted from the provider external id / url
CREATE OR REPLACE FUNCTION public.jp_requisition_id(p_external_id text, p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(coalesce(
    nullif(regexp_replace(coalesce(p_external_id,''), '^.*:', ''), ''),
    (regexp_match(coalesce(p_url,''), '([0-9]{4,})'))[1]
  )), '');
$$;

-- 4. Trigger: derive requisition id, seniority, dedupe key, feed timestamps
CREATE OR REPLACE FUNCTION public.job_pool_derive()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.requisition_id := public.jp_requisition_id(NEW.external_id, NEW.url);
  NEW.seniority := public.jp_seniority(NEW.title);
  NEW.dedupe_key := coalesce(public.jp_norm_text(NEW.company), 'unknown')
    || '|' || coalesce(public.jp_norm_title(NEW.title), 'untitled')
    || '|' || coalesce(public.jp_norm_location(NEW.location), 'unspecified');
  IF NEW.last_seen_in_feed_at IS NULL THEN
    NEW.last_seen_in_feed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS job_pool_derive_trg ON public.job_pool;
CREATE TRIGGER job_pool_derive_trg
  BEFORE INSERT OR UPDATE OF title, company, location, external_id, url
  ON public.job_pool FOR EACH ROW EXECUTE FUNCTION public.job_pool_derive();

-- 5. Backfill derived values on existing rows
UPDATE public.job_pool SET
  requisition_id = public.jp_requisition_id(external_id, url),
  seniority = public.jp_seniority(title),
  dedupe_key = coalesce(public.jp_norm_text(company),'unknown') || '|'
    || coalesce(public.jp_norm_title(title),'untitled') || '|'
    || coalesce(public.jp_norm_location(location),'unspecified'),
  last_seen_in_feed_at = coalesce(last_seen_in_feed_at, updated_at, first_seen_at);

-- 6. Canonical selection: one preferred row per dedupe key, direct employer link wins
CREATE OR REPLACE FUNCTION public.job_pool_mark_canonical()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  WITH ranked AS (
    SELECT id, dedupe_key,
      first_value(id) OVER (
        PARTITION BY dedupe_key
        ORDER BY
          (link_status = 'active') DESC,
          employer_direct DESC,
          (requisition_id IS NOT NULL) DESC,
          posted_at_known DESC,
          posted_at ASC,
          first_seen_at ASC,
          id ASC
      ) AS keeper
    FROM public.job_pool
    WHERE link_status <> 'removed'
  )
  UPDATE public.job_pool jp
  SET is_canonical = (r.keeper = jp.id),
      duplicate_of = CASE WHEN r.keeper = jp.id THEN NULL ELSE r.keeper END
  FROM ranked r
  WHERE r.id = jp.id
    AND (jp.is_canonical <> (r.keeper = jp.id)
      OR coalesce(jp.duplicate_of::text,'') <> coalesce(CASE WHEN r.keeper = jp.id THEN NULL ELSE r.keeper END::text,''));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

SELECT public.job_pool_mark_canonical();

-- 7. Full-text search vector
ALTER TABLE public.job_pool
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(company,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(department,'')), 'C') ||
    setweight(to_tsvector('simple', coalesce(location,'')), 'C') ||
    setweight(to_tsvector('simple', left(coalesce(description,''), 8000)), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS job_pool_search_tsv_idx ON public.job_pool USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS job_pool_dedupe_key_idx ON public.job_pool (dedupe_key);
CREATE INDEX IF NOT EXISTS job_pool_active_posted_idx ON public.job_pool (posted_at DESC) WHERE is_canonical AND link_status <> 'removed' AND link_status <> 'closed';
CREATE INDEX IF NOT EXISTS job_pool_link_check_idx ON public.job_pool (link_checked_at NULLS FIRST) WHERE is_canonical;
CREATE INDEX IF NOT EXISTS job_pool_first_seen_idx ON public.job_pool (first_seen_at DESC);

-- 8. Per-source refresh health, readable by signed-in users
CREATE OR REPLACE VIEW public.job_source_health
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.provider,
  s.company_name,
  s.enabled,
  s.last_fetched_at,
  s.last_success_at,
  s.last_error,
  s.consecutive_failures,
  count(p.id) FILTER (WHERE p.link_status <> 'removed') AS live_jobs
FROM public.job_sources s
LEFT JOIN public.job_pool p ON p.source_id = s.id
GROUP BY s.id;

GRANT SELECT ON public.job_source_health TO authenticated, anon;
GRANT SELECT ON public.job_sources TO authenticated;
GRANT SELECT ON public.ingest_state TO authenticated;