import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Zap, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface UsageStats {
  openai: number;
  kimi: number;
  total: number;
}

export function AIProviderStatus() {
  const { profile } = useProfile();
  const { user } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats>({ openai: 0, kimi: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUsageStats();
    }
  }, [user]);

  const fetchUsageStats = async () => {
    if (!user) return;
    
    try {
      // Get usage from last 30 days with pagination to handle large datasets
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const allData: { function_name: string; tokens_used: number | null }[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('api_usage')
          .select('function_name, tokens_used')
          .eq('user_id', user.id)
          .gte('created_at', thirtyDaysAgo.toISOString())
          .range(offset, offset + batchSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }
      
      let openai = 0;
      let kimi = 0;
      
      allData.forEach((row) => {
        const tokens = row.tokens_used || 0;
        if (row.function_name?.includes('-kimi')) {
          kimi += tokens;
        } else {
          openai += tokens;
        }
      });
      
      setUsageStats({
        openai,
        kimi,
        total: openai + kimi
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const activeProvider = profile?.preferred_ai_provider || 'openai';
  const hasActiveProvider = 
    (activeProvider === 'openai' && profile?.openai_enabled && !!profile?.openai_api_key) ||
    (activeProvider === 'kimi' && profile?.kimi_enabled && !!profile?.kimi_api_key);

  const providerConfig = {
    openai: {
      name: 'OpenAI',
      model: 'GPT-4o-mini',
      color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
      icon: '🤖'
    },
    kimi: {
      name: 'Kimi K2',
      model: 'moonshot-v1',
      color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
      icon: '🌙'
    }
  };

  const currentProvider = providerConfig[activeProvider as keyof typeof providerConfig] || providerConfig.openai;

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  if (!hasActiveProvider) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-destructive">No AI Provider Active</p>
              <p className="text-sm text-muted-foreground">
                Configure an API key to enable AI features
              </p>
            </div>
            <Link 
              to="/profile#api-key-section" 
              className="text-sm font-medium text-primary hover:underline"
            >
              Configure →
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
              {currentProvider.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">AI Provider</p>
                <Badge variant="outline" className={currentProvider.color}>
                  <Zap className="h-3 w-3 mr-1" />
                  {currentProvider.name}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {currentProvider.model}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Active and ready for resume tailoring & question answering
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Usage Stats */}
            <div className="hidden md:flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  <span>30-Day Tokens</span>
                </div>
                <p className="font-semibold text-lg">
                  {isLoading ? '...' : formatTokens(usageStats.total)}
                </p>
              </div>
              
              {usageStats.openai > 0 && usageStats.kimi > 0 && (
                <div className="text-center border-l pl-4">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>Split</span>
                  </div>
                  <p className="text-xs">
                    <span className="text-emerald-600">{formatTokens(usageStats.openai)}</span>
                    {' / '}
                    <span className="text-blue-600">{formatTokens(usageStats.kimi)}</span>
                  </p>
                </div>
              )}
            </div>
            
            <Link 
              to="/profile#api-key-section" 
              className="text-sm font-medium text-primary hover:underline"
            >
              Settings →
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
