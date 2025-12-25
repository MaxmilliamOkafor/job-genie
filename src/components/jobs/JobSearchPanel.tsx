import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Calendar, Loader2, X, Infinity } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { ScrapeProgress } from './ScrapeProgress';

interface JobSearchPanelProps {
  onSearchComplete: () => void;
  isSearching: boolean;
  setIsSearching: (val: boolean) => void;
}

interface ScrapeState {
  currentPhase: 'idle' | 'searching' | 'processing' | 'saving' | 'complete';
  jobsFound: number;
  jobsSaved: number;
  companiesSearched: number;
  totalCompanies: number;
  startTime: number;
  elapsedTime: number;
}

const LOCATIONS = [
  { value: 'all', label: 'All Locations' },
  { value: 'Remote', label: 'Remote' },
  { value: 'United States', label: 'United States' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Europe', label: 'Europe' },
  { value: 'London', label: 'London, UK' },
  { value: 'New York', label: 'New York, US' },
  { value: 'San Francisco', label: 'San Francisco, US' },
  { value: 'Dublin', label: 'Dublin, Ireland' },
];

const DATE_FILTERS = [
  { value: 'all', label: 'Any Time' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '3d', label: 'Last 3 Days' },
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
];

// Total companies we scrape from (Greenhouse + Workable + Lever)
const TOTAL_COMPANIES = 120;

export function JobSearchPanel({ onSearchComplete, isSearching, setIsSearching }: JobSearchPanelProps) {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('Remote');
  const [dateFilter, setDateFilter] = useState('week');
  
  const [scrapeState, setScrapeState] = useState<ScrapeState>({
    currentPhase: 'idle',
    jobsFound: 0,
    jobsSaved: 0,
    companiesSearched: 0,
    totalCompanies: TOTAL_COMPANIES,
    startTime: 0,
    elapsedTime: 0,
  });

  // Update elapsed time while searching
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isSearching && scrapeState.startTime > 0) {
      intervalId = setInterval(() => {
        setScrapeState(prev => ({
          ...prev,
          elapsedTime: Date.now() - prev.startTime,
        }));
      }, 100);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isSearching, scrapeState.startTime]);

  // Simulate progress updates for company scraping
  const simulateProgress = useCallback(() => {
    const phases: Array<{ phase: ScrapeState['currentPhase']; companies: number; duration: number }> = [
      { phase: 'searching', companies: 20, duration: 2000 },
      { phase: 'searching', companies: 50, duration: 2000 },
      { phase: 'searching', companies: 80, duration: 2000 },
      { phase: 'searching', companies: 100, duration: 2000 },
      { phase: 'processing', companies: 120, duration: 1500 },
      { phase: 'saving', companies: 120, duration: 1000 },
    ];

    let totalDelay = 0;
    phases.forEach(({ phase, companies, duration }) => {
      setTimeout(() => {
        setScrapeState(prev => ({
          ...prev,
          currentPhase: phase,
          companiesSearched: companies,
        }));
      }, totalDelay);
      totalDelay += duration;
    });
  }, []);

  const parseKeywords = (input: string): string[] => {
    return input
      .replace(/["""]/g, '')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  };

  const keywordCount = parseKeywords(keywords).length;

  const handleSearch = async () => {
    if (!user) {
      toast.error('Please log in to search');
      return;
    }

    const parsedKeywords = parseKeywords(keywords);
    if (parsedKeywords.length === 0) {
      toast.error('Please enter at least one keyword');
      return;
    }

    setIsSearching(true);
    setScrapeState({
      currentPhase: 'searching',
      jobsFound: 0,
      jobsSaved: 0,
      companiesSearched: 0,
      totalCompanies: TOTAL_COMPANIES,
      startTime: Date.now(),
      elapsedTime: 0,
    });

    // Start progress simulation
    simulateProgress();
    
    try {
      // Use scrape-jobs which now has NO LIMITS
      const { data, error } = await supabase.functions.invoke('scrape-jobs', {
        body: {
          keywords: parsedKeywords.join(', '),
          user_id: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        setScrapeState(prev => ({
          ...prev,
          currentPhase: 'complete',
          jobsFound: data.totalFound || 0,
          jobsSaved: data.newJobsInserted || 0,
          companiesSearched: data.companiesScraped || TOTAL_COMPANIES,
        }));
        
        toast.success(`Found ${data.totalFound} jobs! (${data.newJobsInserted} new)`, { id: 'job-search' });
        onSearchComplete();

        // Reset to idle after 8 seconds
        setTimeout(() => {
          setScrapeState(prev => ({ ...prev, currentPhase: 'idle' }));
        }, 8000);
      } else {
        throw new Error(data?.error || 'Search failed');
      }
    } catch (error) {
      console.error('Job search error:', error);
      toast.error('Search failed. Please try again.', { id: 'job-search' });
      setScrapeState(prev => ({ ...prev, currentPhase: 'idle' }));
    } finally {
      setIsSearching(false);
    }
  };

  const clearKeywords = () => setKeywords('');

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardContent className="p-6 space-y-4">
          {/* Keywords textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-2">
                Keywords
                <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                  <Infinity className="h-3 w-3 mr-1" />
                  Unlimited
                </Badge>
              </label>
              <div className="flex items-center gap-2">
                {keywordCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {keywordCount} keyword{keywordCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                {keywords && (
                  <Button variant="ghost" size="sm" onClick={clearKeywords} className="h-7 text-xs">
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              placeholder="Enter keywords separated by commas, e.g.: Data Scientist, Machine Learning, Python, AWS, Product Manager..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="min-h-[100px] resize-none bg-background"
            />
          </div>

          {/* Filters row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="pl-10 h-11 bg-background">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map(loc => (
                    <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="pl-10 h-11 bg-background">
                  <SelectValue placeholder="Posted" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FILTERS.map(df => (
                    <SelectItem key={df.value} value={df.value}>{df.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search button */}
          <Button 
            onClick={handleSearch} 
            disabled={isSearching || keywordCount === 0}
            className="w-full h-12 text-base font-medium"
            size="lg"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Scraping {TOTAL_COMPANIES}+ Companies...
              </>
            ) : (
              <>
                <Search className="h-5 w-5 mr-2" />
                Scrape All Jobs {keywordCount > 0 ? `(${keywordCount} Keywords)` : ''}
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Scrapes {TOTAL_COMPANIES}+ companies from Greenhouse, Lever, Workable • No limits on jobs found
          </p>
        </CardContent>
      </Card>

      {/* Progress indicator */}
      <ScrapeProgress
        isSearching={isSearching}
        currentPhase={scrapeState.currentPhase}
        jobsFound={scrapeState.jobsFound}
        jobsSaved={scrapeState.jobsSaved}
        platformsSearched={scrapeState.companiesSearched}
        totalPlatforms={scrapeState.totalCompanies}
        elapsedTime={scrapeState.elapsedTime}
      />
    </div>
  );
}
