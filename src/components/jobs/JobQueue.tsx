import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Play,
  Pause,
  Trash2,
  Link,
  Plus,
  CheckCircle,
  XCircle,
  Loader2,
  FileSpreadsheet,
  ListChecks,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

interface QueueItem {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  title?: string;
  company?: string;
  error?: string;
}

interface JobQueueProps {
  onJobsAdded?: (count: number) => void;
}

export function JobQueue({ onJobsAdded }: JobQueueProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add single URL
  const addUrl = useCallback(() => {
    if (!urlInput.trim()) return;

    const urls = urlInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => u && isValidJobUrl(u));

    if (urls.length === 0) {
      toast.error('No valid job URLs found');
      return;
    }

    // Check for duplicates
    const existingUrls = new Set(queue.map((q) => q.url));
    const newUrls = urls.filter((url) => !existingUrls.has(url));

    if (newUrls.length === 0) {
      toast.info('All URLs already in queue');
      return;
    }

    const newItems: QueueItem[] = newUrls.map((url) => ({
      id: crypto.randomUUID(),
      url,
      status: 'pending',
    }));

    setQueue((prev) => [...prev, ...newItems]);
    setUrlInput('');
    toast.success(`Added ${newItems.length} job(s) to queue`);
  }, [urlInput, queue]);

  // Validate job URL
  const isValidJobUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      const validDomains = [
        'greenhouse.io',
        'lever.co',
        'workday.com',
        'myworkdayjobs.com',
        'ashbyhq.com',
        'smartrecruiters.com',
        'icims.com',
        'jobvite.com',
        'linkedin.com',
        'workable.com',
      ];
      return validDomains.some((d) => parsed.hostname.includes(d));
    } catch {
      return false;
    }
  };

  // Process CSV
  const processCSV = useCallback(
    (text: string) => {
      const urls: string[] = [];
      const lines = text.split(/\r?\n/);

      for (const line of lines) {
        const urlMatch = line.match(
          /https?:\/\/[^\s,"\\'<>]+/gi
        );
        if (urlMatch) {
          urlMatch.forEach((url) => {
            if (isValidJobUrl(url) && !urls.includes(url)) {
              urls.push(url);
            }
          });
        }
      }

      if (urls.length === 0) {
        toast.error('No valid job URLs found in CSV');
        return;
      }

      // Check for duplicates
      const existingUrls = new Set(queue.map((q) => q.url));
      const newUrls = urls.filter((url) => !existingUrls.has(url));

      if (newUrls.length === 0) {
        toast.info('All URLs already in queue');
        return;
      }

      const newItems: QueueItem[] = newUrls.map((url) => ({
        id: crypto.randomUUID(),
        url,
        status: 'pending',
      }));

      setQueue((prev) => [...prev, ...newItems]);
      toast.success(`Imported ${newItems.length} job(s) from CSV`);
    },
    [queue]
  );

  // Handle file upload
  const handleFileUpload = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      toast.error('Please upload a CSV or TXT file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      processCSV(text);
    };
    reader.readAsText(file);
  };

  // Handle drag/drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  // Select all
  const handleSelectAll = () => {
    if (selectedIds.length === queue.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(queue.map((q) => q.id));
    }
  };

  // Select one
  const handleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Delete selected
  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    setQueue((prev) => prev.filter((q) => !selectedIds.includes(q.id)));
    setSelectedIds([]);
    toast.success(`Removed ${selectedIds.length} item(s)`);
  };

  // Start automation
  const startAutomation = async () => {
    if (!profile) {
      toast.error('Please complete your profile first');
      return;
    }

    const pendingItems = queue.filter((q) => q.status === 'pending');
    if (pendingItems.length === 0) {
      toast.error('No pending jobs in queue');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    abortRef.current = new AbortController();

    for (let i = 0; i < pendingItems.length; i++) {
      if (abortRef.current.signal.aborted) break;

      const item = pendingItems[i];
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'processing' } : q))
      );

      try {
        // Call tailor-application for each job
        const { data, error } = await supabase.functions.invoke('tailor-application', {
          body: {
            jobUrl: item.url,
            userProfile: {
              firstName: profile.first_name,
              lastName: profile.last_name,
              email: profile.email,
              phone: profile.phone,
              linkedin: profile.linkedin,
              github: profile.github,
              portfolio: profile.portfolio,
              coverLetter: profile.cover_letter,
              workExperience: profile.work_experience,
              education: profile.education,
              skills: profile.skills,
              certifications: profile.certifications,
              achievements: profile.achievements,
              atsStrategy: profile.ats_strategy,
            },
          },
        });

        if (error) throw error;

        // Save to jobs table
        if (data.jobTitle) {
          await supabase.from('jobs').insert({
            user_id: user?.id,
            title: data.jobTitle || 'Unknown Position',
            company: data.company || 'Unknown Company',
            location: data.location || 'Remote',
            description: data.description,
            url: item.url,
            match_score: data.matchScore || 0,
            status: 'applied',
            applied_at: new Date().toISOString(),
          });
        }

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'completed',
                  title: data.jobTitle,
                  company: data.company,
                }
              : q
          )
        );
      } catch (error) {
        console.error('Queue processing error:', error);
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'failed',
                  error: error instanceof Error ? error.message : 'Failed',
                }
              : q
          )
        );
      }

      setProgress(((i + 1) / pendingItems.length) * 100);
      await new Promise((r) => setTimeout(r, 1000)); // Rate limit
    }

    setIsProcessing(false);
    const completed = queue.filter((q) => q.status === 'completed').length;
    toast.success(`Completed ${completed} applications!`);
    onJobsAdded?.(completed);
  };

  // Stop automation
  const stopAutomation = () => {
    abortRef.current?.abort();
    setIsProcessing(false);
    toast.info('Automation stopped');
  };

  // Clear completed
  const clearCompleted = () => {
    setQueue((prev) => prev.filter((q) => q.status !== 'completed'));
    toast.success('Cleared completed jobs');
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const completedCount = queue.filter((q) => q.status === 'completed').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Jobs Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{pendingCount} pending</Badge>
            <Badge className="bg-success/10 text-success border-success/30">
              {completedCount} done
            </Badge>
            {failedCount > 0 && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                {failedCount} failed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* URL Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Paste job URL(s) - separate multiple with commas or new lines"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
          />
          <Button onClick={addUrl} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* CSV Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <FileSpreadsheet className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-2">
            Drag & drop a CSV file with job URLs, or
          </p>
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-2" />
            Browse Files
          </Button>
        </div>

        {/* Queue Actions */}
        {queue.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2">
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={deleteSelected}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selectedIds.length})
                </Button>
              )}
              {completedCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearCompleted}>
                  Clear Completed
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              {isProcessing ? (
                <Button variant="destructive" onClick={stopAutomation}>
                  <Pause className="h-4 w-4 mr-1" />
                  Stop
                </Button>
              ) : (
                <Button onClick={startAutomation} disabled={pendingCount === 0}>
                  <Zap className="h-4 w-4 mr-1" />
                  Start Automation ({pendingCount})
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Progress */}
        {isProcessing && (
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">
              Processing... {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Queue Table */}
        {queue.length > 0 && (
          <ScrollArea className="h-[300px] rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.length === queue.length && queue.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={() => handleSelectOne(item.id)}
                        disabled={item.status === 'processing'}
                      />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {item.url}
                    </TableCell>
                    <TableCell>
                      {item.title ? (
                        <div>
                          <p className="font-medium text-sm truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.company}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === 'pending' && (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                      {item.status === 'processing' && (
                        <Badge className="bg-primary/10 text-primary">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Processing
                        </Badge>
                      )}
                      {item.status === 'completed' && (
                        <Badge className="bg-success/10 text-success border-success/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      )}
                      {item.status === 'failed' && (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                          <XCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => window.open(item.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {queue.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Link className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No jobs in queue</p>
            <p className="text-xs">Add job URLs or import a CSV to get started</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
