ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS how_heard text DEFAULT 'LinkedIn',
  ADD COLUMN IF NOT EXISTS over_18 boolean,
  ADD COLUMN IF NOT EXISTS needs_accommodation boolean,
  ADD COLUMN IF NOT EXISTS worked_here_before boolean,
  ADD COLUMN IF NOT EXISTS was_referred boolean,
  ADD COLUMN IF NOT EXISTS criminal_record boolean,
  ADD COLUMN IF NOT EXISTS phone_type text,
  ADD COLUMN IF NOT EXISTS middle_name text;

ALTER TABLE public.profiles ALTER COLUMN veteran_status DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN disability DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN hispanic_latino DROP DEFAULT;