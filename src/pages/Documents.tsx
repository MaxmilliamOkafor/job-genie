import { useEffect, useMemo, useState } from 'react';
import { AppLayout, ViewHeader } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApplications, type Application } from '@/hooks/useApplications';
import { Copy, Download, Eye, FileText, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  documentSlug as slug,
  documentVersion,
  downloadBase64Docx,
  downloadText,
  generateDocx,
  type DocKind,
} from '@/lib/documentExport';

export default function Documents() {
  const { applications, isLoading } = useApplications();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Application | null>(null);

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications
      .filter((a) => a.tailored_resume || a.tailored_cover_letter)
      .filter((a) =>
        !q
          ? true
          : `${a.job?.title ?? ''} ${a.job?.company ?? ''}`.toLowerCase().includes(q)
      );
  }, [applications, query]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <ViewHeader
          title="Documents"
          hint="CV and cover letter generated for each application. Review the text before you send it."
        />

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by role or company"
            className="pl-9"
            aria-label="Search documents"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documents
          </div>
        ) : docs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 py-10">
              <FileText className="h-6 w-6 text-muted-foreground" />
              <p className="font-medium">No documents yet</p>
              <p className="text-sm text-muted-foreground">
                Tailor a CV from a job in Apply and it will appear here.
              </p>
              <Button asChild>
                <a href="/apply?tab=jobs">Go to saved jobs</a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {docs.map((a) => (
              <Card key={a.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base leading-snug">
                    {a.job?.title ?? 'Untitled role'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{a.job?.company ?? 'Unknown company'}</p>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {a.tailored_resume && <Badge variant="secondary">CV</Badge>}
                    {a.tailored_cover_letter && <Badge variant="secondary">Cover letter</Badge>}
                    {a.updated_at && (
                      <Badge variant="outline">
                        {new Date(a.updated_at).toLocaleDateString('en-GB')}
                      </Badge>
                    )}
                  </div>
                  <Button className="w-full" onClick={() => setOpen(a)}>
                    <Eye className="mr-2 h-4 w-4" /> Review
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {open?.job?.title} — {open?.job?.company}
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="cv">
            <TabsList>
              <TabsTrigger value="cv">CV</TabsTrigger>
              <TabsTrigger value="letter">Cover letter</TabsTrigger>
            </TabsList>
            {(['cv', 'letter'] as const).map((kind) => {
              const text =
                (kind === 'cv' ? open?.tailored_resume : open?.tailored_cover_letter) ?? '';
              const filename = `${slug(open?.job?.company ?? 'company')}-${
                kind === 'cv' ? 'CV' : 'Cover-Letter'
              }.txt`;
              return (
                <TabsContent key={kind} value={kind} className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      disabled={!text}
                      onClick={() => {
                        navigator.clipboard.writeText(text);
                        toast.success('Copied');
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" /> Copy
                    </Button>
                    <Button disabled={!text} onClick={() => download(filename, text)}>
                      <Download className="mr-2 h-4 w-4" /> Download
                    </Button>
                  </div>
                  <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-sm">
                    {text || 'Not generated yet.'}
                  </pre>
                </TabsContent>
              );
            })}
          </Tabs>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
