-- Add relevant_projects column to profiles table for storing project experience
-- This is similar to work_experience but with optional dates

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS relevant_projects JSONB DEFAULT '[]'::jsonb;