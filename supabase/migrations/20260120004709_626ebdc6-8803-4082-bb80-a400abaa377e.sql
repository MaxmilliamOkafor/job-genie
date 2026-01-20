-- Rename work_experience column to professional_experience for consistency
ALTER TABLE public.profiles 
RENAME COLUMN work_experience TO professional_experience;