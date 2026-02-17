import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Briefcase, MapPin, Clock, Home, DollarSign, GraduationCap, 
  Building2, Globe, X, ChevronDown, Layers
} from 'lucide-react';
import { Job } from '@/hooks/useJobs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface ExtendedJob extends Job {
  category?: string;
  employment_type?: string;
  workplace_type?: string;
  skills?: string[];
  experience_min_years?: number;
  salary_min?: number;
  salary_max?: number;
  ai_extracted?: boolean;
  created_at?: string;
}

interface HiringCafeFiltersProps {
  jobs: ExtendedJob[];
  onFiltersChange: (filtered: ExtendedJob[]) => void;
  onLocationChange?: (locations: string[]) => Promise<void>;
  totalCount: number;
}

const CATEGORIES = [
  'Software Development', 'Engineering', 'Information Technology',
  'Product Management', 'Data and Analytics', 'Design',
  'Sales', 'Marketing', 'Business Operations',
  'Finance and Accounting', 'Human Resources', 'Other',
];

const EMPLOYMENT_TYPES = ['Full Time', 'Part Time', 'Contract', 'Internship', 'Temporary'];
const WORKPLACE_TYPES = ['Remote', 'Hybrid', 'Onsite'];

const TIME_FILTERS = [
  { value: 'all', label: 'All Time', ms: Infinity },
  { value: '1h', label: 'Past hour', ms: 3600000 },
  { value: '24h', label: 'Past 24 hours', ms: 86400000 },
  { value: '3d', label: 'Past 3 days', ms: 259200000 },
  { value: '1w', label: 'Past week', ms: 604800000 },
];

const EXPERIENCE_FILTERS = [
  { value: 'all', label: 'Any experience' },
  { value: '0', label: 'Entry level (0 YOE)' },
  { value: '2', label: '2+ years' },
  { value: '5', label: '5+ years' },
  { value: '8', label: '8+ years' },
  { value: '10', label: '10+ years' },
];

const SALARY_FILTERS = [
  { value: 'all', label: 'Any salary' },
  { value: '50', label: '$50k+' },
  { value: '80', label: '$80k+' },
  { value: '100', label: '$100k+' },
  { value: '150', label: '$150k+' },
  { value: '200', label: '$200k+' },
];

interface FilterChipProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}

function FilterChip({ label, icon, active, count, children }: FilterChipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`h-8 text-xs gap-1.5 rounded-full ${
            active ? 'bg-primary/10 border-primary/40 text-primary' : ''
          }`}
        >
          {icon}
          {label}
          {count != null && count > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function HiringCafeFilters({ jobs, onFiltersChange, onLocationChange, totalCount }: HiringCafeFiltersProps) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedEmployment, setSelectedEmployment] = useState<string[]>([]);
  const [selectedWorkplace, setSelectedWorkplace] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState('all');
  const [selectedExperience, setSelectedExperience] = useState('all');
  const [selectedSalary, setSelectedSalary] = useState('all');
  const [quickSearch, setQuickSearch] = useState('');

  // Compute counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach(j => { if (j.category) counts[j.category] = (counts[j.category] || 0) + 1; });
    return counts;
  }, [jobs]);

  const workplaceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach(j => { if (j.workplace_type) counts[j.workplace_type] = (counts[j.workplace_type] || 0) + 1; });
    return counts;
  }, [jobs]);

  // Unique companies count
  const companyCount = useMemo(() => new Set(jobs.map(j => j.company.toLowerCase())).size, [jobs]);

  // Apply filters
  const filteredJobs = useMemo(() => {
    const now = Date.now();
    const timeMs = TIME_FILTERS.find(t => t.value === selectedTime)?.ms ?? Infinity;
    
    const filtered = jobs.filter(j => {
      // Time
      if (timeMs !== Infinity) {
        const jobTime = new Date((j as any).created_at || j.posted_date).getTime();
        if (now - jobTime > timeMs) return false;
      }
      // Category
      if (selectedCategories.length > 0 && (!j.category || !selectedCategories.includes(j.category))) return false;
      // Employment
      if (selectedEmployment.length > 0 && (!j.employment_type || !selectedEmployment.includes(j.employment_type))) return false;
      // Workplace
      if (selectedWorkplace.length > 0 && (!j.workplace_type || !selectedWorkplace.includes(j.workplace_type))) return false;
      // Experience
      if (selectedExperience !== 'all') {
        const minYoe = parseInt(selectedExperience);
        if (j.experience_min_years == null || j.experience_min_years < minYoe) {
          // For entry level, include nulls and 0
          if (minYoe === 0 && (j.experience_min_years == null || j.experience_min_years === 0)) return true;
          if (minYoe > 0) return false;
        }
      }
      // Salary
      if (selectedSalary !== 'all') {
        const minSalary = parseInt(selectedSalary) * 1000;
        if (!j.salary_min || j.salary_min < minSalary) return false;
      }
      // Quick search
      if (quickSearch) {
        const q = quickSearch.toLowerCase();
        if (!j.title.toLowerCase().includes(q) && !j.company.toLowerCase().includes(q) && !j.location.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    
    onFiltersChange(filtered as any);
    return filtered;
  }, [jobs, selectedTime, selectedCategories, selectedEmployment, selectedWorkplace, selectedExperience, selectedSalary, quickSearch, onFiltersChange]);

  const activeCount = [
    selectedCategories.length > 0,
    selectedEmployment.length > 0,
    selectedWorkplace.length > 0,
    selectedTime !== 'all',
    selectedExperience !== 'all',
    selectedSalary !== 'all',
    quickSearch.length > 0,
  ].filter(Boolean).length;

  const clearAll = () => {
    setSelectedCategories([]);
    setSelectedEmployment([]);
    setSelectedWorkplace([]);
    setSelectedTime('all');
    setSelectedExperience('all');
    setSelectedSalary('all');
    setQuickSearch('');
  };

  const toggleInArray = (arr: string[], item: string) => 
    arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];

  return (
    <div className="space-y-3">
      {/* Filter chips row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Department/Category */}
        <FilterChip
          label="Departments"
          icon={<Layers className="h-3.5 w-3.5" />}
          active={selectedCategories.length > 0}
          count={selectedCategories.length}
        >
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {CATEGORIES.filter(c => (categoryCounts[c] || 0) > 0).map(cat => (
              <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                <Checkbox
                  checked={selectedCategories.includes(cat)}
                  onCheckedChange={() => setSelectedCategories(prev => toggleInArray(prev, cat))}
                />
                <span className="flex-1 truncate">{cat}</span>
                <span className="text-xs text-muted-foreground">{categoryCounts[cat] || 0}</span>
              </label>
            ))}
          </div>
        </FilterChip>

        {/* Commitment */}
        <FilterChip
          label="Commitment"
          icon={<Briefcase className="h-3.5 w-3.5" />}
          active={selectedEmployment.length > 0}
          count={selectedEmployment.length}
        >
          <div className="space-y-2">
            {EMPLOYMENT_TYPES.map(type => (
              <label key={type} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                <Checkbox
                  checked={selectedEmployment.includes(type)}
                  onCheckedChange={() => setSelectedEmployment(prev => toggleInArray(prev, type))}
                />
                {type}
              </label>
            ))}
          </div>
        </FilterChip>

        {/* Workplace Type */}
        <FilterChip
          label="Workplace"
          icon={<Home className="h-3.5 w-3.5" />}
          active={selectedWorkplace.length > 0}
          count={selectedWorkplace.length}
        >
          <div className="space-y-2">
            {WORKPLACE_TYPES.map(type => (
              <label key={type} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-1 py-0.5 rounded">
                <Checkbox
                  checked={selectedWorkplace.includes(type)}
                  onCheckedChange={() => setSelectedWorkplace(prev => toggleInArray(prev, type))}
                />
                <span className="flex-1">{type}</span>
                <span className="text-xs text-muted-foreground">{workplaceCounts[type] || 0}</span>
              </label>
            ))}
          </div>
        </FilterChip>

        {/* Experience */}
        <FilterChip
          label="Experience"
          icon={<GraduationCap className="h-3.5 w-3.5" />}
          active={selectedExperience !== 'all'}
        >
          <div className="space-y-1">
            {EXPERIENCE_FILTERS.map(opt => (
              <button
                key={opt.value}
                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 ${
                  selectedExperience === opt.value ? 'bg-primary/10 text-primary font-medium' : ''
                }`}
                onClick={() => setSelectedExperience(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Salary */}
        <FilterChip
          label="Salary"
          icon={<DollarSign className="h-3.5 w-3.5" />}
          active={selectedSalary !== 'all'}
        >
          <div className="space-y-1">
            {SALARY_FILTERS.map(opt => (
              <button
                key={opt.value}
                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 ${
                  selectedSalary === opt.value ? 'bg-primary/10 text-primary font-medium' : ''
                }`}
                onClick={() => setSelectedSalary(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Time filter */}
        <FilterChip
          label={TIME_FILTERS.find(t => t.value === selectedTime)?.label || 'All Time'}
          icon={<Clock className="h-3.5 w-3.5" />}
          active={selectedTime !== 'all'}
        >
          <div className="space-y-1">
            {TIME_FILTERS.map(opt => (
              <button
                key={opt.value}
                className={`w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 ${
                  selectedTime === opt.value ? 'bg-primary/10 text-primary font-medium' : ''
                }`}
                onClick={() => setSelectedTime(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterChip>

        {/* Clear filters */}
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearAll}>
            <X className="h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{filteredJobs.length} jobs</span>
        <span>·</span>
        <span>{companyCount} companies</span>
        {activeCount > 0 && (
          <>
            <span>·</span>
            <span className="text-primary">{activeCount} filter{activeCount > 1 ? 's' : ''} active</span>
          </>
        )}
      </div>
    </div>
  );
}
