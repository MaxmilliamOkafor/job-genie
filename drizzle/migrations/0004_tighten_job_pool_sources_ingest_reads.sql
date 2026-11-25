DROP POLICY IF EXISTS "Job pool is publicly readable" ON public.job_pool;
CREATE POLICY "Signed in users can read job pool" ON public.job_pool FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE SELECT ON public.job_pool FROM anon;

DROP POLICY IF EXISTS "Ingest state is readable by signed in users" ON public.ingest_state;
CREATE POLICY "Signed in users can read ingest state" ON public.ingest_state FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Job sources are publicly readable" ON public.job_sources;
REVOKE SELECT ON public.job_sources FROM anon, authenticated;