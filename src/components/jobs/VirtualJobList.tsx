import { useRef, useCallback, memo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Job } from '@/hooks/useJobs';
import { 
  MapPin, 
  DollarSign, 
  Clock, 
  ExternalLink, 
  Zap,
  CheckCircle,
  Star,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';

// Tier-1 companies for visual highlighting
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'lyft', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'twitter', 'snap',
  'shopify', 'square', 'paypal', 'coinbase', 'robinhood', 'plaid', 'figma', 'notion',
  'slack', 'zoom', 'datadog', 'snowflake', 'databricks', 'mongodb', 'openai', 'anthropic',
  'revolut', 'stripe', 'canva', 'linear', 'vercel', 'mercury', 'deel',
];

const isTier1Company = (company: string): boolean => {
  const normalized = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TIER1_COMPANIES.some(t1 => normalized.includes(t1) || t1.includes(normalized));
};

const getTimeAgo = (date: string) => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

const getMatchScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-500 bg-green-500/10 border-green-500/30';
  if (score >= 65) return 'text-primary bg-primary/10 border-primary/30';
  return 'text-muted-foreground bg-muted border-border';
};

interface JobCardProps {
  job: Job;
  isSelected: boolean;
  onSelect: (jobId: string, selected: boolean) => void;
  onApply: (jobId: string) => void;
  selectionMode: boolean;
}

const JobCard = memo(({ job, isSelected, onSelect, onApply, selectionMode }: JobCardProps) => {
  const isTier1 = isTier1Company(job.company);
  const isNew = Date.now() - new Date(job.posted_date).getTime() < 2 * 60 * 60 * 1000;
  const isPending = job.status === 'pending';

  return (
    <Card 
      className={`overflow-hidden transition-all hover:shadow-lg cursor-pointer ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
          : job.status === 'applied' 
            ? 'border-green-500/40 bg-green-500/5' 
            : isTier1 
              ? 'border-primary/40 bg-gradient-to-r from-primary/5 to-transparent' 
              : 'hover:border-primary/30'
      }`}
      onClick={() => selectionMode && isPending && onSelect(job.id, !isSelected)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Selection checkbox */}
            {selectionMode && isPending && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelect(job.id, !!checked)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-lg truncate">{job.title}</h3>
                {isNew && (
                  <Badge className="bg-green-500 text-white text-[10px] px-1.5 py-0">NEW</Badge>
                )}
                {job.status === 'applied' && (
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
                {isTier1 && (
                  <Star className="h-4 w-4 text-primary fill-primary flex-shrink-0" />
                )}
              </div>
              <p className="text-muted-foreground">{job.company}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {job.match_score > 0 && (
              <Badge className={`text-xs ${getMatchScoreColor(job.match_score)}`}>
                {job.match_score}% match
              </Badge>
            )}
            {job.platform && (
              <Badge variant="outline" className="text-xs">
                {job.platform}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {job.location}
          </span>
          {job.salary && (
            <span className="flex items-center gap-1 text-green-600">
              <DollarSign className="h-3.5 w-3.5" />
              {job.salary}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {getTimeAgo(job.posted_date)}
          </span>
        </div>

        {job.requirements && job.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {job.requirements.slice(0, 6).map((req, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {req}
              </Badge>
            ))}
            {job.requirements.length > 6 && (
              <Badge variant="outline" className="text-xs">
                +{job.requirements.length - 6}
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {!selectionMode && isPending ? (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onApply(job.id); }}>
              <Zap className="h-4 w-4 mr-1" />
              Quick Apply
            </Button>
          ) : !isPending ? (
            <Button size="sm" variant="secondary" disabled>
              <CheckCircle className="h-4 w-4 mr-1" />
              Applied
            </Button>
          ) : null}
          {job.url && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={(e) => { e.stopPropagation(); window.open(job.url!, '_blank'); }}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View Job
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

JobCard.displayName = 'JobCard';

interface VirtualJobListProps {
  jobs: Job[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onApply: (jobId: string) => void;
  selectedJobs: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  selectionMode: boolean;
}

export function VirtualJobList({ 
  jobs, 
  hasMore, 
  isLoading, 
  onLoadMore, 
  onApply,
  selectedJobs,
  onSelectionChange,
  selectionMode,
}: VirtualJobListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated row height
    overscan: 5, // Render 5 extra items above/below viewport
  });

  // Handle scroll to load more
  const handleScroll = useCallback(() => {
    if (!parentRef.current || isLoading || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const scrollThreshold = scrollHeight - clientHeight - 500;

    if (scrollTop >= scrollThreshold) {
      onLoadMore();
    }
  }, [isLoading, hasMore, onLoadMore]);

  const handleSelect = useCallback((jobId: string, selected: boolean) => {
    const newSelection = new Set(selectedJobs);
    if (selected) {
      newSelection.add(jobId);
    } else {
      newSelection.delete(jobId);
    }
    onSelectionChange(newSelection);
  }, [selectedJobs, onSelectionChange]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="h-[calc(100vh-400px)] min-h-[400px] overflow-auto"
      onScroll={handleScroll}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const job = jobs[virtualItem.index];
          return (
            <div
              key={job.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
            >
              <div className="pb-3">
                <JobCard 
                  job={job} 
                  isSelected={selectedJobs.has(job.id)}
                  onSelect={handleSelect}
                  onApply={onApply}
                  selectionMode={selectionMode}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {/* Load more button as fallback */}
      {hasMore && !isLoading && jobs.length > 0 && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={onLoadMore}>
            Load More Jobs
          </Button>
        </div>
      )}
    </div>
  );
}