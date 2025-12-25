import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Calendar, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface JobSearchPanelProps {
  onSearchComplete: () => void;
  isSearching: boolean;
  setIsSearching: (val: boolean) => void;
}

const QUICK_ROLES = [
  'Data Scientist',
  'Software Engineer',
  'Product Manager',
  'Machine Learning Engineer',
  'Data Engineer',
  'Full Stack Developer',
];

const LOCATIONS = [
  { value: 'all', label: 'All Locations' },
  { value: 'Remote', label: 'Remote' },
  { value: 'United States', label: 'United States' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Europe', label: 'Europe' },
  { value: 'London', label: 'London, UK' },
  { value: 'New York', label: 'New York, US' },
  { value: 'San Francisco', label: 'San Francisco, US' },
  { value: 'Dublin', label: 'Dublin, Ireland' },
];

const DATE_FILTERS = [
  { value: 'all', label: 'Any Time' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '3d', label: 'Last 3 Days' },
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
];

export function JobSearchPanel({ onSearchComplete, isSearching, setIsSearching }: JobSearchPanelProps) {
  const { user } = useAuth();
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('Remote');
  const [dateFilter, setDateFilter] = useState('week');
  const [activeRoles, setActiveRoles] = useState<string[]>(['Data Scientist']);

  const toggleRole = (role: string) => {
    setActiveRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleSearch = async () => {
    if (!user) {
      toast.error('Please log in to search');
      return;
    }

    const searchTerms = [...activeRoles];
    if (keywords.trim()) {
      searchTerms.push(...keywords.split(',').map(k => k.trim()).filter(Boolean));
    }

    if (searchTerms.length === 0) {
      toast.error('Please select at least one role or enter keywords');
      return;
    }

    setIsSearching(true);
    
    try {
      toast.info('Searching for jobs...', { id: 'job-search' });
      
      const { data, error } = await supabase.functions.invoke('search-jobs-google', {
        body: {
          keywords: searchTerms.join(', '),
          location: location === 'all' ? '' : location,
          dateFilter,
          user_id: user.id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Found ${data.totalFound} jobs from tier-1 companies!`, { id: 'job-search' });
        onSearchComplete();
      } else {
        throw new Error(data?.error || 'Search failed');
      }
    } catch (error) {
      console.error('Job search error:', error);
      toast.error('Search failed. Please try again.', { id: 'job-search' });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardContent className="p-6 space-y-5">
        {/* Quick role selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Quick Select Roles</label>
          <div className="flex flex-wrap gap-2">
            {QUICK_ROLES.map(role => (
              <Badge
                key={role}
                variant={activeRoles.includes(role) ? "default" : "outline"}
                className={`cursor-pointer transition-all text-sm py-1.5 px-3 ${
                  activeRoles.includes(role) 
                    ? 'bg-primary hover:bg-primary/90' 
                    : 'hover:bg-primary/10 hover:border-primary/50'
                }`}
                onClick={() => toggleRole(role)}
              >
                {role}
                {activeRoles.includes(role) && <X className="h-3 w-3 ml-1.5" />}
              </Badge>
            ))}
          </div>
        </div>

        {/* Search inputs row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Additional keywords (comma-separated)..."
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="pl-10 h-11 bg-background"
            />
          </div>

          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="pl-10 h-11 bg-background">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map(loc => (
                  <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="pl-10 h-11 bg-background">
                <SelectValue placeholder="Posted" />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTERS.map(df => (
                  <SelectItem key={df.value} value={df.value}>{df.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search button */}
        <Button 
          onClick={handleSearch} 
          disabled={isSearching || activeRoles.length === 0}
          className="w-full h-12 text-base font-medium"
          size="lg"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Searching Tier-1 Companies...
            </>
          ) : (
            <>
              <Search className="h-5 w-5 mr-2" />
              Search {activeRoles.length > 0 ? `${activeRoles.length} Role${activeRoles.length > 1 ? 's' : ''}` : 'Jobs'}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Searches Greenhouse, Lever, Workday, Ashby, SmartRecruiters & more
        </p>
      </CardContent>
    </Card>
  );
}