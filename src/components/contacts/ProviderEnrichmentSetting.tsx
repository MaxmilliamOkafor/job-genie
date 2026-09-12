import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

/**
 * Paid contact-provider lookups. Off unless the person switches it on, and an
 * existing explicit choice is read from the profile rather than reset.
 */
export function ProviderEnrichmentSetting() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('provider_enrichment_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data?.provider_enrichment_enabled === true);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = async (next: boolean) => {
    if (!user) return;
    setEnabled(next);
    const { error } = await supabase
      .from('profiles')
      .update({ provider_enrichment_enabled: next })
      .eq('user_id', user.id);
    if (error) {
      setEnabled(!next);
      toast.error('Could not save that preference');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Contact lookups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Contacts are found from free public sources: the job posting itself and the employer's own careers or
          recruiting pages. No paid service and no key of yours is needed.
        </p>
        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <Label htmlFor="provider-enrichment" className="text-sm font-medium">
              Also use a paid contact provider
            </Label>
            <p className="text-xs text-muted-foreground">
              Off by default. Nothing from another extension's sign-in is reused.
            </p>
          </div>
          <Switch
            id="provider-enrichment"
            checked={enabled}
            disabled={!isReady}
            onCheckedChange={toggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}
