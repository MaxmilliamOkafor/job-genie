UPDATE public.profiles
SET relevant_projects = (
  SELECT jsonb_agg(
    CASE p->>'name'
      WHEN 'SignalDesk' THEN jsonb_set(p, '{bullets}', '["Streams live financial news and filings through an LLM that extracts ticker level sentiment, citing the source line behind every signal and testing itself for hallucination."]'::jsonb)
      WHEN 'DriftGuard' THEN jsonb_set(p, '{bullets}', '["Open source framework that detects data and concept drift in a deployed model, then retrains, validates and canary deploys the replacement without human intervention."]'::jsonb)
      WHEN 'LedgerLens' THEN jsonb_set(p, '{bullets}', '["Credit risk API that returns the reasons behind every score alongside a fairness audit and a published model card, with a live demo that updates both as inputs change."]'::jsonb)
      ELSE p
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(relevant_projects) WITH ORDINALITY AS t(p, ord)
)
WHERE relevant_projects IS NOT NULL AND jsonb_array_length(relevant_projects) > 0;