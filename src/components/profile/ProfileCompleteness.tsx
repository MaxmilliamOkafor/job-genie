/**
 * Completeness prompt.
 *
 * Coverage after tailoring is now bounded by what the profile records, not by
 * matching: every remaining gap measured across live postings was a term the
 * profile never stated. This banner names the empty fields, counts the skills on
 * record, and links to the field. It never blocks saving.
 */

import { AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Gap {
  label: string;
  section: string;
}

/** A thin skills list is the single biggest cause of a missing requirement. */
const SKILLS_THIN_BELOW = 20;

export function profileGaps(profile: any): Gap[] {
  const gaps: Gap[] = [];
  const education: any[] = Array.isArray(profile?.education) ? profile.education : [];

  const missingYears = education.filter(
    (e) => !String(e?.start_year ?? '').trim() || !String(e?.end_year ?? '').trim(),
  );
  if (missingYears.length) {
    gaps.push({
      label: `Education years missing on ${missingYears.length} ${missingYears.length === 1 ? 'degree' : 'degrees'} — autofill leaves every graduation-year field blank without them`,
      section: 'section-education',
    });
  }

  const missingSubject = education.filter((e) => !String(e?.field_of_study ?? '').trim());
  if (missingSubject.length) {
    gaps.push({
      label: `Field of study missing on ${missingSubject.length} ${missingSubject.length === 1 ? 'degree' : 'degrees'}`,
      section: 'section-education',
    });
  }

  if (!String(profile?.phone ?? '').trim()) {
    gaps.push({ label: 'Phone number is empty', section: 'section-personal' });
  }

  const authorised: string[] = Array.isArray(profile?.work_authorized_countries)
    ? profile.work_authorized_countries
    : [];
  if (authorised.length === 0) {
    gaps.push({ label: 'No work-authorised countries recorded', section: 'section-work-auth' });
  }

  return gaps;
}

export function ProfileCompleteness({ profile }: { profile: any }) {
  const gaps = profileGaps(profile);
  const skillCount = Array.isArray(profile?.skills) ? profile.skills.length : 0;
  const skillsThin = skillCount < SKILLS_THIN_BELOW;

  if (!gaps.length && !skillsThin) return null;

  const jump = (section: string) => {
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Finish your profile to lift your match</p>
            <p className="text-xs text-muted-foreground">
              Every unmatched requirement measured across recent postings was a detail
              missing here, not a matching failure. Saving is never blocked.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5">
          {gaps.map((gap) => (
            <li key={gap.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{gap.label}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs shrink-0"
                onClick={() => jump(gap.section)}
              >
                Go there <ArrowRight className="h-3 w-3" />
              </Button>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {skillCount} skill{skillCount === 1 ? '' : 's'} recorded
              {skillsThin
                ? ` — thin. Postings ask for terms you may hold but have not stated; a term that is not here cannot be counted.`
                : ''}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs shrink-0"
              onClick={() => jump('section-skills')}
            >
              Go there <ArrowRight className="h-3 w-3" />
            </Button>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
