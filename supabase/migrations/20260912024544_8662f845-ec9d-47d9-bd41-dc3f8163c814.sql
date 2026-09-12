CREATE TABLE public.job_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_key TEXT NOT NULL,
  company TEXT,
  name TEXT,
  title TEXT,
  email TEXT,
  profile_url TEXT,
  contact_page_url TEXT,
  contact_type TEXT NOT NULL DEFAULT 'possible_connection'
    CHECK (contact_type IN ('job_poster','published_recruiting','recruiting_inbox','possible_connection')),
  source_url TEXT,
  source_context TEXT,
  checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  removed_at TIMESTAMP WITH TIME ZONE,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','source_checked')),
  mailbox_verified BOOLEAN NOT NULL DEFAULT false,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  discovery_method TEXT,
  contact_identity TEXT GENERATED ALWAYS AS (lower(coalesce(email, profile_url, contact_page_url, name, ''))) STORED,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX job_contacts_identity_key ON public.job_contacts (user_id, job_key, contact_identity);
CREATE INDEX job_contacts_user_job_idx ON public.job_contacts (user_id, job_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_contacts TO authenticated;
GRANT ALL ON public.job_contacts TO service_role;

ALTER TABLE public.job_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own job contacts"
  ON public.job_contacts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_job_contacts_updated_at
  BEFORE UPDATE ON public.job_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_enrichment_enabled BOOLEAN NOT NULL DEFAULT false;