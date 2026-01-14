import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area } from 'recharts';
import { Activity, TrendingUp, GitCompare } from 'lucide-react';

interface UsageDataPoint {
  date: string;
  'tailor-application': number;
  'answer-questions': number;
  'tailor-application-kimi': number;
  'answer-questions-kimi': number;
  total: number;
  openai: number;
  kimi: number;
}

export const ApiUsageChart = () => {
  const { user } = useAuth();
  const [usageData, setUsageData] = useState<UsageDataPoint[]>([]);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [providerView, setProviderView] = useState<'all' | 'openai' | 'kimi'>('all');
  const [chartType, setChartType] = useState<'breakdown' | 'comparison'>('breakdown');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUsageData();
    }
  }, [user, timeRange]);

  const fetchUsageData = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('api_usage')
        .select('function_name, tokens_used, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      // Apply date filter
      if (timeRange !== 'all') {
        const daysAgo = timeRange === '7d' ? 7 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by date and function
      const grouped: Record<string, UsageDataPoint> = {};
      
      data?.forEach((row) => {
        const date = new Date(row.created_at).toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        
        if (!grouped[date]) {
          grouped[date] = {
            date,
            'tailor-application': 0,
            'answer-questions': 0,
            'tailor-application-kimi': 0,
            'answer-questions-kimi': 0,
            total: 0,
            openai: 0,
            kimi: 0,
          };
        }
        
        const funcName = row.function_name;
        // Track by provider - Kimi functions have '-kimi' suffix
        if (funcName === 'tailor-application') {
          grouped[date]['tailor-application']++;
          grouped[date].openai++;
        } else if (funcName === 'answer-questions') {
          grouped[date]['answer-questions']++;
          grouped[date].openai++;
        } else if (funcName === 'tailor-application-kimi') {
          grouped[date]['tailor-application-kimi']++;
          grouped[date].kimi++;
        } else if (funcName === 'answer-questions-kimi') {
          grouped[date]['answer-questions-kimi']++;
          grouped[date].kimi++;
        }
        grouped[date].total++;
      });

      setUsageData(Object.values(grouped));
    } catch (error) {
      console.error('Error fetching usage data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalCalls = usageData.reduce((sum, d) => sum + d.total, 0);
  const openaiCalls = usageData.reduce((sum, d) => sum + d.openai, 0);
  const kimiCalls = usageData.reduce((sum, d) => sum + d.kimi, 0);
  const tailorCalls = usageData.reduce((sum, d) => sum + d['tailor-application'], 0);
  const answerCalls = usageData.reduce((sum, d) => sum + d['answer-questions'], 0);
  const tailorKimiCalls = usageData.reduce((sum, d) => sum + d['tailor-application-kimi'], 0);
  const answerKimiCalls = usageData.reduce((sum, d) => sum + d['answer-questions-kimi'], 0);

  // Calculate percentages for comparison
  const openaiPercent = totalCalls > 0 ? Math.round((openaiCalls / totalCalls) * 100) : 0;
  const kimiPercent = totalCalls > 0 ? Math.round((kimiCalls / totalCalls) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-primary" />
            API Usage Breakdown
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={chartType} onValueChange={(v: 'breakdown' | 'comparison') => setChartType(v)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="breakdown">By Function</SelectItem>
                <SelectItem value="comparison">Provider Compare</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={(v: '7d' | '30d' | 'all') => setTimeRange(v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {chartType === 'breakdown' ? (
          <>
            {/* Provider Tabs */}
            <Tabs value={providerView} onValueChange={(v) => setProviderView(v as 'all' | 'openai' | 'kimi')} className="mb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All Providers</TabsTrigger>
                <TabsTrigger value="openai">OpenAI</TabsTrigger>
                <TabsTrigger value="kimi">Kimi K2</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Summary Stats */}
            {providerView === 'all' && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{totalCalls}</div>
                  <div className="text-xs text-muted-foreground">Total Calls</div>
                </div>
                <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-blue-500">{openaiCalls}</div>
                  <div className="text-xs text-muted-foreground">OpenAI</div>
                </div>
                <div className="text-center p-3 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{kimiCalls}</div>
                  <div className="text-xs text-muted-foreground">Kimi K2</div>
                </div>
                <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-purple-500">{tailorCalls + tailorKimiCalls}</div>
                  <div className="text-xs text-muted-foreground">Tailoring</div>
                </div>
              </div>
            )}

            {providerView === 'openai' && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-blue-500">{openaiCalls}</div>
                  <div className="text-xs text-muted-foreground">Total OpenAI</div>
                </div>
                <div className="text-center p-3 bg-blue-400/10 rounded-lg">
                  <div className="text-2xl font-bold text-blue-400">{tailorCalls}</div>
                  <div className="text-xs text-muted-foreground">Resume Tailoring</div>
                </div>
                <div className="text-center p-3 bg-blue-300/10 rounded-lg">
                  <div className="text-2xl font-bold text-blue-300">{answerCalls}</div>
                  <div className="text-xs text-muted-foreground">Question Answering</div>
                </div>
              </div>
            )}

            {providerView === 'kimi' && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-500">{kimiCalls}</div>
                  <div className="text-xs text-muted-foreground">Total Kimi K2</div>
                </div>
                <div className="text-center p-3 bg-green-400/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-400">{tailorKimiCalls}</div>
                  <div className="text-xs text-muted-foreground">Resume Tailoring</div>
                </div>
                <div className="text-center p-3 bg-green-300/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-300">{answerKimiCalls}</div>
                  <div className="text-xs text-muted-foreground">Question Answering</div>
                </div>
              </div>
            )}

            {/* Breakdown Chart */}
            {isLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : usageData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No API usage data yet</p>
                  <p className="text-xs">Start using AI features to see your usage here</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={usageData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                  {(providerView === 'all' || providerView === 'openai') && (
                    <>
                      <Bar 
                        dataKey="tailor-application" 
                        name="OpenAI Tailoring" 
                        fill="hsl(217, 91%, 60%)" 
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="answer-questions" 
                        name="OpenAI Q&A" 
                        fill="hsl(217, 91%, 75%)" 
                        radius={[4, 4, 0, 0]}
                      />
                    </>
                  )}
                  {(providerView === 'all' || providerView === 'kimi') && (
                    <>
                      <Bar 
                        dataKey="tailor-application-kimi" 
                        name="Kimi Tailoring" 
                        fill="hsl(142, 71%, 45%)" 
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar 
                        dataKey="answer-questions-kimi" 
                        name="Kimi Q&A" 
                        fill="hsl(142, 71%, 65%)" 
                        radius={[4, 4, 0, 0]}
                      />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}

            <p className="text-xs text-muted-foreground mt-3 text-center">
              {providerView === 'openai' && 'OpenAI uses GPT-4o-mini for all AI features'}
              {providerView === 'kimi' && 'Kimi K2 uses kimi-k2-0711-preview model'}
              {providerView === 'all' && 'Usage tracked separately by AI provider'}
            </p>
          </>
        ) : (
          <>
            {/* Provider Comparison View */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">OpenAI vs Kimi K2 Comparison</span>
              </div>
              
              {/* Comparison Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-500">OpenAI</span>
                    <span className="text-xs text-muted-foreground">GPT-4o-mini</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-500">{openaiCalls}</div>
                  <div className="text-xs text-muted-foreground">API calls ({openaiPercent}%)</div>
                  <div className="mt-2 h-2 bg-blue-500/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${openaiPercent}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-500">Kimi K2</span>
                    <span className="text-xs text-muted-foreground">kimi-k2-0711</span>
                  </div>
                  <div className="text-3xl font-bold text-green-500">{kimiCalls}</div>
                  <div className="text-xs text-muted-foreground">API calls ({kimiPercent}%)</div>
                  <div className="mt-2 h-2 bg-green-500/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{ width: `${kimiPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Line Chart */}
            {isLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : usageData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No comparison data yet</p>
                  <p className="text-xs">Use both providers to see comparison</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={usageData}>
                  <defs>
                    <linearGradient id="openaiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="kimiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area 
                    type="monotone"
                    dataKey="openai" 
                    name="OpenAI" 
                    stroke="hsl(217, 91%, 60%)" 
                    fill="url(#openaiGradient)"
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone"
                    dataKey="kimi" 
                    name="Kimi K2" 
                    stroke="hsl(142, 71%, 45%)" 
                    fill="url(#kimiGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            <p className="text-xs text-muted-foreground mt-3 text-center">
              Compare AI provider usage over time to optimize your API costs
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
