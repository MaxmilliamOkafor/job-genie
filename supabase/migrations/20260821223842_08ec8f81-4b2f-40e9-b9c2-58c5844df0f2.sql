UPDATE public.profiles
SET relevant_projects = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') = 'SignalDesk — Real-Time Market-Sentiment Engine'
        THEN jsonb_set(elem, '{name}', to_jsonb('SignalDesk'::text))
      WHEN (elem->>'name') = 'DriftGuard — Self-Healing MLOps Platform'
        THEN jsonb_set(elem, '{name}', to_jsonb('DriftGuard'::text))
      WHEN (elem->>'name') = 'LedgerLens — Explainable Credit-Risk Scoring API'
        THEN jsonb_set(elem, '{name}', to_jsonb('LedgerLens'::text))
      ELSE elem
    END
  )
  FROM jsonb_array_elements(relevant_projects) AS elem
)
WHERE user_id = 'b0eb1751-cbe3-43dc-bf20-016b96b00e3a';