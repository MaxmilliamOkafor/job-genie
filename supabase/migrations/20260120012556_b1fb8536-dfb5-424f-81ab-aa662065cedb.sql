-- SECURITY FIX: Move API keys to separate restricted table
-- This prevents API keys from being exposed in client-side profile queries

-- 1. Create secure user_api_keys table
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  openai_api_key text,
  kimi_api_key text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 2. Enable RLS on the new table
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- 3. Create RESTRICTIVE policies - NO SELECT for regular users
-- Users can only INSERT (on first setup) and UPDATE their own keys
-- SELECT is NOT allowed from client - only edge functions with service_role can read

-- Allow users to insert their own API keys record
CREATE POLICY "Users can create their own API keys record"
  ON public.user_api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own API keys
CREATE POLICY "Users can update their own API keys"
  ON public.user_api_keys
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow users to delete their own API keys
CREATE POLICY "Users can delete their own API keys"
  ON public.user_api_keys
  FOR DELETE
  USING (auth.uid() = user_id);

-- NO SELECT POLICY - Only edge functions with service_role can read API keys

-- 4. Migrate existing API keys from profiles to user_api_keys
INSERT INTO public.user_api_keys (user_id, openai_api_key, kimi_api_key, created_at, updated_at)
SELECT 
  user_id,
  openai_api_key,
  kimi_api_key,
  COALESCE(created_at, now()),
  now()
FROM public.profiles
WHERE openai_api_key IS NOT NULL OR kimi_api_key IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  openai_api_key = EXCLUDED.openai_api_key,
  kimi_api_key = EXCLUDED.kimi_api_key,
  updated_at = now();

-- 5. Update handle_new_user to also create empty API keys record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.automation_settings (user_id)
  VALUES (NEW.id);
  
  -- Create empty API keys record for new users
  INSERT INTO public.user_api_keys (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- 6. Add trigger for updated_at on user_api_keys
CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Remove API key columns from profiles table (they're now in user_api_keys)
-- Note: We keep the columns for now but clear them to prevent data duplication
-- A future migration can drop them after code is updated
UPDATE public.profiles SET openai_api_key = NULL, kimi_api_key = NULL;