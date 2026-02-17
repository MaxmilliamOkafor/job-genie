import { useRef, useCallback, useState, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Job } from '@/hooks/useJobs';
import { HiringCafeJobCard } from './HiringCafeJobCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Loader2, LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface HiringCafeGridProps {
  jobs: (Job & Record<string, any>)[];
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  onApply: (jobId: string) => void;
  selectedJobs: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  selectionMode: boolean;
  scrollRef?: React.MutableRefObject<(() => void) | null>;
}

export function HiringCafeGrid({
  jobs,
  hasMore,
  isLoading,
  onLoadMore,
  onApply,
  selectedJobs,
  onSelectionChange,
  selectionMode,
  scrollRef,
}: HiringCafeGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [jobToReport, setJobToReport] = useState<Job | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  // Use rows of 3 cards for the grid
  const COLS = 3;
  const rowCount = Math.ceil(jobs.length / COLS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280,
    overscan: 3,
  });

  useEffect(() => {
    if (scrollRef) {
      scrollRef.current = () => {
        if (parentRef.current) {
          parentRef.current.scrollTop = parentRef.current.scrollHeight;
        }
      };
    }
  }, [scrollRef]);

  const handleScroll = useCallback(() => {
    if (!parentRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    if (scrollTop >= scrollHeight - clientHeight - 500) {
      onLoadMore();
    }
  }, [isLoading, hasMore, onLoadMore]);

  const handleSelect = useCallback((jobId: string, selected: boolean) => {
    const newSelection = new Set(selectedJobs);
    if (selected) newSelection.add(jobId);
    else newSelection.delete(jobId);
    onSelectionChange(newSelection);
  }, [selectedJobs, onSelectionChange]);

  const handleReportBrokenLink = useCallback((job: Job) => {
    setJobToReport(job);
    setReportReason('');
    setReportDialogOpen(true);
  }, []);

  const submitReport = useCallback(async () => {
    if (!jobToReport) return;
    setIsReporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('report-broken-link', {
        body: { jobId: jobToReport.id, url: jobToReport.url, reason: reportReason || 'Link not working' },
      });
      if (error) throw error;
      toast.success(data?.alreadyReported ? 'Already reported' : 'Report submitted');
      setReportDialogOpen(false);
    } catch {
      toast.error('Failed to submit report');
    } finally {
      setIsReporting(false);
    }
  }, [jobToReport, reportReason]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <>
      <div
        ref={parentRef}
        className="h-[calc(100vh-380px)] min-h-[400px] overflow-auto"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const startIdx = virtualRow.index * COLS;
            const rowJobs = jobs.slice(startIdx, startIdx + COLS);
            
            return (
              <div
                key={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pb-3">
                  {rowJobs.map((job) => (
                    <HiringCafeJobCard
                      key={job.id}
                      job={job}
                      isSelected={selectedJobs.has(job.id)}
                      onSelect={handleSelect}
                      onApply={onApply}
                      selectionMode={selectionMode}
                      onReportBrokenLink={handleReportBrokenLink}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {isLoading && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}

        {hasMore && !isLoading && jobs.length > 0 && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={onLoadMore}>Load More Jobs</Button>
          </div>
        )}
      </div>

      {/* Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Report Broken Link
            </DialogTitle>
            <DialogDescription>Help us maintain quality job listings.</DialogDescription>
          </DialogHeader>
          {jobToReport && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{jobToReport.title}</p>
                <p className="text-sm text-muted-foreground">{jobToReport.company}</p>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <LinkIcon className="h-3 w-3" />
                  <span className="truncate">{jobToReport.url}</span>
                </div>
              </div>
              <Textarea
                placeholder="What's wrong with this link?"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitReport} disabled={isReporting} variant="destructive">
              {isReporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
