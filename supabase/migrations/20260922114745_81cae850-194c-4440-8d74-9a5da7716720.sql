CREATE TABLE public.job_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  board text NOT NULL CHECK (board IN ('greenhouse','lever','ashby')),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, board, token)
);

CREATE TABLE public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  board text,
  company text,
  title text,
  location text,
  department text,
  remote boolean DEFAULT false,
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  body text,
  exported_at timestamptz,
  UNIQUE (user_id, url)
);

CREATE INDEX job_postings_user_posted ON public.job_postings (user_id, posted_at DESC);
CREATE INDEX job_postings_user_exported ON public.job_postings (user_id, exported_at);
CREATE INDEX job_companies_user ON public.job_companies (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_companies TO authenticated;
GRANT ALL ON public.job_companies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;

ALTER TABLE public.job_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own companies" ON public.job_companies
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own postings" ON public.job_postings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prune_old_job_postings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.job_postings
  WHERE exported_at IS NULL
    AND COALESCE(posted_at, first_seen_at) < now() - interval '60 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_job_postings() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'prune-old-job-postings',
  '20 3 * * *',
  $$SELECT public.prune_old_job_postings();$$
);