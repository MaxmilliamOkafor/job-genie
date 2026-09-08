ALTER FUNCTION public.jp_norm_text(text) SET search_path = public;
ALTER FUNCTION public.jp_norm_title(text) SET search_path = public;
ALTER FUNCTION public.jp_norm_location(text) SET search_path = public;
ALTER FUNCTION public.jp_seniority(text) SET search_path = public;
ALTER FUNCTION public.jp_requisition_id(text, text) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.job_pool_mark_canonical() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.job_pool_derive() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_pool_mark_canonical() TO service_role;