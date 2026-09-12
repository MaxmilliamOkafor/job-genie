import { useEffect, useMemo, useState } from 'react';
import { AppLayout, ViewHeader } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useApplications } from '@/hooks/useApplications';
import { ContactPanel } from '@/components/contacts/ContactPanel';
import { Loader2, Inbox, Send } from 'lucide-react';


interface Detection {
  id: string;
  email_subject: string;
  email_from: string;
  detection_type: string;
  detected_at: string | null;
  is_read: boolean | null;
}

interface SentEmail {
  id: string;
  email_type: string;
  recipient: string;
  subject: string;
  sent_at: string | null;
  delivered: boolean | null;
}

const typeTone: Record<string, string> = {
  interview: 'bg-success/15 text-success border-success/30',
  offer: 'bg-primary/15 text-primary border-primary/30',
  rejection: 'bg-destructive/15 text-destructive border-destructive/30',
  follow_up: 'bg-warning/15 text-warning border-warning/30',
};

export default function FollowUp() {
  const { user } = useAuth();
  const { applications } = useApplications();
  const [detections, setDetections] = useState<Detection[]>([]);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<string>('');

  const contactTarget = useMemo(() => {
    const app = applications.find((a) => a.job_id === selectedJob);
    if (!app?.job) return null;
    return {
      jobKey: app.job.url || app.job.id,
      jobId: app.job.id,
      company: app.job.company,
      jobUrl: app.job.url,
      employerUrls: [],
      jobDescription: null,
    };
  }, [applications, selectedJob]);

  useEffect(() => {
    if (!selectedJob && applications[0]?.job_id) setSelectedJob(applications[0].job_id);
  }, [applications, selectedJob]);


  const load = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    const [d, s] = await Promise.all([
      supabase
        .from('email_detections')
        .select('id, email_subject, email_from, detection_type, detected_at, is_read')
        .order('detected_at', { ascending: false })
        .limit(50),
      supabase
        .from('sent_emails')
        .select('id, email_type, recipient, subject, sent_at, delivered')
        .order('sent_at', { ascending: false })
        .limit(50),
    ]);
    if (d.error || s.error) setError(d.error?.message || s.error?.message || 'Could not load messages');
    setDetections((d.data as Detection[]) || []);
    setSent((s.data as SentEmail[]) || []);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markRead = async (id: string) => {
    setDetections((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
    await supabase.from('email_detections').update({ is_read: true }).eq('id', id);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <ViewHeader
          title="Follow-up"
          hint="Replies detected on your applications and the messages you have sent."
          action={
            <Button variant="secondary" onClick={load}>
              Refresh
            </Button>
          }
        />

        {error && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="py-4 text-sm">
              {error}
              <Button variant="secondary" className="ml-3" onClick={load}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages
          </div>
        ) : (
          <Tabs defaultValue="inbox" className="space-y-4">
            <TabsList>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="inbox">Detected replies ({detections.length})</TabsTrigger>
              <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="contacts" className="space-y-3">
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-4">
                  <span className="text-sm text-muted-foreground">Job</span>
                  <Select value={selectedJob} onValueChange={setSelectedJob}>
                    <SelectTrigger className="w-[420px] max-w-full">
                      <SelectValue placeholder="Choose an application" />
                    </SelectTrigger>
                    <SelectContent>
                      {applications
                        .filter((a) => a.job)
                        .map((a) => (
                          <SelectItem key={a.job_id} value={a.job_id}>
                            {a.job!.title} - {a.job!.company}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {contactTarget ? (
                <ContactPanel
                  target={contactTarget}
                  jobTitle={applications.find((a) => a.job_id === selectedJob)?.job?.title ?? null}
                />
              ) : (
                <Card>
                  <CardContent className="py-10 text-sm text-muted-foreground">
                    Choose an application to look for published recruiting contacts.
                  </CardContent>
                </Card>
              )}
            </TabsContent>


            <TabsContent value="inbox" className="space-y-3">
              {detections.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-start gap-2 py-10">
                    <Inbox className="h-6 w-6 text-muted-foreground" />
                    <p className="font-medium">Nothing detected yet</p>
                    <p className="text-sm text-muted-foreground">
                      Connect your mailbox in Settings to track replies automatically.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                detections.map((d) => (
                  <Card key={d.id} className={d.is_read ? '' : 'border-primary/40'}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                      <div>
                        <CardTitle className="text-base">{d.email_subject}</CardTitle>
                        <p className="text-sm text-muted-foreground">{d.email_from}</p>
                      </div>
                      <Badge variant="outline" className={typeTone[d.detection_type] ?? ''}>
                        {d.detection_type.replace('_', ' ')}
                      </Badge>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {d.detected_at ? new Date(d.detected_at).toLocaleString('en-GB') : ''}
                      </span>
                      {!d.is_read && (
                        <Button variant="secondary" onClick={() => markRead(d.id)}>
                          Mark as read
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="sent" className="space-y-3">
              {sent.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-start gap-2 py-10">
                    <Send className="h-6 w-6 text-muted-foreground" />
                    <p className="font-medium">No messages sent</p>
                  </CardContent>
                </Card>
              ) : (
                sent.map((s) => (
                  <Card key={s.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{s.subject}</CardTitle>
                      <p className="text-sm text-muted-foreground">To {s.recipient}</p>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <Badge variant="outline">{s.email_type.replace('_', ' ')}</Badge>
                      {s.sent_at && <span>{new Date(s.sent_at).toLocaleString('en-GB')}</span>}
                      <Badge variant={s.delivered ? 'secondary' : 'outline'}>
                        {s.delivered ? 'Delivered' : 'Unconfirmed'}
                      </Badge>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
