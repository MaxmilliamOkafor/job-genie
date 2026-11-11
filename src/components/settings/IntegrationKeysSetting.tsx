import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
  connectionLine,
  keyEndings,
} from '@/lib/integrationKeys';

/**
 * LeadOcean and Flow connections. Keys are added in the extension; here they
 * are only shown by their last four characters and can be removed.
 */
export function IntegrationKeysSetting() {
  const { user } = useAuth();
  const [endings, setEndings] = useState<Partial<Record<IntegrationProvider, string>>>({});
  const [isReady, setIsReady] = useState(false);
  const [removing, setRemoving] = useState<IntegrationProvider | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_integration_keys')
        .select('provider, api_key')
        .eq('user_id', user.id);
      if (cancelled) return;
      // Reduce to the last four characters straight away; the full key is not kept.
      setEndings(error ? {} : keyEndings(data));
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const remove = async (provider: IntegrationProvider, label: string) => {
    if (!user) return;
    setRemoving(provider);
    const { error } = await supabase
      .from('user_integration_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);
    setRemoving(null);
    if (error) {
      toast.error(`Could not remove the ${label} key`);
      return;
    }
    setEndings((prev) => {
      const next = { ...prev };
      delete next[provider];
      return next;
    });
    toast.success(`${label} key removed from your account`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Connections
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {INTEGRATION_PROVIDERS.map(({ id, label }) => {
          const ending = endings[id] ?? '';
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {isReady ? connectionLine(ending) : 'Checking…'}
                </p>
              </div>
              {ending && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={removing === id}
                  onClick={() => remove(id, label)}
                >
                  {removing === id ? 'Removing…' : 'Remove'}
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
