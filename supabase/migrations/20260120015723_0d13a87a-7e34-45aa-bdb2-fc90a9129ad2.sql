-- Add SELECT policy so users can read their own API keys record (needed for upsert)
-- This is safe because the row only contains their own keys
CREATE POLICY "Users can view their own API keys" 
ON public.user_api_keys 
FOR SELECT 
USING (auth.uid() = user_id);