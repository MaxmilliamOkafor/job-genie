UPDATE public.profiles
SET relevant_projects = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') = 'SignalDesk — Real-Time Market-Sentiment Engine'
        THEN jsonb_set(elem, '{description}', to_jsonb('Streams live financial news and filings through an LLM that extracts ticker level sentiment, citing the source line behind every signal and testing itself for hallucination.'::text))
      WHEN (elem->>'name') = 'DriftGuard — Self-Healing MLOps Platform'
        THEN jsonb_set(elem, '{description}', to_jsonb('Open source framework that detects data and concept drift in a deployed model, then retrains, validates and canary deploys the replacement without human intervention.'::text))
      WHEN (elem->>'name') = 'LedgerLens — Explainable Credit-Risk Scoring API'
        THEN jsonb_set(elem, '{description}', to_jsonb('Credit risk API that returns the reasons behind every score alongside a fairness audit and a published model card, with a live demo that updates both as inputs change.'::text))
      ELSE elem
    END
  )
  FROM jsonb_array_elements(relevant_projects) AS elem
)
WHERE user_id = 'b0eb1751-cbe3-43dc-bf20-016b96b00e3a';