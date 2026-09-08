-- Rows whose "posting date" was really the import moment are marked unknown.
UPDATE public.job_pool
SET posted_at_known = false
WHERE abs(extract(epoch FROM (posted_at - first_seen_at))) < 2;

INSERT INTO public.ingest_state (job_name, status)
VALUES ('verify-job-links', 'idle')
ON CONFLICT (job_name) DO NOTHING;