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
  GraduationCap
} from 'lucide-react';
import { Job } from '@/hooks/useJobs';

interface JobFiltersBarProps {
  jobs: Job[];
  onFiltersChange: (filteredJobs: Job[]) => void;
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

export function JobFiltersBar({ jobs, onFiltersChange }: JobFiltersBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'applied'>('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [selectedWorkTypes, setSelectedWorkTypes] = useState<string[]>([]);
  const [selectedExperienceLevels, setSelectedExperienceLevels] = useState<string[]>([]);

  // Extract unique values
  const uniquePlatforms = useMemo(() => 
    [...new Set(jobs.map(j => j.platform).filter(Boolean))] as string[],
  [jobs]);

  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    jobs.forEach(job => {
      // Extract city/country from location
      const parts = job.location.split(',').map(p => p.trim());
      parts.forEach(part => {
        if (part && part.length > 2) locations.add(part);
      });
    });
    return [...locations].sort().slice(0, 50); // Limit to 50 unique locations
  }, [jobs]);

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
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          job.title.toLowerCase().includes(searchLower) ||
          job.company.toLowerCase().includes(searchLower) ||
          job.location.toLowerCase().includes(searchLower) ||
          (job.description?.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }
      
      // Location filter
      if (locationFilter) {
        const locationLower = locationFilter.toLowerCase();
        if (!job.location.toLowerCase().includes(locationLower)) return false;
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
  }, [jobs, timeFilter, searchTerm, locationFilter, platformFilter, statusFilter, 
      selectedJobTypes, selectedWorkTypes, selectedExperienceLevels, onFiltersChange]);

  const activeFiltersCount = [
    searchTerm,
    locationFilter,
    platformFilter !== 'all',
    statusFilter !== 'all',
    selectedJobTypes.length > 0,
    selectedWorkTypes.length > 0,
    selectedExperienceLevels.length > 0,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchTerm('');
    setTimeFilter('all');
    setPlatformFilter('all');
    setStatusFilter('all');
    setLocationFilter('');
    setSelectedJobTypes([]);
    setSelectedWorkTypes([]);
    setSelectedExperienceLevels([]);
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
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs, companies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Location */}
          <div className="relative w-full lg:w-[180px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Location..."
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="pl-10"
              list="locations-list"
            />
            <datalist id="locations-list">
              {uniqueLocations.map(loc => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </div>
          
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
        {(locationFilter || selectedJobTypes.length > 0 || selectedWorkTypes.length > 0 || selectedExperienceLevels.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Active:</span>
            {locationFilter && (
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {locationFilter}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setLocationFilter('')} />
              </Badge>
            )}
            {selectedJobTypes.map(type => (
              <Badge key={type} variant="secondary" className="gap-1">
                {type}
                <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter(selectedJobTypes, setSelectedJobTypes, type)} />
              </Badge>
            ))}
            {selectedWorkTypes.map(type => (
              <Badge key={type} variant="secondary" className="gap-1">
                {type}
                <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter(selectedWorkTypes, setSelectedWorkTypes, type)} />
              </Badge>
            ))}
            {selectedExperienceLevels.map(level => (
              <Badge key={level} variant="secondary" className="gap-1">
                {level}
                <X className="h-3 w-3 cursor-pointer" onClick={() => toggleArrayFilter(selectedExperienceLevels, setSelectedExperienceLevels, level)} />
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
