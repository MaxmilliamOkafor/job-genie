import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Loader2,
  Plus,
  Trash2,
  ShieldQuestion,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Clock,
  Inbox,
  ChevronDown,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  FIELD_TYPE_LABELS,
  GLOBAL_SCOPE,
  answerFromOptions,
  buildMemoryPayload,
  confirmationGate,
  matchAnswer,
  mergeAnswers,
  normaliseQuestion,
  type PendingScreeningAnswer,
  type ScreeningAnswer,
  type ScreeningFieldType,
} from '@/lib/screeningAnswers';

export type { ScreeningAnswer } from '@/lib/screeningAnswers';

type Draft = {
  question: string;
  answer: string;
  optionLabels: string;
  fieldType: ScreeningFieldType;
  scope: string;
};

const EMPTY: Draft = { question: '', answer: '', optionLabels: '', fieldType: 'text', scope: '' };

const CHOICE_TYPES: ScreeningFieldType[] = ['select', 'custom-select', 'radio', 'checkbox', 'multi-checkbox'];

function toDraft(a: ScreeningAnswer): Draft {
  return {
    question: a.question,
    answer: a.answer,
    optionLabels: (a.optionLabels ?? []).join(', '),
    fieldType: a.fieldType ?? 'text',
    scope: a.scope ?? '',
  };
}

function fromDraft(d: Draft, previous?: ScreeningAnswer): ScreeningAnswer {
  const labels = d.optionLabels
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isChoice = CHOICE_TYPES.includes(d.fieldType);
  return {
    ...previous,
    question: d.question.trim(),
    answer: (isChoice && labels.length ? answerFromOptions(labels) : d.answer.trim()) || d.answer.trim(),
    optionLabels: isChoice && labels.length ? labels : undefined,
    fieldType: d.fieldType,
    scope: d.scope.trim() || undefined,
    confirmed_at: new Date().toISOString(),
    review_after: undefined,
    source: previous?.source ?? 'website',
  };
}

export function ScreeningAnswersEditor() {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<ScreeningAnswer[]>([]);
  const [pending, setPending] = useState<PendingScreeningAnswer[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState('');
  const [testQuestion, setTestQuestion] = useState('');
  const [testScope, setTestScope] = useState('');
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
      const stored = Array.isArray(prefs.screening_answers)
        ? (prefs.screening_answers as ScreeningAnswer[])
        : [];
      // Preserve older entries that only ever existed as a question -> answer map.
      const legacyMap = (prefs.application_answers ?? {}) as Record<string, string>;
      const legacy: ScreeningAnswer[] = Object.entries(legacyMap).map(([question, answer]) => ({
        question,
        answer,
      }));
      setAnswers(mergeAnswers(stored, legacy.filter((l) =>
        !stored.some((s) => normaliseQuestion(s.question) === normaliseQuestion(l.question))
      )));
      setPending(
        Array.isArray(prefs.pending_screening_answers)
          ? (prefs.pending_screening_answers as PendingScreeningAnswer[])
          : []
      );
      setIsLoading(false);
    })();
  }, [user]);

  const persist = async (next: ScreeningAnswer[], nextPending = pending, message?: string) => {
    if (!user) return false;
    setIsSaving(true);
    setError(null);
    const { data } = await supabase
      .from('profiles')
      .select('learned_preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const prefs = { ...((data?.learned_preferences ?? {}) as Record<string, unknown>) };
    const payload = buildMemoryPayload(next);
    prefs.screening_answers = payload.screening_answers;
    prefs.application_answers = payload.application_answers;
    prefs.always_confirm_questions = payload.always_confirm_questions;
    prefs.pending_screening_answers = nextPending;
    const { error } = await supabase
      .from('profiles')
      .update({ learned_preferences: prefs as never })
      .eq('user_id', user.id);
    setIsSaving(false);
    if (error) {
      setError(error.message);
      toast.error('Could not save. Your existing answers are untouched.');
      return false;
    }
    setAnswers(next);
    setPending(nextPending);
    if (message !== '') toast.success(message ?? 'Screening answers saved');
    return true;
  };

  const add = () => {
    if (!draft.question.trim() || (!draft.answer.trim() && !draft.optionLabels.trim())) {
      toast.error('Add the exact question and the answer you selected');
      return;
    }
    const entry = fromDraft(draft);
    persist(mergeAnswers(answers, [entry]));
    setDraft(EMPTY);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    if (!editDraft.question.trim()) {
      toast.error('The question cannot be empty');
      return;
    }
    const next = [...answers];
    next[editingIndex] = fromDraft(editDraft, answers[editingIndex]);
    persist(next, pending, 'Answer updated and re-confirmed');
    setEditingIndex(null);
  };

  const remove = (i: number) =>
    persist(answers.filter((_, idx) => idx !== i), pending, 'Answer deleted');

  const askAgain = (i: number) => {
    const next = [...answers];
    next[i] = { ...next[i], review_after: new Date().toISOString() };
    persist(next, pending, 'Marked for review - it will not be reused until you confirm it');
  };

  const reconfirm = (i: number) => {
    const next = [...answers];
    next[i] = { ...next[i], confirmed_at: new Date().toISOString(), review_after: undefined };
    persist(next, pending, 'Confirmed');
  };

  const acceptPending = (p: PendingScreeningAnswer, i: number) => {
    const entry: ScreeningAnswer = {
      ...p,
      question: p.question.trim(),
      answer: p.answer.trim(),
      scope: p.scope?.trim() || p.employer?.trim() || undefined,
      confirmed_at: new Date().toISOString(),
      source: 'extension',
    };
    persist(mergeAnswers(answers, [entry]), pending.filter((_, idx) => idx !== i), 'Remembered');
  };

  const dismissPending = (i: number) =>
    persist(answers, pending.filter((_, idx) => idx !== i), 'Suggestion dismissed');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return answers
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !q || a.question.toLowerCase().includes(q) || a.answer.toLowerCase().includes(q));
  }, [answers, filter]);

  const needsReview = answers.filter((a) => confirmationGate(a) !== null).length;

  const testResult = useMemo(
    () => (testQuestion.trim() ? matchAnswer(testQuestion, answers, { scope: testScope }) : null),
    [testQuestion, testScope, answers]
  );

  const payloadPreview = useMemo(() => JSON.stringify(buildMemoryPayload(answers), null, 2), [answers]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading screening answers
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Inbox className="h-5 w-5 text-primary" /> Answers to remember ({pending.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              You typed these on an application. Nothing is saved until you say so.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.map((p, i) => (
              <div key={`${p.question}-${i}`} className="rounded-lg border border-border p-4">
                <p className="font-medium">{p.question}</p>
                <p className="text-sm">{p.answer}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {p.employer && <Badge variant="outline">{p.employer}</Badge>}
                  {p.fieldType && <Badge variant="secondary">{FIELD_TYPE_LABELS[p.fieldType]}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button size="sm" className="min-h-11" disabled={isSaving} onClick={() => acceptPending(p, i)}>
                    <Check className="mr-2 h-4 w-4" /> Remember this
                  </Button>
                  <Button size="sm" variant="ghost" className="min-h-11" onClick={() => dismissPending(i)}>
                    Not now
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldQuestion className="h-5 w-5 text-primary" /> Add a screening answer
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Store the question exactly as the employer writes it. Only answers saved here are reused.
            Anything not saved is left for you. Applications are never submitted for you.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sa-question">Exact question text</Label>
            <Input
              id="sa-question"
              className="min-h-11"
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              placeholder="Are you legally authorised to work in Ireland?"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="sa-type">Field type</Label>
              <Select
                value={draft.fieldType}
                onValueChange={(v) => setDraft({ ...draft, fieldType: v as ScreeningFieldType })}
              >
                <SelectTrigger id="sa-type" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label htmlFor="sa-scope">Applies to (country or employer)</Label>
              <Input
                id="sa-scope"
                className="min-h-11"
                value={draft.scope}
                onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
                placeholder={`Ireland - leave blank for "${GLOBAL_SCOPE}"`}
              />
            </div>
          </div>
          {CHOICE_TYPES.includes(draft.fieldType) ? (
            <div>
              <Label htmlFor="sa-options">Selected option labels (comma separated)</Label>
              <Input
                id="sa-options"
                className="min-h-11"
                value={draft.optionLabels}
                onChange={(e) => setDraft({ ...draft, optionLabels: e.target.value })}
                placeholder="Yes"
              />
              <p className="pt-1 text-xs text-muted-foreground">
                Copy the labels as shown on the form, so the exact option can be selected and checked.
              </p>
            </div>
          ) : (
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
          )}
          <Button onClick={add} disabled={isSaving} className="min-h-11">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Confirm and save
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Saved answers ({answers.length})</CardTitle>
            {needsReview > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> {needsReview} need a fresh confirmation
              </Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="min-h-11 pl-9"
              placeholder="Search your answers"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {answers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No answers saved yet. Work authorisation is never assumed from where you live or from
              citizenship, so add each country you want answered.
            </p>
          ) : (
            visible.map(({ a, i }) => {
              const gate = confirmationGate(a);
              const isEditing = editingIndex === i;
              return (
                <div key={`${a.question}-${i}`} className="rounded-lg border border-border p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        className="min-h-11"
                        value={editDraft.question}
                        onChange={(e) => setEditDraft({ ...editDraft, question: e.target.value })}
                      />
                      <div className="grid gap-3 lg:grid-cols-3">
                        <Select
                          value={editDraft.fieldType}
                          onValueChange={(v) => setEditDraft({ ...editDraft, fieldType: v as ScreeningFieldType })}
                        >
                          <SelectTrigger className="min-h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          className="min-h-11 lg:col-span-2"
                          value={editDraft.scope}
                          onChange={(e) => setEditDraft({ ...editDraft, scope: e.target.value })}
                          placeholder={GLOBAL_SCOPE}
                        />
                      </div>
                      {CHOICE_TYPES.includes(editDraft.fieldType) ? (
                        <Input
                          className="min-h-11"
                          value={editDraft.optionLabels}
                          onChange={(e) => setEditDraft({ ...editDraft, optionLabels: e.target.value })}
                          placeholder="Selected option labels"
                        />
                      ) : (
                        <Textarea
                          rows={2}
                          value={editDraft.answer}
                          onChange={(e) => setEditDraft({ ...editDraft, answer: e.target.value })}
                        />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button className="min-h-11" onClick={saveEdit} disabled={isSaving}>
                          <Check className="mr-2 h-4 w-4" /> Save changes
                        </Button>
                        <Button variant="ghost" className="min-h-11" onClick={() => setEditingIndex(null)}>
                          <X className="mr-2 h-4 w-4" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-[240px] flex-1 space-y-1">
                        <p className="font-medium">{a.question}</p>
                        <p className="text-sm">{a.answer}</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="outline">{a.scope || GLOBAL_SCOPE}</Badge>
                          {a.fieldType && (
                            <Badge variant="secondary">{FIELD_TYPE_LABELS[a.fieldType]}</Badge>
                          )}
                          {a.confirmed_at && (
                            <Badge variant="secondary">
                              Confirmed {new Date(a.confirmed_at).toLocaleDateString('en-GB')}
                            </Badge>
                          )}
                          {gate && (
                            <Badge variant="outline" className="gap-1 text-amber-400">
                              <Clock className="h-3.5 w-3.5" /> {gate}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {gate && (
                          <Button
                            variant="outline"
                            className="min-h-11"
                            onClick={() => reconfirm(i)}
                            disabled={isSaving}
                          >
                            Still true
                          </Button>
                        )}
                        {!gate && (
                          <Button variant="ghost" className="min-h-11" onClick={() => askAgain(i)}>
                            Ask me again
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          aria-label="Edit answer"
                          onClick={() => {
                            setEditingIndex(i);
                            setEditDraft(toDraft(a));
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          className="min-h-11"
                          aria-label="Delete answer"
                          onClick={() => remove(i)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Collapsible>
        <Card>
          <CollapsibleTrigger className="flex w-full items-center justify-between p-6 text-left">
            <div>
              <p className="text-base font-semibold">Check what a form would get</p>
              <p className="text-sm text-muted-foreground">
                Advanced: test a question and see the exact data the extension reads.
              </p>
            </div>
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-3 lg:grid-cols-3">
                <Input
                  className="min-h-11 lg:col-span-2"
                  placeholder="Paste a question from a live form"
                  value={testQuestion}
                  onChange={(e) => setTestQuestion(e.target.value)}
                />
                <Input
                  className="min-h-11"
                  placeholder="Country or employer"
                  value={testScope}
                  onChange={(e) => setTestScope(e.target.value)}
                />
              </div>
              {testResult && (
                <div className="rounded-lg border border-border p-4 text-sm">
                  {testResult.kind === 'exact' && !testResult.needsConfirmation && (
                    <p>
                      Filled automatically with <span className="font-medium">{testResult.answer?.answer}</span>
                    </p>
                  )}
                  {testResult.kind === 'exact' && testResult.needsConfirmation && (
                    <p>
                      Suggests <span className="font-medium">{testResult.answer?.answer}</span> and asks you
                      first: {testResult.reason}
                    </p>
                  )}
                  {testResult.kind === 'suggestion' && (
                    <p>
                      Suggests <span className="font-medium">{testResult.answer?.answer}</span> for review
                      (worded differently, {Math.round(testResult.confidence * 100)}% match)
                    </p>
                  )}
                  {testResult.kind === 'none' && <p>Left blank for you to answer.</p>}
                </div>
              )}
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background p-4 text-xs">
                {payloadPreview}
              </pre>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
