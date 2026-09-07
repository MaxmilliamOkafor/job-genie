ALTER TABLE public.profiles ALTER COLUMN certifications_hidden SET DEFAULT true;

UPDATE public.profiles p
SET certifications_hidden = true
WHERE certifications_hidden = false
  AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p.user_id AND lower(u.email) = 'maxokafordev@gmail.com'
  );