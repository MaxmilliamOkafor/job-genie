import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, Search, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrapeProgressProps {
  isSearching: boolean;
  currentPhase: 'idle' | 'searching' | 'processing' | 'saving' | 'complete';
  jobsFound: number;
  jobsSaved: number;
  platformsSearched: number;
  totalPlatforms: number;
  elapsedTime: number;
}

export function ScrapeProgress({
  isSearching,
  currentPhase,
  jobsFound,
  jobsSaved,
  platformsSearched,
  totalPlatforms,
  elapsedTime,
}: ScrapeProgressProps) {
  if (!isSearching && currentPhase === 'idle') return null;

  const progressPercent = totalPlatforms > 0 
    ? Math.round((platformsSearched / totalPlatforms) * 100) 
    : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getPhaseLabel = () => {
    switch (currentPhase) {
      case 'searching': return 'Searching ATS platforms...';
      case 'processing': return 'Processing results...';
      case 'saving': return 'Saving to database...';
      case 'complete': return 'Search complete!';
      default: return 'Preparing...';
    }
  };

  const getPhaseIcon = () => {
    switch (currentPhase) {
      case 'searching': return <Search className="h-4 w-4 animate-pulse" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'saving': return <Database className="h-4 w-4 animate-pulse" />;
      case 'complete': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default: return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <Card className={cn(
      "border-primary/20 overflow-hidden transition-all duration-300",
      currentPhase === 'complete' && "border-green-500/30 bg-green-500/5"
    )}>
      <CardContent className="p-4 space-y-3">
        {/* Header with phase info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getPhaseIcon()}
            <span className="text-sm font-medium">{getPhaseLabel()}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatTime(elapsedTime)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{platformsSearched} / {totalPlatforms} platforms</span>
            <span>{progressPercent}%</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{jobsFound}</div>
            <div className="text-xs text-muted-foreground">Jobs Found</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-500">{jobsSaved}</div>
            <div className="text-xs text-muted-foreground">New Jobs Saved</div>
          </div>
        </div>

        {/* Live indicator */}
        {isSearching && currentPhase !== 'complete' && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs text-muted-foreground">Live scraping in progress</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
