import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, X, Loader2, Zap, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface BulkKeywordSearchProps {
  /** Starts/refreshes scraping using the provided comma-separated keyword string. */
  onSearch: (keywords: string) => void;
  /** Optional: keep the listings filtered using the same search bar input. */
  onFilterChange?: (value: string) => void;
  isSearching: boolean;
  onGoogleSearchComplete?: () => void;
}

const SAMPLE_KEYWORDS = `Technology, Data Scientist, Data Engineer, Technical, Product Analyst, Data Analyst, Business Analyst, Machine Learning Engineer, UX/UI Designer, Full Stack Developer, Customer Service, Customer Success Architect, Solution Engineer, Project Manager, Support, Software Development, Data Science, Data Analysis, Cloud Computing, Cybersecurity, Programming Languages, Agile Methodologies, User Experience (UX), User Interface (UI), DevOps, Continuous Integration (CI), Continuous Deployment (CD), Machine Learning, Project Management, Database Management, Web Development, Cloud Technologies, Data Science & Analytics, Continuous Integration, User Experience (UX) & User Interface (UI)`;

const BOOLEAN_EXAMPLES = [
  'site:greenhouse.io "Data Scientist" remote',
  'site:lever.co "Software Engineer" "New York"',
  'site:jobs.ashbyhq.com "Product Manager"',
  'site:apply.workable.com "Machine Learning"',
];

export function BulkKeywordSearch({ onSearch, onFilterChange, isSearching, onGoogleSearchComplete }: BulkKeywordSearchProps) {
  const { user } = useAuth();
  const [keywordInput, setKeywordInput] = useState('');
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
  const [isGoogleSearching, setIsGoogleSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'api' | 'google'>('api');

  const normalize = (input: string) =>
    input
      .replace(/["""]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const parseKeywords = (input: string): string[] => {
    const normalized = normalize(input);
    const parts = normalized
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    // De-dupe while keeping order
    return parts.filter((k, idx) => parts.indexOf(k) === idx);
  };

  const handleSearch = () => {
    const normalized = normalize(keywordInput);
    const keywords = parseKeywords(normalized);

    if (keywords.length === 0) {
      toast.error('Please enter at least one keyword');
      return;
    }

    setKeywordInput(normalized);
    setActiveKeywords(keywords);
    onFilterChange?.(normalized);
    onSearch(normalized);
    toast.success(`Searching for ${keywords.length} keywords`);
  };

  const handleGoogleBooleanSearch = async () => {
    if (!user) {
      toast.error('Please log in to search');
      return;
    }

    const normalized = normalize(keywordInput);
    const keywords = parseKeywords(normalized);

    if (keywords.length === 0) {
      toast.error('Please enter at least one keyword');
      return;
    }

    setIsGoogleSearching(true);
    setActiveKeywords(keywords);
    
    try {
      toast.info('Starting Google boolean search...', { id: 'google-search' });
      
      const { data, error } = await supabase.functions.invoke('search-jobs-google', {
        body: {
          keywords: normalized,
          user_id: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Found ${data.totalFound} jobs via Google boolean search!`, { id: 'google-search' });
        onGoogleSearchComplete?.();
      } else {
        throw new Error(data?.error || 'Search failed');
      }
    } catch (error) {
      console.error('Google boolean search error:', error);
      toast.error('Failed to search. Make sure Firecrawl is connected.', { id: 'google-search' });
    } finally {
      setIsGoogleSearching(false);
    }
  };

  const loadSampleKeywords = () => {
    setKeywordInput(SAMPLE_KEYWORDS);
  };

  const loadBooleanExample = (example: string) => {
    setKeywordInput(example);
  };

  const removeKeyword = (keyword: string) => {
    const newKeywords = activeKeywords.filter(k => k !== keyword);
    setActiveKeywords(newKeywords);
    setKeywordInput(newKeywords.join(', '));
  };

  const clearAll = () => {
    setKeywordInput('');
    setActiveKeywords([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          Job Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as 'api' | 'google')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="api">
              <Zap className="h-4 w-4 mr-2" />
              Direct API
            </TabsTrigger>
            <TabsTrigger value="google">
              <Globe className="h-4 w-4 mr-2" />
              Google Boolean
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="api" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Search directly from Greenhouse & Workable APIs. Fast and reliable.
            </p>
            <Textarea
              placeholder="Enter keywords separated by commas, e.g.: Data Scientist, Machine Learning, Python, AWS..."
              value={keywordInput}
              onChange={(e) => {
                const next = e.target.value;
                setKeywordInput(next);
                onFilterChange?.(next);
              }}
              className="min-h-[80px] resize-none"
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleSearch} disabled={isSearching || !keywordInput.trim()}>
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search Jobs
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={loadSampleKeywords}>
                Load Sample Keywords
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="google" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Use Google boolean search to find jobs across ATS platforms. More comprehensive but slower.
            </p>
            <Textarea
              placeholder='Enter keywords, e.g.: Data Scientist, Remote, Python OR use boolean: site:greenhouse.io "Data Scientist"'
              value={keywordInput}
              onChange={(e) => {
                const next = e.target.value;
                setKeywordInput(next);
              }}
              className="min-h-[80px] resize-none"
            />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleGoogleBooleanSearch} disabled={isGoogleSearching || !keywordInput.trim()}>
                {isGoogleSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching Google...
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Google Boolean Search
                  </>
                )}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Boolean examples (click to use):</p>
              <div className="flex flex-wrap gap-1.5">
                {BOOLEAN_EXAMPLES.map((example, i) => (
                  <Badge 
                    key={i} 
                    variant="outline" 
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground text-xs"
                    onClick={() => loadBooleanExample(example)}
                  >
                    {example}
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {activeKeywords.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Active keywords ({activeKeywords.length}):
              </p>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {activeKeywords.slice(0, 20).map((keyword, i) => (
                <Badge 
                  key={i} 
                  variant="secondary" 
                  className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeKeyword(keyword)}
                >
                  {keyword}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
              {activeKeywords.length > 20 && (
                <Badge variant="outline">+{activeKeywords.length - 20} more</Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
