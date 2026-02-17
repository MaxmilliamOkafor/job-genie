import { memo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Job } from '@/hooks/useJobs';
import {
  MapPin,
  Clock,
  ExternalLink,
  Zap,
  CheckCircle,
  Star,
  AlertTriangle,
  Flag,
  Briefcase,
  Building2,
  Globe,
} from 'lucide-react';

// Tier-1 companies
const TIER1_COMPANIES = [
  'google', 'meta', 'apple', 'amazon', 'microsoft', 'netflix', 'stripe', 'airbnb',
  'uber', 'dropbox', 'salesforce', 'adobe', 'linkedin', 'shopify', 'coinbase',
  'figma', 'notion', 'slack', 'zoom', 'datadog', 'snowflake', 'databricks',
  'mongodb', 'openai', 'anthropic', 'revolut', 'canva', 'vercel', 'spotify',
];

const isTier1 = (company: string) => {
  const n = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TIER1_COMPANIES.some(t => n.includes(t) || t.includes(n));
};

const getTimeAgo = (date: string) => {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 0 || mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
};

// Clean company name
function cleanCompany(company: string, url?: string | null): string {
  let cleaned = company.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const generic = ['apply', 'careers', 'jobs', 'hire', 'unknown'];
  const first = cleaned.split('.')[0].toLowerCase();
  if (generic.includes(first)) {
    if (url) {
      const patterns = [
        /([^\.]+)\.wd\d+\.myworkdayjobs\.com/i,
        /boards\.greenhouse\.io\/([^\/]+)/i,
        /([^\.]+)\.workable\.com/i,
        /jobs\.smartrecruiters\.com\/([^\/]+)/i,
        /([^\.]+)\.teamtailor\.com/i,
      ];
      for (const p of patterns) {
        const m = url.match(p);
        if (m?.[1] && !generic.includes(m[1].toLowerCase())) {
          return m[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
      }
    }
    return 'Unknown Company';
  }
  return cleaned.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Unknown Company';
}

// Logo URL from company domain
function getLogoUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const patterns: [RegExp, number][] = [
      [/([^\.]+)\.wd\d+\.myworkdayjobs\.com/i, 1],
      [/boards\.greenhouse\.io\/([^\/]+)/i, 1],
      [/([^\.]+)\.workable\.com/i, 1],
      [/jobs\.smartrecruiters\.com\/([^\/]+)/i, 1],
    ];
    for (const [p, g] of patterns) {
      const m = url.match(p);
      if (m?.[g]) return `https://logo.clearbit.com/${m[g].toLowerCase()}.com`;
    }
    const host = new URL(url).hostname;
    if (!host.includes('greenhouse') && !host.includes('workday') && !host.includes('icims')) {
      return `https://logo.clearbit.com/${host}`;
    }
  } catch {}
  return null;
}

// Workplace type badge colour
function getWorkplaceColor(type?: string) {
  switch (type) {
    case 'Remote': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
    case 'Hybrid': return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
    case 'Onsite': return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

interface ExtendedJob extends Job {
  url_status?: string;
  report_count?: number;
  category?: string;
  employment_type?: string;
  workplace_type?: string;
  skills?: string[];
  experience_min_years?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  requirements_summary?: string;
  source_name?: string;
  ai_extracted?: boolean;
  created_at?: string;
}

interface HiringCafeJobCardProps {
  job: ExtendedJob;
  isSelected: boolean;
  onSelect: (jobId: string, selected: boolean) => void;
  onApply: (jobId: string) => void;
  selectionMode: boolean;
  onReportBrokenLink: (job: Job) => void;
}

export const HiringCafeJobCard = memo(({ job, isSelected, onSelect, onApply, selectionMode, onReportBrokenLink }: HiringCafeJobCardProps) => {
  const [logoError, setLogoError] = useState(false);
  const tier1 = isTier1(job.company);
  const isNew = Date.now() - new Date(job.posted_date || job.created_at || '').getTime() < 2 * 60 * 60 * 1000;
  const isPending = job.status === 'pending';
  const isBroken = job.url_status === 'broken' || (job.report_count && job.report_count >= 3);
  
  const displayCompany = cleanCompany(job.company, job.url);
  const logoUrl = !logoError ? getLogoUrl(job.url) : null;
  const initials = displayCompany.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  const timeAgo = getTimeAgo(job.created_at || job.posted_date);

  // Format salary
  const salaryDisplay = (() => {
    if (job.salary_min || job.salary_max) {
      const currency = job.salary_currency || 'USD';
      const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
      const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
      if (job.salary_min && job.salary_max) return `${sym}${fmt(job.salary_min)}-${sym}${fmt(job.salary_max)}`;
      if (job.salary_min) return `${sym}${fmt(job.salary_min)}+`;
      if (job.salary_max) return `Up to ${sym}${fmt(job.salary_max)}`;
    }
    if (job.salary) return job.salary;
    return null;
  })();

  return (
    <Card 
      className={`group overflow-hidden transition-all duration-200 hover:shadow-lg cursor-pointer ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
          : isBroken
            ? 'border-destructive/30 opacity-60'
            : tier1
              ? 'border-primary/30 hover:border-primary/50'
              : 'hover:border-primary/30'
      }`}
      onClick={() => selectionMode && isPending && onSelect(job.id, !isSelected)}
    >
      <CardContent className="p-4">
        {/* Top row: Title + Time */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {selectionMode && isPending && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(c) => onSelect(job.id, !!c)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 flex-shrink-0"
              />
            )}
            <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2">
              {job.title}
              {tier1 && <Star className="inline h-3.5 w-3.5 text-primary fill-primary ml-1.5 -mt-0.5" />}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            {isNew && <Badge className="bg-green-500 text-white text-[10px] px-1 py-0 h-4">NEW</Badge>}
          </div>
        </div>

        {/* Company + Location row */}
        <div className="flex items-center gap-2 mb-3">
          <div className="shrink-0 w-7 h-7 rounded-md bg-muted flex items-center justify-center overflow-hidden border border-border/50">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-full h-full object-contain p-0.5" onError={() => setLogoError(true)} />
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground">{initials}</span>
            )}
          </div>
          <span className="text-sm text-muted-foreground font-medium truncate">{displayCompany}</span>
          {job.location && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {job.location}
              </span>
            </>
          )}
        </div>

        {/* Tags row: Workplace, Employment, Category, Salary */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {job.workplace_type && (
            <Badge variant="outline" className={`text-[11px] px-2 py-0 h-5 font-medium ${getWorkplaceColor(job.workplace_type)}`}>
              {job.workplace_type}
            </Badge>
          )}
          {job.employment_type && job.employment_type !== 'Full Time' && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium">
              {job.employment_type}
            </Badge>
          )}
          {job.employment_type === 'Full Time' && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium">
              Full Time
            </Badge>
          )}
          {salaryDisplay && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
              {salaryDisplay}
            </Badge>
          )}
          {job.experience_min_years != null && job.experience_min_years > 0 && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30">
              {job.experience_min_years}+ YOE
            </Badge>
          )}
          {job.source_name && (
            <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium text-muted-foreground">
              {job.source_name}
            </Badge>
          )}
        </div>

        {/* Requirements summary */}
        {job.requirements_summary && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
            {job.requirements_summary}
          </p>
        )}

        {/* Skills row */}
        {job.skills && job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {job.skills.slice(0, 6).map((skill, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {skill}
              </Badge>
            ))}
            {job.skills.length > 6 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                +{job.skills.length - 6}
              </Badge>
            )}
          </div>
        )}

        {/* Fallback: show requirements if no AI skills */}
        {(!job.skills || job.skills.length === 0) && job.requirements && job.requirements.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {job.requirements.slice(0, 5).map((req, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                {req}
              </Badge>
            ))}
            {job.requirements.length > 5 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                +{job.requirements.length - 5}
              </Badge>
            )}
          </div>
        )}

        {/* Broken link warning */}
        {isBroken && (
          <div className="flex items-center gap-1.5 mb-3 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" />
            Link may be broken
          </div>
        )}

        {/* Footer: Actions + Match */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            {job.url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); window.open(job.url!, '_blank'); }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Job Posting
              </Button>
            )}
            {job.url && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-1.5 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); onReportBrokenLink(job); }}
              >
                <Flag className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {job.match_score > 0 && (
              <span className={`text-xs font-semibold ${
                job.match_score >= 80 ? 'text-green-600 dark:text-green-400' : 
                job.match_score >= 60 ? 'text-primary' : 'text-muted-foreground'
              }`}>
                {job.match_score}%
              </span>
            )}
            {!selectionMode && isPending && (
              <Button size="sm" className="h-7 text-xs px-3" onClick={(e) => { e.stopPropagation(); onApply(job.id); }}>
                <Zap className="h-3 w-3 mr-1" />
                Apply
              </Button>
            )}
            {job.status === 'applied' && (
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-[10px] h-5">
                <CheckCircle className="h-3 w-3 mr-1" />
                Applied
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

HiringCafeJobCard.displayName = 'HiringCafeJobCard';
