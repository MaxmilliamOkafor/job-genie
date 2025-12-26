import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Building2, 
  MapPin, 
  Clock, 
  Filter, 
  X,
  Briefcase,
  Home,
  GraduationCap,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { Job } from '@/hooks/useJobs';

interface JobFiltersBarProps {
  jobs: Job[];
  onFiltersChange: (filteredJobs: Job[]) => void;
  onSearch?: (searchTerm: string) => Promise<void>;
  isSearching?: boolean;
}

type TimeFilter = '10min' | '30min' | '1h' | '2h' | '6h' | 'today' | 'week' | 'all';

const TIME_OPTIONS: { value: TimeFilter; label: string; ms: number }[] = [
  { value: '10min', label: '10 min', ms: 10 * 60 * 1000 },
  { value: '30min', label: '30 min', ms: 30 * 60 * 1000 },
  { value: '1h', label: '1 hour', ms: 60 * 60 * 1000 },
  { value: '2h', label: '2 hours', ms: 2 * 60 * 60 * 1000 },
  { value: '6h', label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { value: 'today', label: 'Today', ms: 24 * 60 * 60 * 1000 },
  { value: 'week', label: 'This Week', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: 'all', label: 'All Time', ms: Infinity },
];

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
const WORK_TYPES = ['Remote', 'Hybrid', 'On-site'];
const EXPERIENCE_LEVELS = ['Entry Level', 'Mid Level', 'Senior', 'Lead', 'Executive'];

const LOCATION_OPTIONS = [
  { value: 'all', label: 'All Locations' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  // Europe
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Dublin', label: 'Dublin' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'France', label: 'France' },
  { value: 'Switzerland', label: 'Switzerland' },
  { value: 'Sweden', label: 'Sweden' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Belgium', label: 'Belgium' },
  { value: 'Austria', label: 'Austria' },
  { value: 'Czech Republic', label: 'Czech Republic' },
  { value: 'Portugal', label: 'Portugal' },
  { value: 'Italy', label: 'Italy' },
  { value: 'Greece', label: 'Greece' },
  { value: 'Norway', label: 'Norway' },
  { value: 'Denmark', label: 'Denmark' },
  { value: 'Luxembourg', label: 'Luxembourg' },
  { value: 'Malta', label: 'Malta' },
  { value: 'Cyprus', label: 'Cyprus' },
  { value: 'Serbia', label: 'Serbia' },
  // Americas
  { value: 'United States', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Mexico', label: 'Mexico' },
  // Middle East
  { value: 'United Arab Emirates', label: 'United Arab Emirates' },
  { value: 'Dubai', label: 'Dubai' },
  { value: 'Qatar', label: 'Qatar' },
  { value: 'Turkey', label: 'Turkey' },
  // Africa
  { value: 'South Africa', label: 'South Africa' },
  { value: 'Morocco', label: 'Morocco' },
  { value: 'Tanzania', label: 'Tanzania' },
  // Asia Pacific
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Japan', label: 'Japan' },
  { value: 'Australia', label: 'Australia' },
  { value: 'New Zealand', label: 'New Zealand' },
  { value: 'Thailand', label: 'Thailand' },
];

export function JobFiltersBar({ jobs, onFiltersChange, onSearch, isSearching }: JobFiltersBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'applied'>('all');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedExperienceLevels, setSelectedExperienceLevels] = useState<string[]>([]);
  const [locationPopoverOpen, setLocationPopoverOpen] = useState(false);

  // Extract unique values
  const uniquePlatforms = useMemo(() => 
    [...new Set(jobs.map(j => j.platform).filter(Boolean))] as string[],
  [jobs]);


  // Calculate stats
  const jobStats = useMemo(() => {
    const now = Date.now();
    const applied = jobs.filter(j => j.status === 'applied').length;
    const pending = jobs.filter(j => j.status === 'pending').length;
    
    const platforms: Record<string, number> = {};
    jobs.forEach(j => {
      if (j.platform) platforms[j.platform] = (platforms[j.platform] || 0) + 1;
    });
    
    return { applied, pending, platforms };
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    const now = Date.now();
    const timeOption = TIME_OPTIONS.find(t => t.value === timeFilter);
    const maxAge = timeOption?.ms ?? Infinity;
    
    const filtered = jobs.filter(job => {
      // Time filter
      if (maxAge !== Infinity) {
        const jobTime = new Date(job.posted_date).getTime();
        if (now - jobTime > maxAge) return false;
      }
      
      // Quick filter (client-side text search)
      if (quickFilter) {
        const searchLower = quickFilter.toLowerCase();
        const matchesSearch = 
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower) ||
          job.location.toLowerCase().includes(searchLower) ||
          (job.description?.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Location filter (multi-select)
      if (selectedLocations.length > 0) {
        const locationLower = job.location.toLowerCase();
        const matchesAnyLocation = selectedLocations.some(loc => 
          locationLower.includes(loc.toLowerCase())
        );
        if (!matchesAnyLocation) return false;
      }
      
      // Platform filter
      if (platformFilter !== 'all' && job.platform !== platformFilter) return false;
      
      // Status filter
      if (statusFilter !== 'all' && job.status !== statusFilter) return false;
      
      // Job type filter (check in title or description)
      if (selectedJobTypes.length > 0) {
        const jobText = `${job.title} ${job.description || ''}`.toLowerCase();
        const hasJobType = selectedJobTypes.some(type => 
          jobText.includes(type.toLowerCase())
        );
        if (!hasJobType) return false;
      }
      
      // Work type filter
      if (selectedWorkTypes.length > 0) {
        const jobText = `${job.title} ${job.location} ${job.description || ''}`.toLowerCase();
        const hasWorkType = selectedWorkTypes.some(type => 
          jobText.includes(type.toLowerCase())
        );
        if (!hasWorkType) return false;
      }
      
      // Experience level filter
      if (selectedExperienceLevels.length > 0) {
        const jobText = `${job.title} ${job.description || ''}`.toLowerCase();
        const hasLevel = selectedExperienceLevels.some(level => {
          const levelLower = level.toLowerCase();
          return jobText.includes(levelLower) || 
            (levelLower === 'senior' && (jobText.includes('sr.') || jobText.includes('sr '))) ||
            (levelLower === 'entry level' && (jobText.includes('junior') || jobText.includes('jr.')));
        });
        if (!hasLevel) return false;
      }
      
      return true;
    }).sort((a, b) => b.match_score - a.match_score);
    
    onFiltersChange(filtered);
    return filtered;
  }, [jobs, timeFilter, quickFilter, selectedLocations, platformFilter, statusFilter, 
      selectedJobTypes, selectedWorkTypes, selectedExperienceLevels, onFiltersChange]);

  const activeFiltersCount = [
    quickFilter,
    selectedLocations.length > 0,
    platformFilter !== 'all',
    statusFilter !== 'all',
    selectedJobTypes.length > 0,
    selectedWorkTypes.length > 0,
    selectedExperienceLevels.length > 0,
  ].filter(Boolean).length;

  const handleApiSearch = async () => {
    if (searchTerm && onSearch) {
      await onSearch(searchTerm);
      setSearchTerm('');
    }
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setQuickFilter('');
    setTimeFilter('all');
    setPlatformFilter('all');
    setStatusFilter('all');
    setSelectedLocations([]);
    setSelectedJobTypes([]);
    setSelectedWorkTypes([]);
    setSelectedExperienceLevels([]);
  };

  const toggleLocation = (location: string) => {
    setSelectedLocations(prev => 
      prev.includes(location) 
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  const toggleArrayFilter = (array: string[], setArray: (arr: string[]) => void, value: string) => {
    if (array.includes(value)) {
      setArray(array.filter(v => v !== value));
    } else {
      setArray([...array, value]);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Main Filters Row */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* API Search Input - triggers new search */}
          <div className="relative flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search new jobs (triggers API search)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-8"
                onKeyDown={(e) => e.key === 'Enter' && handleApiSearch()}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button onClick={handleApiSearch} disabled={!searchTerm || isSearching}>
              {isSearching ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Search
            </Button>
          </div>
          
          {/* Location Multi-Select */}
          <Popover open={locationPopoverOpen} onOpenChange={setLocationPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full lg:w-[180px] justify-start gap-2">
                <MapPin className="h-4 w-4" />
                <span className="truncate">
                  {selectedLocations.length === 0 
                    ? 'All Locations' 
                    : selectedLocations.length === 1 
                      ? selectedLocations[0]
                      : `${selectedLocations.length} locations`}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 max-h-80 overflow-y-auto" align="start">
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-2 border-b">
                  <span className="text-sm font-medium">Select Locations</span>
                  {selectedLocations.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => setSelectedLocations([])}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {LOCATION_OPTIONS.filter(loc => loc.value !== 'all').map(loc => (
                  <div 
                    key={loc.value} 
                    className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted rounded px-2"
                    onClick={() => toggleLocation(loc.value)}
                  >
                    <Checkbox 
                      checked={selectedLocations.includes(loc.value)}
                      onCheckedChange={() => toggleLocation(loc.value)}
                    />
                    <span className="text-sm">{loc.label}</span>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Platform */}
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-full lg:w-[160px]">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {uniquePlatforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform} ({jobStats.platforms[platform] || 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Status */}
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'pending' | 'applied')}>
            <SelectTrigger className="w-full lg:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending ({jobStats.pending})</SelectItem>
              <SelectItem value="applied">Applied ({jobStats.applied})</SelectItem>
            </SelectContent>
          </Select>

          {/* Additional Filters Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full lg:w-auto gap-2">
                <Filter className="h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Additional Filters
                </h4>
                
                {/* Job Type */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-3.5 w-3.5" />
                    Job Type
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPES.map(type => (
                      <Badge 
                        key={type} 
                        variant={selectedJobTypes.includes(type) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter(selectedJobTypes, setSelectedJobTypes, type)}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* Work Type */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Home className="h-3.5 w-3.5" />
                    Work Type
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {WORK_TYPES.map(type => (
                      <Badge 
                        key={type} 
                        variant={selectedWorkTypes.includes(type) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter(selectedWorkTypes, setSelectedWorkTypes, type)}
                      >
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* Experience Level */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <GraduationCap className="h-3.5 w-3.5" />
                    Experience Level
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {EXPERIENCE_LEVELS.map(level => (
                      <Badge 
                        key={level} 
                        variant={selectedExperienceLevels.includes(level) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleArrayFilter(selectedExperienceLevels, setSelectedExperienceLevels, level)}
                      >
                        {level}
                      </Badge>
                    ))}
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters} className="w-full">
                    <X className="h-4 w-4 mr-2" />
                    Clear All Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Time Filter Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          {TIME_OPTIONS.map(opt => (
            <Badge 
              key={opt.value}
              variant={timeFilter === opt.value ? 'default' : 'outline'} 
              className="cursor-pointer transition-colors"
              onClick={() => setTimeFilter(opt.value)}
            >
              {opt.label}
            </Badge>
          ))}
        </div>
        
        {/* Active Filters Display */}
        {(selectedLocations.length > 0 || selectedJobTypes.length > 0 || selectedWorkTypes.length > 0 || selectedExperienceLevels.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Active:</span>
            {selectedLocations.map(loc => (
              <Badge key={loc} variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {loc}
                <button onClick={() => toggleLocation(loc)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedJobTypes.map(type => (
              <Badge key={type} variant="secondary" className="gap-1">
                {type}
                <button onClick={() => toggleArrayFilter(selectedJobTypes, setSelectedJobTypes, type)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedWorkTypes.map(type => (
              <Badge key={type} variant="secondary" className="gap-1">
                {type}
                <button onClick={() => toggleArrayFilter(selectedWorkTypes, setSelectedWorkTypes, type)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {selectedExperienceLevels.map(level => (
              <Badge key={level} variant="secondary" className="gap-1">
                {level}
                <button onClick={() => toggleArrayFilter(selectedExperienceLevels, setSelectedExperienceLevels, level)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredJobs.length.toLocaleString()}</span> of {jobs.length.toLocaleString()} jobs
        </div>
      </CardContent>
    </Card>
  );
}
