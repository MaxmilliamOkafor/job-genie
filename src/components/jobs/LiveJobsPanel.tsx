import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Zap, 
  Globe, 
  RefreshCw, 
  Loader2, 
  Radio,
  Pause,
  Play,
  TrendingUp,
  Clock,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LiveJobsPanelProps {
  onJobsFetched: () => void;
}

const DEFAULT_KEYWORDS = `Technology, Data Scientist, Data Engineer, Technical, Product Analyst, Data Analyst, Business Analyst, Machine Learning Engineer, UX/UI Designer, Full Stack Developer, Customer Service, Customer Success Architect, Solution Engineer, Project Manager, Support, Software Development, Data Science, Data Analysis, Cloud Computing, Cybersecurity, Programming Languages, Agile Methodologies, User Experience (UX), User Interface (UI), DevOps, Continuous Integration (CI), Continuous Deployment (CD), Machine Learning, Project Management, Database Management, Web Development, Cloud Technologies, Data Science & Analytics`;

const DEFAULT_LOCATIONS = `Dublin, Ireland, United Kingdom, United States, United Arab Emirates, Dubai, Switzerland, Germany, Sweden, Spain, Netherlands, France, Belgium, Austria, Czech Republic, Portugal, Italy, Greece, Turkey, Singapore, Japan, Australia, Canada, Mexico, South Africa, Qatar, Norway, New Zealand, Denmark, Luxembourg, Malta, Cyprus, Morocco, Thailand, Serbia, Tanzania, Remote`;

export function LiveJobsPanel({ onJobsFetched }: LiveJobsPanelProps) {
  const { user } = useAuth();
  const [isPolling, setIsPolling] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [jobsFound, setJobsFound] = useState(0);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [timeValue, setTimeValue] = useState(30); // Default 30 minutes
  const [timeUnit, setTimeUnit] = useState<'minutes' | 'hours'>('minutes');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const fetchLiveJobs = useCallback(async () => {
    if (!user || isFetching) return;
    
    setIsFetching(true);
    
    // Convert time to hours for API
    const hoursFilter = timeUnit === 'hours' ? timeValue : timeValue / 60;
    
    try {
      const { data, error } = await supabase.functions.invoke('live-jobs', {
        body: {
          keywords,
          locations,
          hours: hoursFilter,
          user_id: user.id,
          limit: 100,
          sortBy: 'recent', // Prioritize recently added
        },
      });

      if (error) throw error;

      if (data?.success) {
        setJobsFound(data.totalFiltered || 0);
        setLastFetch(new Date());
        onJobsFetched();
        
        if (data.jobs?.length > 0) {
          toast.success(`Found ${data.jobs.length} new jobs!`, { 
            id: 'live-jobs',
            duration: 3000 
          });
        }
      } else {
        throw new Error(data?.error || 'Fetch failed');
      }
    } catch (error) {
      console.error('Live jobs error:', error);
      toast.error('Failed to fetch jobs', { id: 'live-jobs' });
    } finally {
      setIsFetching(false);
    }
  }, [user, keywords, locations, timeValue, timeUnit, onJobsFetched, isFetching]);

  const startPolling = useCallback(() => {
    if (pollInterval) clearInterval(pollInterval);
    
    setIsPolling(true);
    fetchLiveJobs(); // Initial fetch
    
    // Poll every 2 minutes
    const interval = setInterval(fetchLiveJobs, 2 * 60 * 1000);
    setPollInterval(interval);
    
    toast.success('Live polling started - refreshing every 2 minutes', {
      duration: 3000,
    });
  }, [fetchLiveJobs, pollInterval]);

  const stopPolling = useCallback(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setIsPolling(false);
    toast.info('Live polling stopped');
  }, [pollInterval]);

  // Auto-start polling on mount
  useEffect(() => {
    if (user && !isPolling && !pollInterval) {
      // Delay auto-start slightly to let page settle
      const autoStartTimer = setTimeout(() => {
        startPolling();
      }, 1000);
      return () => clearTimeout(autoStartTimer);
    }
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  const keywordCount = keywords.split(',').filter(k => k.trim()).length;
  const locationCount = locations.split(',').filter(l => l.trim()).length;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-primary/10 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isPolling ? 'bg-green-500/20 animate-pulse' : 'bg-primary/20'}`}>
              <Radio className={`h-5 w-5 ${isPolling ? 'text-green-500' : 'text-primary'}`} />
            </div>
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                Live Tech Jobs
                {isPolling && (
                  <Badge variant="default" className="bg-green-500 text-white animate-pulse">
                    LIVE
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                2-minute polling from 60+ tier-1 companies
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isFetching && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            <Button
              variant={isPolling ? "destructive" : "default"}
              size="sm"
              onClick={isPolling ? stopPolling : startPolling}
              disabled={isFetching || !user}
            >
              {isPolling ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Start Live
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLiveJobs}
              disabled={isFetching || !user}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-background/50 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              Jobs Found
            </div>
            <div className="text-2xl font-bold">{jobsFound.toLocaleString()}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Search className="h-3 w-3" />
              Keywords
            </div>
            <div className="text-2xl font-bold">{keywordCount}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Globe className="h-3 w-3" />
              Locations
            </div>
            <div className="text-2xl font-bold">{locationCount}</div>
          </div>
          <div className="bg-background/50 rounded-lg p-3 border">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3 w-3" />
              Last Fetch
            </div>
            <div className="text-lg font-medium">
              {lastFetch ? (
                <span className="text-green-500">
                  {Math.round((Date.now() - lastFetch.getTime()) / 1000)}s ago
                </span>
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </div>
          </div>
        </div>

        {/* Toggle Advanced */}
        <div className="flex items-center justify-between py-2 border-t border-b border-border/50">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <Label htmlFor="advanced-mode" className="font-medium">Advanced Configuration</Label>
          </div>
          <Switch
            id="advanced-mode"
            checked={showAdvanced}
            onCheckedChange={setShowAdvanced}
          />
        </div>

        {/* Advanced Config */}
        {showAdvanced && (
          <div className="space-y-4 animate-in fade-in-50 duration-300">
            {/* Keywords */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Bulk Keywords (comma-separated)</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{keywordCount} keywords</Badge>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setKeywords(DEFAULT_KEYWORDS)}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <Textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Data Scientist, Machine Learning, Python, AWS..."
                className="min-h-[120px] text-sm bg-background"
              />
            </div>

            {/* Locations */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Target Locations (comma-separated)</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{locationCount} locations</Badge>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => setLocations(DEFAULT_LOCATIONS)}
                  >
                    Reset
                  </Button>
                </div>
              </div>
              <Textarea
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="Dublin, Ireland, Remote, Germany..."
                className="min-h-[80px] text-sm bg-background"
              />
            </div>

            {/* Time Filter - Custom Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Posted Within</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-xs">
                  <Input
                    type="number"
                    min={1}
                    max={timeUnit === 'hours' ? 168 : 10080}
                    value={timeValue}
                    onChange={(e) => setTimeValue(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24"
                  />
                  <Select value={timeUnit} onValueChange={(v: 'minutes' | 'hours') => setTimeUnit(v)}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">ago</span>
                </div>
                {/* Quick presets */}
                <div className="flex gap-1">
                  {[
                    { value: 15, unit: 'minutes', label: '15m' },
                    { value: 30, unit: 'minutes', label: '30m' },
                    { value: 1, unit: 'hours', label: '1h' },
                    { value: 24, unit: 'hours', label: '24h' },
                  ].map(preset => (
                    <Button
                      key={preset.label}
                      variant={timeValue === preset.value && timeUnit === preset.unit ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setTimeValue(preset.value);
                        setTimeUnit(preset.unit as 'minutes' | 'hours');
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ATS Platforms Info - Clickable */}
        <div className="bg-background/30 rounded-lg p-4 border border-border/50">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Priority ATS Platforms
          </h4>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'Greenhouse', url: 'https://www.greenhouse.com' },
              { name: 'SmartRecruiters', url: 'https://www.smartrecruiters.com' },
              { name: 'Lever', url: 'https://www.lever.co' },
              { name: 'Workday', url: 'https://www.workday.com' },
              { name: 'Ashby', url: 'https://www.ashbyhq.com' },
              { name: 'Workable', url: 'https://www.workable.com' },
            ].map(platform => (
              <Badge 
                key={platform.name} 
                variant="outline" 
                className="text-xs cursor-pointer hover:bg-primary/10 hover:border-primary transition-colors"
                onClick={() => window.open(platform.url, '_blank')}
              >
                {platform.name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Direct API access to 60+ tier-1 companies including Stripe, Airbnb, Figma, Notion, Coinbase, and more
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
