import { cn } from '@/lib/utils';
import { Job } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  MapPin, 
  Clock, 
  DollarSign, 
  ExternalLink,
  Zap,
  CheckCircle2,
  MessageCircle,
  Gift,
  XCircle,
  Hourglass
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface JobCardProps {
  job: Job;
  onApply?: (job: Job) => void;
  onViewDetails?: (job: Job) => void;
}

const statusConfig = {
  new: { label: 'New', icon: Zap, className: 'bg-primary/10 text-primary border-primary/20' },
  pending: { label: 'Pending', icon: Hourglass, className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  applied: { label: 'Applied', icon: CheckCircle2, className: 'status-applied' },
  interviewing: { label: 'Interviewing', icon: MessageCircle, className: 'status-interviewing' },
  offered: { label: 'Offered', icon: Gift, className: 'status-offered' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'status-rejected' },
};

// Extract salary from description if not provided
function extractSalary(salary: string | null | undefined, description: string | null | undefined): string {
  if (salary && salary.trim()) return salary;
  
  if (!description) return 'Not specified';
  
  // Common salary patterns
  const patterns = [
    // $100,000 - $150,000 or $100k - $150k
    /\$[\d,]+(?:k|K)?\s*[-–—to]+\s*\$?[\d,]+(?:k|K)?(?:\s*(?:per\s+)?(?:year|yr|annum|annually|pa))?/gi,
    // $100,000/year or $100k/yr
    /\$[\d,]+(?:k|K)?(?:\s*\/\s*(?:year|yr|annum|annually|hour|hr))?/gi,
    // 100,000 - 150,000 USD/EUR/GBP
    /[\d,]+\s*[-–—to]+\s*[\d,]+\s*(?:USD|EUR|GBP|CAD|AUD)/gi,
    // £50,000 - £70,000
    /[£€][\d,]+(?:k|K)?\s*[-–—to]+\s*[£€]?[\d,]+(?:k|K)?/gi,
    // Salary: $X or Compensation: $X
    /(?:salary|compensation|pay|wage)[:\s]+\$?[\d,]+(?:k|K)?/gi,
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return 'Not specified';
}

// Format relative time with short labels
function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Recently';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    
    return formatDistanceToNow(date, { addSuffix: true })
      .replace('about ', '')
      .replace('less than a minute ago', 'just now')
      .replace(' minutes', 'm')
      .replace(' minute', 'm')
      .replace(' hours', 'h')
      .replace(' hour', 'h')
      .replace(' days', 'd')
      .replace(' day', 'd');
  } catch {
    return 'Recently';
  }
}

export function JobCard({ job, onApply, onViewDetails }: JobCardProps) {
  const status = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  
  // Use posted_date or postedDate (handle both naming conventions)
  const dateField = (job as any).posted_date || (job as any).postedDate || (job as any).created_at;
  const postedTime = formatRelativeTime(dateField);
  
  // Extract salary from description if not in dedicated field
  const displaySalary = extractSalary(job.salary, (job as any).description || job.description);

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:border-primary/30 animate-fade-in">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
                  {job.title}
                </h3>
                <p className="text-muted-foreground font-medium mt-0.5">{job.company}</p>
              </div>
              <Badge variant="outline" className={cn('shrink-0 ml-2', status.className)}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {status.label}
              </Badge>
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {job.location}
              </span>
              <span className="flex items-center gap-1" title={displaySalary}>
                <DollarSign className="h-4 w-4" />
                <span className="max-w-[150px] truncate">{displaySalary}</span>
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {postedTime}
              </span>
            </div>

            {/* Match Score */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    job.matchScore >= 90 ? 'bg-success' :
                    job.matchScore >= 80 ? 'bg-primary' :
                    job.matchScore >= 70 ? 'bg-warning' : 'bg-muted-foreground'
                  )}
                  style={{ width: `${job.matchScore}%` }}
                />
              </div>
              <span className={cn(
                'text-sm font-semibold',
                job.matchScore >= 90 ? 'text-success' :
                job.matchScore >= 80 ? 'text-primary' :
                job.matchScore >= 70 ? 'text-warning' : 'text-muted-foreground'
              )}>
                {job.matchScore}% Match
              </span>
            </div>

            {/* Requirements */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {job.requirements.slice(0, 4).map((req, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {req}
                </Badge>
              ))}
              {job.requirements.length > 4 && (
                <Badge variant="secondary" className="text-xs">
                  +{job.requirements.length - 4} more
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {job.status === 'new' && onApply && (
                <Button 
                  size="sm" 
                  className="gap-1.5"
                  onClick={() => onApply(job)}
                >
                  <Zap className="h-4 w-4" />
                  Auto Apply
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                className="gap-1.5"
                onClick={() => onViewDetails?.(job)}
              >
                View Details
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 ml-auto"
                onClick={() => window.open(job.url, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
