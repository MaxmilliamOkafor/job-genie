import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  FileText,
  Download,
  Eye,
  Clock,
  ArrowRight,
  FileCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Application } from '@/hooks/useApplications';

type GenerationType = 'resume' | 'cover_letter';

interface HistoryItem {
  application: Application;
  type: GenerationType;
  content: string;
  createdAt: string;
}

interface GenerationHistoryProps {
  applications: Application[];
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\u2026';
}

function buildHistoryItems(applications: Application[]): HistoryItem[] {
  const items: HistoryItem[] = [];

  for (const app of applications) {
    if (app.tailored_resume) {
      items.push({
        application: app,
        type: 'resume',
        content: app.tailored_resume,
        createdAt: app.applied_at || app.created_at || new Date().toISOString(),
      });
    }
    if (app.tailored_cover_letter) {
      items.push({
        application: app,
        type: 'cover_letter',
        content: app.tailored_cover_letter,
        createdAt: app.applied_at || app.created_at || new Date().toISOString(),
      });
    }
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return items.slice(0, 10);
}

function downloadAsTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatTimestamp(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function GenerationHistory({ applications }: GenerationHistoryProps) {
  const [viewContent, setViewContent] = useState<{
    title: string;
    content: string;
  } | null>(null);

  const items = buildHistoryItems(applications);

  const handleDownload = (item: HistoryItem) => {
    const company = item.application.job?.company || 'Unknown';
    const typeLabel = item.type === 'resume' ? 'Resume' : 'Cover_Letter';
    const filename = `${company}_${typeLabel}.txt`.replace(/\s+/g, '_');
    downloadAsTextFile(item.content, filename);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileCheck className="h-4 w-4" />
          Generation History
        </CardTitle>
        {items.length > 0 && (
          <Link to="/applications">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-3xl mb-2">{'\uD83D\uDC49'}</span>
            <p className="text-sm text-muted-foreground">
              Generate your first resume
            </p>
          </div>
        ) : (
          <Dialog>
            <ScrollArea className={items.length > 5 ? 'h-[400px]' : undefined}>
              <div className="space-y-2">
                {items.map((item, index) => {
                  const company =
                    item.application.job?.company || 'Unknown Company';
                  const jobTitle =
                    item.application.job?.title || 'Unknown Position';
                  const typeLabel =
                    item.type === 'resume' ? 'Resume' : 'Cover Letter';
                  const dialogTitle = `${typeLabel} - ${company} (${jobTitle})`;

                  return (
                    <DialogTrigger asChild key={`${item.application.id}-${item.type}`}>
                      <div
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() =>
                          setViewContent({
                            title: dialogTitle,
                            content: item.content,
                          })
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {truncate(company, 24)}
                              </span>
                              <Badge
                                variant={
                                  item.type === 'resume'
                                    ? 'default'
                                    : 'secondary'
                                }
                                className="text-[10px] shrink-0"
                              >
                                {typeLabel}
                              </Badge>
                              {index === 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] shrink-0 border-primary text-primary"
                                >
                                  Latest
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground truncate">
                                {jobTitle}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(item.createdAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </DialogTrigger>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{viewContent?.title}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="h-[60vh]">
                <pre className="whitespace-pre-wrap text-sm p-4 leading-relaxed">
                  {viewContent?.content}
                </pre>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
