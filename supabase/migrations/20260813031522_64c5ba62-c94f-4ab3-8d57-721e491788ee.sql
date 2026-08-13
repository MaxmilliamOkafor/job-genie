UPDATE public.profiles
SET certifications = (
  SELECT array_agg(replace(c, 'Speciality', 'Specialty') ORDER BY ord)
  FROM unnest(certifications) WITH ORDINALITY AS t(c, ord)
)
WHERE array_to_string(certifications, '|') LIKE '%Speciality%';

UPDATE public.profiles
SET professional_experience = (
  SELECT jsonb_agg(
           CASE WHEN e ? 'bullets' AND jsonb_typeof(e->'bullets') = 'array'
                THEN jsonb_set(e, '{bullets}', (
                       SELECT coalesce(jsonb_agg(
                                replace(replace(replace(replace(
                                  b,
                                  'absorbing several-fold pilot traffic growth', 'absorbing pilot traffic growth'),
                                  'sharply cutting audit-preparation time', 'reducing audit-preparation time'),
                                  ' and measurably higher uptime', ''),
                                  'surfacing significant exposure for the risk team', 'surfacing fraud and risk exposure for the risk team')
                                ORDER BY bord), '[]'::jsonb)
                       FROM jsonb_array_elements_text(e->'bullets') WITH ORDINALITY AS bt(b, bord)
                     ))
                ELSE e END
           ORDER BY ord)
  FROM jsonb_array_elements(professional_experience::jsonb) WITH ORDINALITY AS t(e, ord)
)
WHERE professional_experience::text ~* '(several-fold|measurably higher|significant exposure|sharply cutting)';