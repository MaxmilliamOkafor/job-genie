import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AiErrorRow {
  id: string;
  function_name: string;
  error_code: string;
  provider: string | null;
  provider_status: number | null;
  user_message: string;
  created_at: string;
}

const BILLING_CODES = ['ai_billing'];

/**
 * One-glance answer to "is the AI refusing my requests?".
 * Shows the last AI failure verbatim, so a billing refusal is never mistaken
 * for a bad CV.
 */
export function AIProviderHealth() {
  const { user } = useAuth();
  const [lastError, setLastError] = useState<AiErrorRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await (supabase as any)
      .from('ai_error_log')
      .select('id, function_name, error_code, provider, provider_status, user_message, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Failed to read AI error log:', error.message);
    } else {
      setLastError((data?.[0] as AiErrorRow) || null);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const clear = async () => {
    if (!user) return;
    await (supabase as any).from('ai_error_log').delete().eq('user_id', user.id);
    setLastError(null);
  };

  if (isLoading) return null;

  if (!lastError) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-medium">AI requests healthy</span>
            <span className="text-muted-foreground">no provider refusals recorded</span>
            <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={load}>
              <RefreshCw className="h-3 w-3" />
              Recheck
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isBilling = BILLING_CODES.includes(lastError.error_code);
  const when = new Date(lastError.created_at).toLocaleString();

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <AlertOctagon className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-destructive">
                {isBilling ? 'AI provider refused your requests (billing)' : 'AI provider error'}
              </p>
              <Badge variant="outline" className="text-xs">
                {lastError.error_code}
              </Badge>
              {lastError.provider_status && (
                <Badge variant="secondary" className="text-xs">
                  HTTP {lastError.provider_status}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {lastError.function_name} - {when}
              </span>
            </div>
            {/* Displayed verbatim: this is the provider's own reason. */}
            <p className="text-sm text-foreground/90">{lastError.user_message}</p>
            <div className="flex items-center gap-3 pt-1">
              <Link to="/profile#api-key-section" className="text-sm font-medium text-primary hover:underline">
                Open API settings
              </Link>
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
              <Button variant="ghost" size="sm" className="gap-1" onClick={load}>
                <RefreshCw className="h-3 w-3" />
                Recheck
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
