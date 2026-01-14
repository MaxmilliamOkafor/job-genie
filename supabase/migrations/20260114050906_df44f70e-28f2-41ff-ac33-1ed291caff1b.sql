-- Add Kimi K2 API key and AI provider preference fields
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS kimi_api_key TEXT,
ADD COLUMN IF NOT EXISTS preferred_ai_provider TEXT DEFAULT 'openai',
ADD COLUMN IF NOT EXISTS openai_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS kimi_enabled BOOLEAN DEFAULT true;