import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronDown, 
  ChevronUp, 
  Check, 
  X, 
  Target,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ATSScoreBreakdownProps {
  matchScore: number;
  requirements: string[];
  jobTitle: string;
  userSkills?: string[];
  className?: string;
  jobUrl?: string;
  jobDescription?: string;
  jobId?: string;
}

export function ATSScoreBreakdown({ 
  matchScore, 
  requirements: initialRequirements, 
  jobTitle,
  userSkills = [],
  className,
  jobUrl,
  jobDescription,
  jobId
}: ATSScoreBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [hasExtracted, setHasExtracted] = useState(false);
  
  // Use extracted keywords if available, otherwise fall back to initial requirements
  const requirements = extractedKeywords.length > 0 ? extractedKeywords : initialRequirements;
  
  // Auto-extract keywords when component mounts if requirements are empty
  useEffect(() => {
    if ((initialRequirements.length === 0 || initialRequirements.every(r => !r)) && 
        (jobUrl || jobDescription) && 
        !hasExtracted && 
        !isLoading) {
      extractKeywords();
    }
  }, [jobUrl, jobDescription, initialRequirements, hasExtracted]);

  // Extract keywords from job URL or description
  const extractKeywords = async () => {
    if (!jobUrl && !jobDescription) {
      toast.error('No job URL or description available');
      return;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-job-keywords', {
        body: { 
          jobUrl, 
          description: jobDescription,
          jobId 
        }
      });
      
      if (error) throw error;
      
      if (data?.keywords && data.keywords.length > 0) {
        setExtractedKeywords(data.keywords);
        toast.success(`Extracted ${data.keywords.length} keywords`);
      } else {
        toast.warning('No keywords found in job description');
      }
      setHasExtracted(true);
    } catch (err) {
      console.error('Keyword extraction error:', err);
      toast.error('Failed to extract keywords');
    } finally {
      setIsLoading(false);
    }
  };

  // Analyze keywords - matched vs missing
  const keywordAnalysis = useMemo(() => {
    const userSkillsLower = userSkills.map(s => 
      typeof s === 'string' ? s.toLowerCase() : (s as any)?.name?.toLowerCase() || ''
    );
    
    const matched: string[] = [];
    const missing: string[] = [];
    
    requirements.forEach(req => {
      if (!req) return;
      const reqLower = req.toLowerCase();
      const isMatched = userSkillsLower.some(skill => 
        skill && (reqLower.includes(skill) || skill.includes(reqLower))
      );
      
      if (isMatched) {
        matched.push(req);
      } else {
        missing.push(req);
      }
    });
    
    return { matched, missing };
  }, [requirements, userSkills]);

  // Calculate breakdown scores
  const scoreBreakdown = useMemo(() => {
    const totalKeywords = requirements.length || 1;
    const matchedCount = keywordAnalysis.matched.length;
    
    return {
      keywordsScore: Math.round((matchedCount / totalKeywords) * 100),
      experienceScore: Math.min(100, matchScore + 10), // Simulated
      educationScore: Math.min(100, matchScore + 5),   // Simulated
      overallScore: matchScore
    };
  }, [matchScore, requirements.length, keywordAnalysis.matched.length]);

  // Get score color and status
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-primary';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return 'bg-success';
    if (score >= 70) return 'bg-primary';
    if (score >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  const getScoreStatus = (score: number) => {
    if (score >= 85) return { label: 'Excellent Match', icon: TrendingUp };
    if (score >= 70) return { label: 'Good Match', icon: Target };
    if (score >= 50) return { label: 'Fair Match', icon: AlertTriangle };
    return { label: 'Needs Work', icon: AlertTriangle };
  };

  const status = getScoreStatus(matchScore);
  const StatusIcon = status.icon;

  return (
    <Card className={cn('overflow-hidden transition-all duration-300', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            ATS Score Breakdown
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Main Score */}
        <div className="flex items-center gap-4 mb-4">
          <div className={cn(
            'flex items-center justify-center w-16 h-16 rounded-full border-4',
            matchScore >= 85 ? 'border-success bg-success/10' :
            matchScore >= 70 ? 'border-primary bg-primary/10' :
            matchScore >= 50 ? 'border-warning bg-warning/10' : 'border-destructive bg-destructive/10'
          )}>
            <span className={cn('text-2xl font-bold', getScoreColor(matchScore))}>
              {matchScore}
            </span>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusIcon className={cn('h-4 w-4', getScoreColor(matchScore))} />
              <span className={cn('text-sm font-medium', getScoreColor(matchScore))}>
                {status.label}
              </span>
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />
              ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 ml-auto"
                  onClick={extractKeywords}
                  title="Refresh keywords from job page"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Extracting keywords...' : `${keywordAnalysis.matched.length} of ${requirements.length} keywords matched`}
            </p>
          </div>
        </div>

        {/* Keywords Summary */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 border border-success/20">
            <Check className="h-4 w-4 text-success" />
            <div>
              <p className="text-xs font-medium text-success">{keywordAnalysis.matched.length} Matched</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20">
            <X className="h-4 w-4 text-destructive" />
            <div>
              <p className="text-xs font-medium text-destructive">{keywordAnalysis.missing.length} Missing</p>
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t animate-fade-in">
            {/* Score Breakdown Bars */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Keywords Match</span>
                  <span className={getScoreColor(scoreBreakdown.keywordsScore)}>
                    {scoreBreakdown.keywordsScore}%
                  </span>
                </div>
                <Progress 
                  value={scoreBreakdown.keywordsScore} 
                  className={cn('h-2', getScoreBg(scoreBreakdown.keywordsScore))}
                />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Experience Fit</span>
                  <span className={getScoreColor(scoreBreakdown.experienceScore)}>
                    {scoreBreakdown.experienceScore}%
                  </span>
                </div>
                <Progress 
                  value={scoreBreakdown.experienceScore} 
                  className="h-2"
                />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Education Match</span>
                  <span className={getScoreColor(scoreBreakdown.educationScore)}>
                    {scoreBreakdown.educationScore}%
                  </span>
                </div>
                <Progress 
                  value={scoreBreakdown.educationScore} 
                  className="h-2"
                />
              </div>
            </div>

            {/* Matched Keywords */}
            {keywordAnalysis.matched.length > 0 && (
              <div>
                <p className="text-xs font-medium text-success mb-2 flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Matched Keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {keywordAnalysis.matched.map((keyword, i) => (
                    <Badge 
                      key={i} 
                      variant="outline" 
                      className="text-xs bg-success/10 text-success border-success/30"
                    >
                      <Check className="h-2.5 w-2.5 mr-1" />
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Keywords */}
            {keywordAnalysis.missing.length > 0 && (
              <div>
                <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1">
                  <X className="h-3 w-3" />
                  Missing Keywords
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {keywordAnalysis.missing.map((keyword, i) => (
                    <Badge 
                      key={i} 
                      variant="outline" 
                      className="text-xs bg-destructive/10 text-destructive border-destructive/30"
                    >
                      <X className="h-2.5 w-2.5 mr-1" />
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {keywordAnalysis.missing.length > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs font-medium mb-1">💡 Recommendations</p>
                <p className="text-xs text-muted-foreground">
                  Add these missing keywords to your resume to improve your ATS score: 
                  <span className="text-foreground font-medium">
                    {' '}{keywordAnalysis.missing.slice(0, 3).join(', ')}
                    {keywordAnalysis.missing.length > 3 && ` and ${keywordAnalysis.missing.length - 3} more`}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
