import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, X, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface BulkKeywordSearchProps {
  /** Starts/refreshes scraping using the provided comma-separated keyword string. */
  onSearch: (keywords: string) => void;
  /** Optional: keep the listings filtered using the same search bar input. */
  onFilterChange?: (value: string) => void;
  isSearching: boolean;
}

const SAMPLE_KEYWORDS = `Technology, Data Scientist, Data Engineer, Technical, Product Analyst, Data Analyst, Business Analyst, Machine Learning Engineer, UX/UI Designer, Full Stack Developer, Customer Service, Customer Success Architect, Solution Engineer, Project Manager, Support, Software Development, Data Science, Data Analysis, Cloud Computing, Cybersecurity, Programming Languages, Agile Methodologies, User Experience (UX), User Interface (UI), DevOps, Continuous Integration (CI), Continuous Deployment (CD), Machine Learning, Project Management, Database Management, Web Development, Cloud Technologies, Data Science & Analytics, Continuous Integration, User Experience (UX) & User Interface (UI)`;

export function BulkKeywordSearch({ onSearch, onFilterChange, isSearching }: BulkKeywordSearchProps) {
  const [keywordInput, setKeywordInput] = useState('');
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);

  const normalize = (input: string) =>
    input
      .replace(/[“”"]/g, '')
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

  const loadSampleKeywords = () => {
    setKeywordInput(SAMPLE_KEYWORDS);
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
          Bulk Keyword Search
          <span className="text-xs font-normal text-muted-foreground ml-2">
            Separate keywords with commas - No limit!
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="Enter keywords separated by commas, e.g.: Data Scientist, Machine Learning, Python, AWS, Cloud Computing..."
          value={keywordInput}
          onChange={(e) => {
            const next = e.target.value;
            setKeywordInput(next);
            onFilterChange?.(next);
          }}
          className="min-h-[100px] resize-none"
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
          {activeKeywords.length > 0 && (
            <Button variant="ghost" onClick={clearAll}>
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          )}
        </div>

        {activeKeywords.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Active keywords ({activeKeywords.length}):
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {activeKeywords.map((keyword, i) => (
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
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
