CREATE TABLE public.job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  company_name text NOT NULL,
  board_token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_fetched_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, board_token)
);
GRANT SELECT ON public.job_sources TO authenticated;
GRANT SELECT ON public.job_sources TO anon;
GRANT ALL ON public.job_sources TO service_role;
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Job sources are publicly readable" ON public.job_sources FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.job_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  external_id text NOT NULL,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  workplace_type text,
  employment_type text,
  department text,
  url text NOT NULL,
  description text,
  salary text,
  posted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  source_id uuid REFERENCES public.job_sources(id) ON DELETE SET NULL,
  UNIQUE (provider, external_id)
);
CREATE INDEX job_pool_posted_at_idx ON public.job_pool (posted_at DESC);
CREATE INDEX job_pool_first_seen_idx ON public.job_pool (first_seen_at DESC);
CREATE INDEX job_pool_company_idx ON public.job_pool (company);
GRANT SELECT ON public.job_pool TO authenticated;
GRANT SELECT ON public.job_pool TO anon;
GRANT ALL ON public.job_pool TO service_role;
ALTER TABLE public.job_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Job pool is publicly readable" ON public.job_pool FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.ingest_state (
  job_name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  lease_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ingest_state TO authenticated;
GRANT ALL ON public.ingest_state TO service_role;
ALTER TABLE public.ingest_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ingest state is readable by signed in users" ON public.ingest_state FOR SELECT TO authenticated USING (true);

INSERT INTO public.ingest_state (job_name) VALUES ('ingest-jobs');

INSERT INTO public.job_sources (provider, company_name, board_token) VALUES
  ('greenhouse','Stripe','stripe'),
  ('greenhouse','Figma','figma'),
  ('greenhouse','Notion','notion'),
  ('greenhouse','Coinbase','coinbase'),
  ('greenhouse','Databricks','databricks'),
  ('greenhouse','Plaid','plaid'),
  ('greenhouse','Rippling','rippling'),
  ('greenhouse','Vercel','vercel'),
  ('greenhouse','Mercury','mercury'),
  ('greenhouse','Deel','deel'),
  ('greenhouse','Canva','canva'),
  ('greenhouse','Datadog','datadog'),
  ('greenhouse','MongoDB','mongodb'),
  ('greenhouse','Airtable','airtable'),
  ('greenhouse','Anthropic','anthropic'),
  ('greenhouse','Discord','discord'),
  ('greenhouse','Robinhood','robinhood'),
  ('greenhouse','Grammarly','grammarly'),
  ('greenhouse','Wise','wise'),
  ('greenhouse','Personio','personio'),
  ('lever','Netflix','netflix'),
  ('lever','Spotify','spotify'),
  ('lever','Ramp','ramp'),
  ('lever','Voi','voi'),
  ('lever','Kraken','kraken'),
  ('lever','Attentive','attentive'),
  ('lever','Palantir','palantir'),
  ('lever','Brex','brex'),
  ('ashby','Linear','linear'),
  ('ashby','Ashby','ashby'),
  ('ashby','Hex','hex'),
  ('ashby','Modal','modal'),
  ('ashby','Runway','runway'),
  ('smartrecruiters','Visa','Visa'),
  ('smartrecruiters','Bosch','BoschGroup'),
  ('smartrecruiters','Ubisoft','Ubisoft2'),
  ('smartrecruiters','McDonalds','McDonaldsCorporation'),
  ('workable','Blueground','blueground'),
  ('workable','Kaizen Gaming','kaizengaming'),
  ('recruitee','Bynder','bynder');