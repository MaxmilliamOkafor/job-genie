import { supabase } from '@/integrations/supabase/client';
import { companyAliasMap } from '@/lib/jobRecords';

/**
 * The user's own spellings of each employer, read once per session from their
 * saved jobs (company names only). Used to show "Qube Research & Technologies"
 * rather than the web-address form "Quberesearchandtechnologies".
 */
const cache = new Map<string, Promise<Map<string, string>>>();
const PAGE = 1000;
const MAX_PAGES = 15;

export function loadCompanyAliases(userId: string): Promise<Map<string, string>> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const promise = (async () => {
    const names: string[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('jobs')
        .select('company')
        .eq('user_id', userId)
        .order('id')
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) break;
      for (const row of data ?? []) if (row.company) names.push(row.company);
      if ((data ?? []).length < PAGE) break;
    }
    return companyAliasMap(names);
  })().catch(() => new Map<string, string>());
  cache.set(userId, promise);
  return promise;
}
