import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, Trash2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileExport {
  version: string;
  exportedAt: string;
  profile: Record<string, any>;
  changesSummary?: string[];
}

interface VersionHistoryEntry {
  id: string;
  exportedAt: string;
  version: string;
  changesSummary: string[];
  size: number;
}

const STORAGE_KEY = 'quantumhire_profile_versions';
const MAX_VERSIONS = 10;

// Compare two profile objects and return a summary of changes
const getChangesSummary = (oldProfile: Record<string, any> | null, newProfile: Record<string, any>): string[] => {
  if (!oldProfile) return ['Initial export'];
  
  const changes: string[] = [];
  const fieldsToTrack = [
    'first_name', 'last_name', 'email', 'phone', 'city', 'country',
    'work_experience', 'education', 'skills', 'certifications', 'languages'
  ];

  for (const field of fieldsToTrack) {
    const oldVal = oldProfile[field];
    const newVal = newProfile[field];
    
    if (Array.isArray(newVal) && Array.isArray(oldVal)) {
      if (newVal.length !== oldVal.length) {
        const diff = newVal.length - oldVal.length;
        const fieldLabel = field.replace(/_/g, ' ');
        changes.push(`${diff > 0 ? '+' : ''}${diff} ${fieldLabel}`);
      }
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push(`Updated ${field.replace(/_/g, ' ')}`);
    }
  }

  return changes.length > 0 ? changes : ['Minor changes'];
};

// Store version history in localStorage
const getVersionHistory = (): VersionHistoryEntry[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveVersionHistory = (history: VersionHistoryEntry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_VERSIONS)));
  } catch (e) {
    console.error('Failed to save version history:', e);
  }
};

// Export function that tracks version history
export const createExportWithHistory = (profile: Record<string, any>): ProfileExport => {
  const history = getVersionHistory();
  const previousProfile = history.length > 0 
    ? JSON.parse(localStorage.getItem(`${STORAGE_KEY}_data_${history[0].id}`) || 'null')
    : null;
  
  const changesSummary = getChangesSummary(previousProfile, profile);
  const exportData: ProfileExport = {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    profile,
    changesSummary,
  };

  // Save to version history
  const versionId = Date.now().toString();
  const newEntry: VersionHistoryEntry = {
    id: versionId,
    exportedAt: exportData.exportedAt,
    version: exportData.version,
    changesSummary,
    size: JSON.stringify(exportData).length,
  };

  // Store the profile data separately for comparison
  try {
    localStorage.setItem(`${STORAGE_KEY}_data_${versionId}`, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to store profile data:', e);
  }

  // Update history
  const newHistory = [newEntry, ...history].slice(0, MAX_VERSIONS);
  saveVersionHistory(newHistory);

  // Cleanup old data entries
  history.slice(MAX_VERSIONS - 1).forEach(entry => {
    localStorage.removeItem(`${STORAGE_KEY}_data_${entry.id}`);
  });

  return exportData;
};

// Clear version from history
export const clearVersionFromHistory = (versionId: string) => {
  const history = getVersionHistory();
  const newHistory = history.filter(v => v.id !== versionId);
  saveVersionHistory(newHistory);
  localStorage.removeItem(`${STORAGE_KEY}_data_${versionId}`);
};

interface ProfileVersionHistoryProps {
  onRestore?: (profile: Record<string, any>) => void;
}

export function ProfileVersionHistory({ onRestore }: ProfileVersionHistoryProps) {
  const [history, setHistory] = useState<VersionHistoryEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setHistory(getVersionHistory());
  }, []);

  const handleRestore = (versionId: string) => {
    try {
      const profileData = localStorage.getItem(`${STORAGE_KEY}_data_${versionId}`);
      if (profileData && onRestore) {
        onRestore(JSON.parse(profileData));
        toast.success('Profile restored from version history');
      } else {
        toast.error('Version data not found');
      }
    } catch (e) {
      toast.error('Failed to restore version');
    }
  };

  const handleDelete = (versionId: string) => {
    clearVersionFromHistory(versionId);
    setHistory(getVersionHistory());
    toast.success('Version deleted');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  if (history.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-3 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Export History
            <Badge variant="secondary" className="text-xs">{history.length}</Badge>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((version, index) => (
              <div
                key={version.id}
                className="flex items-start justify-between p-3 border rounded-lg bg-muted/30 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {new Date(version.exportedAt).toLocaleDateString()} 
                      {' '}
                      <span className="text-muted-foreground text-xs">
                        {new Date(version.exportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    {index === 0 && <Badge variant="default" className="text-xs">Latest</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {version.changesSummary.slice(0, 3).join(' • ')}
                    {version.changesSummary.length > 3 && ` +${version.changesSummary.length - 3} more`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatSize(version.size)} • v{version.version}
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  {onRestore && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); handleRestore(version.id); }}
                      title="Restore this version"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); handleDelete(version.id); }}
                    title="Delete this version"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Last {MAX_VERSIONS} exports are stored locally
          </p>
        </CardContent>
      )}
    </Card>
  );
}
