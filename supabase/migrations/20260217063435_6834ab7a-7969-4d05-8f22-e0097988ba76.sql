
-- Add HiringCafe-style structured fields to the jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'Full Time',
  ADD COLUMN IF NOT EXISTS workplace_type text DEFAULT 'Onsite',
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experience_min_years integer,
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS salary_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS salary_frequency text DEFAULT 'Yearly',
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_logo_url text,
  ADD COLUMN IF NOT EXISTS requirements_summary text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS employer_type text,
  ADD COLUMN IF NOT EXISTS ai_extracted boolean DEFAULT false;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_jobs_category ON public.jobs(category);
CREATE INDEX IF NOT EXISTS idx_jobs_employment_type ON public.jobs(employment_type);
CREATE INDEX IF NOT EXISTS idx_jobs_workplace_type ON public.jobs(workplace_type);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON public.jobs USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_jobs_experience ON public.jobs(experience_min_years);
CREATE INDEX IF NOT EXISTS idx_jobs_ai_extracted ON public.jobs(ai_extracted);
