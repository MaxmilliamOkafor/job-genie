import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  EMPTY_PREFERENCES,
  parsePreferences,
  type JobPreferences,
} from '@/lib/jobPreferences';

/**
 * Reads and writes the candidate's saved job-search targets, kept on the profile
 * under learned_preferences.job_search. Other keys in that object are preserved.
 */
export function useJobPreferences() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<JobPreferences>(EMPTY_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('learned_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) console.error('[job preferences] load failed', error);
    const raw = (data?.learned_preferences ?? {}) as Record<string, unknown>;
    setPreferences(parsePreferences(raw.job_search));
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: JobPreferences) => {
      if (!user) return false;
      setIsSaving(true);
      try {
        const { data } = await supabase
          .from('profiles')
          .select('learned_preferences')
          .eq('user_id', user.id)
          .maybeSingle();
        const existing = (data?.learned_preferences ?? {}) as Record<string, unknown>;
        const { error } = await supabase
          .from('profiles')
          .update({ learned_preferences: { ...existing, job_search: { ...next } } as any })
          .eq('user_id', user.id);
        if (error) throw error;
        setPreferences(next);
        return true;
      } catch (err) {
        console.error('[job preferences] save failed', err);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [user],
  );

  return { preferences, isLoading, isSaving, save, reload: load };
}
