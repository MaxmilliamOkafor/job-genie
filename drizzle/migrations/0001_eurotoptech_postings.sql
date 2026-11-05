-- Euro Top Tech: the freshest postings from the member's own board, kept
-- for that member only, for their own job search. Refreshed at most daily
-- from the member API (up to 2,500 postings from the past 3 or 7 days) and
-- deleted after 7 days, so it never becomes a copy of the board.
CREATE TABLE public.ett_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id bigint NOT NULL,
  title text,
  company text,
  location text,
  country text,
  workplace text,
  seniority text,
  posted_date timestamptz,
  pay text,
  relocation text,
  visa text,
  job_page text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX ett_postings_user_posted ON public.ett_postings (user_id, posted_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ett_postings TO authenticated;
GRANT ALL ON public.ett_postings TO service_role;

ALTER TABLE public.ett_postings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ett postings" ON public.ett_postings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prune_old_ett_postings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE removed integer;
BEGIN
  DELETE FROM public.ett_postings
  WHERE COALESCE(posted_date, first_seen_at) < now() - interval '7 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_ett_postings() FROM public, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'prune-old-ett-postings',
  '35 3 * * *',
  $$SELECT public.prune_old_ett_postings();$$
);
