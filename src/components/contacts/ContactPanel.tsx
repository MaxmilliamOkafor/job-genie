import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, RefreshCw, Search, PenLine } from 'lucide-react';
import { JobContact, JobContactsTarget, useJobContacts } from '@/hooks/useJobContacts';

const TYPE_LABEL: Record<JobContact['contactType'], string> = {
  job_poster: 'Named job poster',
  published_recruiting: 'Published recruiting contact',
  recruiting_inbox: 'General recruiting inbox',
  possible_connection: 'Possible connection - review',
};

const TYPE_TONE: Record<JobContact['contactType'], string> = {
  job_poster: 'bg-primary/15 text-primary border-primary/30',
  published_recruiting: 'bg-success/15 text-success border-success/30',
  recruiting_inbox: 'bg-secondary text-secondary-foreground border-border',
  possible_connection: 'bg-warning/15 text-warning border-warning/30',
};

function stamp(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('en-GB') : '';
}

function contactId(c: JobContact) {
  return c.id ?? `${c.email ?? c.profileUrl ?? c.contactPageUrl ?? c.name ?? ''}`;
}

export function ContactPanel({
  target,
  jobTitle,
  onDraftFollowUp,
}: {
  target: JobContactsTarget | null;
  jobTitle?: string | null;
  onDraftFollowUp?: (contact: JobContact) => void;
}) {
  const { contacts, history, isLoading, isSearching, lastCheckedAt, sourcesChecked, error, findContacts } =
    useJobContacts(target);
  const [selected, setSelected] = useState<string>('');

  const emailable = useMemo(() => contacts.filter((c) => !!c.email), [contacts]);
  const chosen = contacts.find((c) => contactId(c) === selected) ?? null;

  const copy = async (email: string) => {
    await navigator.clipboard.writeText(email);
    toast.success('Email address copied');
  };

  const draft = () => {
    if (!chosen) return;
    if (onDraftFollowUp) {
      onDraftFollowUp(chosen);
      return;
    }
    const subject = encodeURIComponent(jobTitle ? `Application for ${jobTitle}` : 'Following up on my application');
    const body = encodeURIComponent(
      `${chosen.name ? `Hello ${chosen.name.split(' ')[0]},` : 'Hello,'}\n\n`
      + `I applied for ${jobTitle ?? 'the advertised role'}${target?.company ? ` at ${target.company}` : ''} `
      + 'and wanted to check the application has been received.\n\n',
    );
    // Opens a draft for review. Nothing is ever sent automatically.
    window.open(`mailto:${chosen.email ?? ''}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base">Contacts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Published contacts from the posting and the employer's own careers pages. Nothing is guessed and
            nothing is sent for you.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={findContacts} disabled={!target || isSearching}>
            {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Find contacts
          </Button>
          <Button variant="ghost" onClick={findContacts} disabled={!target || isSearching} aria-label="Refresh contacts">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {lastCheckedAt && (
          <p className="text-xs text-muted-foreground">
            Source checked {stamp(lastCheckedAt)}
            {sourcesChecked.length > 0 && ` - ${sourcesChecked.length} page(s) read`}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading saved contacts
          </div>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No published contact found yet. Use Find contacts to read the posting and the employer's careers pages.
          </p>
        ) : (
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
            {contacts.map((c) => {
              const id = contactId(c);
              return (
                <div key={id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      {c.email ? (
                        <RadioGroupItem value={id} id={`contact-${id}`} className="mt-1" />
                      ) : (
                        <span className="mt-1 h-4 w-4" />
                      )}
                      <div>
                        <Label htmlFor={`contact-${id}`} className="text-sm font-medium">
                          {c.name || c.email || c.contactPageUrl || 'Employer contact page'}
                        </Label>
                        {c.title && <p className="text-xs text-muted-foreground">{c.title}</p>}
                        {c.email && c.name && <p className="text-xs text-muted-foreground">{c.email}</p>}
                        {!c.email && (
                          <p className="text-xs text-muted-foreground">
                            No published email address. Use the profile or contact page below.
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={TYPE_TONE[c.contactType]}>
                      {TYPE_LABEL[c.contactType]}
                    </Badge>
                  </div>

                  {c.sourceContext && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">"{c.sourceContext}"</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Source checked {stamp(c.checkedAt)}</span>
                    {!c.mailboxVerified && <span>Mailbox not verified</span>}
                    {c.requiresReview && <span className="text-warning">Needs your review</span>}
                    {c.sourceUrl && (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {c.profileUrl && (
                      <a
                        href={c.profileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Profile <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {c.contactPageUrl && (
                      <a
                        href={c.contactPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Contact page <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {c.email && (
                      <button
                        type="button"
                        onClick={() => copy(c.email!)}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Copy email <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </RadioGroup>
        )}

        {emailable.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={draft} disabled={!chosen?.email}>
              <PenLine className="mr-2 h-4 w-4" /> Draft follow-up
            </Button>
            <span className="text-xs text-muted-foreground">
              You choose the recipient and review the draft. Nothing is sent automatically.
            </span>
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">No longer published</p>
            {history.map((c) => (
              <p key={contactId(c)} className="text-xs text-muted-foreground">
                {c.name || c.email || c.contactPageUrl} - last seen {stamp(c.checkedAt)}, removed {stamp(c.removedAt)}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
