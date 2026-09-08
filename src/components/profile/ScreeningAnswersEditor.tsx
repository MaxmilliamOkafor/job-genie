import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, ShieldQuestion } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Screening answers. Stored on the profile row under
 * learned_preferences.application_answers as an exact-question -> answer map,
 * matching the extension's ua_profile / ats_profile application_answers contract.
 * Each entry also keeps the country/employer it applies to and the moment the
 * candidate confirmed it. Nothing here is inferred: an unanswered question stays
 * unanswered so autofill leaves it for the candidate.
 */
export interface ScreeningAnswer {
  question: string;
  answer: string;
  scope?: string;
  confirmed_at?: string;
}

const EMPTY: ScreeningAnswer = { question: '', answer: '', scope: '' };

export function ScreeningAnswersEditor() {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<ScreeningAnswer[]>([]);
  const [draft, setDraft] = useState<ScreeningAnswer>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('learned_preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) setError(error.message);
      const prefs = (data?.learned_preferences ?? {}) as Record<string, unknown>;
      const list = Array.isArray((prefs as any).screening_answers)
        ? ((prefs as any).screening_answers as ScreeningAnswer[])
        : [];
      setAnswers(list);
      setIsLoading(false);
    })();
  }, [user]);

  const persist = async (next: ScreeningAnswer[]) => {
    if (!user) return;
    setIsSaving(true);
    setError(null);
    const { data } = await supabase
      .from('profiles')
      .select('learned_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const prefs = { ...((data?.learned_preferences ?? {}) as Record<string, unknown>) };
    prefs.screening_answers = next;
    prefs.application_answers = Object.fromEntries(
      next.filter((a) => a.question && a.answer).map((a) => [a.question, a.answer])
    );
    const { error } = await supabase
      .from('profiles')
      .update({ learned_preferences: prefs as never })
      .eq('user_id', user.id);
    setIsSaving(false);
    if (error) {
      setError(error.message);
      toast.error('Could not save this answer');
      return;
    }
    setAnswers(next);
    toast.success('Screening answers saved');
  };

  const add = () => {
    if (!draft.question.trim() || !draft.answer.trim()) {
      toast.error('Add both the exact question and your answer');
      return;
    }
    persist([
      ...answers,
      {
        question: draft.question.trim(),
        answer: draft.answer.trim(),
        scope: draft.scope?.trim() || undefined,
        confirmed_at: new Date().toISOString(),
      },
    ]);
    setDraft(EMPTY);
  };

  const remove = (i: number) => persist(answers.filter((_, idx) => idx !== i));

  const payloadPreview = useMemo(
    () =>
      JSON.stringify(
        Object.fromEntries(answers.filter((a) => a.question && a.answer).map((a) => [a.question, a.answer])),
        null,
        2
      ),
    [answers]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading screening answers
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldQuestion className="h-5 w-5 text-primary" /> Screening answers
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Store the exact question text as the employer writes it. Only answers saved here are
            used to fill a form. Anything not saved is left for you to answer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Label htmlFor="sa-question">Exact question text</Label>
              <Input
                id="sa-question"
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                placeholder="Are you legally authorised to work in Ireland?"
              />
            </div>
            <div>
              <Label htmlFor="sa-scope">Applies to (country or employer)</Label>
              <Input
                id="sa-scope"
                value={draft.scope ?? ''}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                placeholder="Ireland"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="sa-answer">Your answer</Label>
            <Textarea
              id="sa-answer"
              rows={2}
              value={draft.answer}
              onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              placeholder="Yes"
            />
          </div>
          <Button onClick={add} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Confirm and save
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saved answers ({answers.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No answers saved yet. Work authorisation is never assumed from where you live or
              from citizenship, so add each country you want answered.
            </p>
          ) : (
            answers.map((a, i) => (
              <div
                key={`${a.question}-${i}`}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
              >
                <div className="min-w-[240px] flex-1 space-y-1">
                  <p className="font-medium">{a.question}</p>
                  <p className="text-sm">{a.answer}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {a.scope && <Badge variant="outline">{a.scope}</Badge>}
                    {a.confirmed_at && (
                      <Badge variant="secondary">
                        Confirmed {new Date(a.confirmed_at).toLocaleDateString('en-GB')}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => remove(i)} aria-label="Delete answer">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What the extension reads</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs">
            {payloadPreview}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
