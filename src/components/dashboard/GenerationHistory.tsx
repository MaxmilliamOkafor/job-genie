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
  ChevronDown,
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
import { groupDocumentsByJob } from '@/lib/documentGroups';

type GenerationType = 'resume' | 'cover_letter';

interface GenerationHistoryProps {
  applications: Application[];
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\u2026';
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // One entry per job, newest first; earlier versions expand underneath.
  const groups = groupDocumentsByJob(applications).slice(0, 10);

  const handleDownload = (app: Application, type: GenerationType) => {
    const company = app.job?.company || 'Unknown';
    const typeLabel = type === 'resume' ? 'Resume' : 'Cover_Letter';
    const filename = `${company}_${typeLabel}.txt`.replace(/\s+/g, '_');
    downloadAsTextFile((type === 'resume' ? app.tailored_resume : app.tailored_cover_letter) || '', filename);
  };

  const open = (app: Application, type: GenerationType) => {
    const company = app.job?.company || 'Unknown Company';
    const jobTitle = app.job?.title || 'Unknown Position';
    setViewContent({
      title: `${type === 'resume' ? 'CV' : 'Cover letter'} - ${company} (${jobTitle})`,
      content: (type === 'resume' ? app.tailored_resume : app.tailored_cover_letter) || '',
    });
  };

  const docButtons = (app: Application) => (
    <div className="flex flex-wrap items-center gap-1 shrink-0">
      {(['resume', 'cover_letter'] as const)
        .filter((type) => (type === 'resume' ? app.tailored_resume : app.tailored_cover_letter))
        .map((type) => (
          <div key={type} className="flex items-center">
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => open(app, type)}>
                <Eye className="h-3.5 w-3.5" />
                {type === 'resume' ? 'CV' : 'Letter'}
              </Button>
            </DialogTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Download ${type === 'resume' ? 'CV' : 'cover letter'} as text`}
              onClick={() => handleDownload(app, type)}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileCheck className="h-4 w-4" />
          Generation History
        </CardTitle>
        {groups.length > 0 && (
          <Link to="/documents">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              View All
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-3xl mb-2">{'\uD83D\uDC49'}</span>
            <p className="text-sm text-muted-foreground">
              Generate your first resume
            </p>
          </div>
        ) : (
          <Dialog>
            <ScrollArea className={groups.length > 5 ? 'h-[400px]' : undefined}>
              <div className="space-y-2">
                {groups.map((g, index) => {
                  const app = g.latest;
                  const company = app.job?.company || 'Unknown Company';
                  const jobTitle = app.job?.title || 'Unknown Position';
                  const isOpen = !!expanded[g.key];
                  return (
                    <div key={g.key} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{truncate(company, 24)}</span>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {g.submitted ? 'Applied' : 'Prepared'}
                              </Badge>
                              {index === 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0 border-primary text-primary">
                                  Latest
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground truncate">{jobTitle}</span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(app.updated_at || app.created_at || new Date().toISOString())}
                              </span>
                            </div>
                          </div>
                        </div>
                        {docButtons(app)}
                      </div>
                      {g.earlier.length > 0 && (
                        <div className="mt-2">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            aria-expanded={isOpen}
                            onClick={() => setExpanded((prev) => ({ ...prev, [g.key]: !isOpen }))}
                          >
                            {g.earlier.length} earlier {g.earlier.length === 1 ? 'version' : 'versions'}
                            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {isOpen && (
                            <ul className="mt-2 space-y-1.5">
                              {g.earlier.map((v) => (
                                <li key={v.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                                  <span className="text-xs text-muted-foreground">
                                    {formatTimestamp(v.updated_at || v.created_at || new Date().toISOString())}
                                  </span>
                                  {docButtons(v)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
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
