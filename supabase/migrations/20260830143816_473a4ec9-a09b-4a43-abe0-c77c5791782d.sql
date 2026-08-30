CREATE TABLE IF NOT EXISTS public.ai_error_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  error_code TEXT NOT NULL,
  provider TEXT,
  provider_status INTEGER,
  user_message TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.ai_error_log TO authenticated;
GRANT ALL ON public.ai_error_log TO service_role;

ALTER TABLE public.ai_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own AI errors"
  ON public.ai_error_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own AI errors"
  ON public.ai_error_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can clear their own AI errors"
  ON public.ai_error_log FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ai_error_log_user_created_idx
  ON public.ai_error_log (user_id, created_at DESC);