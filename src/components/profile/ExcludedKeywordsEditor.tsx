import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ExcludedKeyword,
  newExclusion,
  parseExcludedKeywords,
  removeExclusion,
} from '@/lib/excludedKeywords';

export function ExcludedKeywordsEditor() {
  const { user } = useAuth();
  const { profile, refetch } = useProfile();
  const [term, setTerm] = useState('');
  const [covers, setCovers] = useState('');
  const [saving, setSaving] = useState(false);

  const list = useMemo(
    () => parseExcludedKeywords((profile as unknown as { excluded_keywords?: unknown })?.excluded_keywords),
    [profile],
  );

  const persist = async (next: ExcludedKeyword[]) => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ excluded_keywords: next } as never)
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast.error('Could not save the excluded terms');
      return;
    }
    await refetch();
  };

  const add = async () => {
    if (!term.trim()) return;
    const entry = newExclusion(
      term,
      covers.split(',').map((c) => c.trim()).filter(Boolean),
    );
    setTerm('');
    setCovers('');
    await persist([...list, entry]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excluded terms</CardTitle>
        <CardDescription>
          An excluded term is never tailored into a CV or cover letter, on this site or in the
          browser extension. Nothing already written into your profile is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Term to exclude"
            placeholder="Term to exclude, e.g. Kubernetes"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Input
            aria-label="Other wordings this covers"
            placeholder="Other wordings it covers (comma separated)"
            value={covers}
            onChange={(e) => setCovers(e.target.value)}
          />
          <Button onClick={() => void add()} disabled={saving || !term.trim()}>
            Add
          </Button>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No excluded terms yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((entry, i) => (
              <li
                key={`${entry.id}-${entry.at}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2"
              >
                <span className="font-medium">{entry.term}</span>
                {entry.covers.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
                <span className="ml-auto text-xs text-muted-foreground">
                  Added {new Date(entry.at).toLocaleDateString('en-GB')}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={`Remove ${entry.term}`}
                  disabled={saving}
                  onClick={() => void persist(removeExclusion(list, entry))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
