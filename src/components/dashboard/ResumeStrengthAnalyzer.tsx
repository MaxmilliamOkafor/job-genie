import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { ATSScoreAnimator } from './ATSScoreAnimator';
import type { Profile } from '@/hooks/useProfile';

interface ResumeStrengthAnalyzerProps {
  profile: Profile;
}

interface CategoryScore {
  label: string;
  earned: number;
  max: number;
  suggestion: string | null;
}

function computeCategories(profile: Profile): CategoryScore[] {
  const categories: CategoryScore[] = [];

  // Contact info completeness (name, email, phone): 10 points
  const contactFields = [profile.first_name, profile.last_name, profile.email, profile.phone];
  const contactFilled = contactFields.filter((f) => !!f?.trim()).length;
  const contactScore = Math.round((contactFilled / contactFields.length) * 10);
  categories.push({
    label: 'Contact Info',
    earned: contactScore,
    max: 10,
    suggestion:
      contactScore < 10
        ? 'Add your full name, email, and phone number to maximize recruiter reach.'
        : null,
  });

  // LinkedIn present: 5 points
  const hasLinkedIn = !!profile.linkedin?.trim();
  categories.push({
    label: 'LinkedIn',
    earned: hasLinkedIn ? 5 : 0,
    max: 5,
    suggestion: hasLinkedIn ? null : 'Add your LinkedIn profile URL to boost credibility.',
  });

  // GitHub / Portfolio present: 5 points
  const hasGitHubOrPortfolio = !!profile.github?.trim() || !!profile.portfolio?.trim();
  categories.push({
    label: 'GitHub / Portfolio',
    earned: hasGitHubOrPortfolio ? 5 : 0,
    max: 5,
    suggestion: hasGitHubOrPortfolio
      ? null
      : 'Link your GitHub or portfolio to showcase your work.',
  });

  // Work experience (3+ entries): 20 points (proportional)
  const expCount = profile.professional_experience?.length ?? 0;
  const expScore = Math.min(Math.round((expCount / 3) * 20), 20);
  categories.push({
    label: 'Work Experience',
    earned: expScore,
    max: 20,
    suggestion:
      expScore < 20
        ? `Add ${3 - Math.min(expCount, 3)} more work experience ${3 - Math.min(expCount, 3) === 1 ? 'entry' : 'entries'} for a stronger profile.`
        : null,
  });

  // Education present: 10 points
  const hasEducation = (profile.education?.length ?? 0) > 0;
  categories.push({
    label: 'Education',
    earned: hasEducation ? 10 : 0,
    max: 10,
    suggestion: hasEducation ? null : 'Add your educational background.',
  });

  // Skills (10+ skills): 15 points (proportional)
  const skillCount = profile.skills?.length ?? 0;
  const skillScore = Math.min(Math.round((skillCount / 10) * 15), 15);
  categories.push({
    label: 'Skills',
    earned: skillScore,
    max: 15,
    suggestion:
      skillScore < 15
        ? `Add ${10 - Math.min(skillCount, 10)} more skills to reach the recommended 10+.`
        : null,
  });

  // Certifications present: 10 points
  const hasCerts = (profile.certifications?.length ?? 0) > 0;
  categories.push({
    label: 'Certifications',
    earned: hasCerts ? 10 : 0,
    max: 10,
    suggestion: hasCerts ? null : 'List any certifications to stand out from other applicants.',
  });

  // Achievements present: 5 points
  const hasAchievements = (profile.achievements?.length ?? 0) > 0;
  categories.push({
    label: 'Achievements',
    earned: hasAchievements ? 5 : 0,
    max: 5,
    suggestion: hasAchievements
      ? null
      : 'Highlight key achievements to demonstrate measurable impact.',
  });

  // Professional summary / cover letter: 10 points
  const hasCoverLetter = !!profile.cover_letter?.trim();
  categories.push({
    label: 'Professional Summary',
    earned: hasCoverLetter ? 10 : 0,
    max: 10,
    suggestion: hasCoverLetter
      ? null
      : 'Write a professional summary or cover letter to make a strong first impression.',
  });

  // ATS strategy configured: 10 points
  const hasATS = !!profile.ats_strategy?.trim();
  categories.push({
    label: 'ATS Strategy',
    earned: hasATS ? 10 : 0,
    max: 10,
    suggestion: hasATS
      ? null
      : 'Configure an ATS strategy to optimize your resume for applicant tracking systems.',
  });

  return categories;
}

function getStrengthLabel(score: number): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (score >= 80) return { text: 'Excellent', variant: 'default' };
  if (score >= 60) return { text: 'Good', variant: 'secondary' };
  if (score >= 40) return { text: 'Needs Work', variant: 'outline' };
  return { text: 'Weak', variant: 'destructive' };
}

function barColor(earned: number, max: number): string {
  const pct = max > 0 ? earned / max : 0;
  if (pct >= 1) return 'bg-emerald-500';
  if (pct >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

export function ResumeStrengthAnalyzer({ profile }: ResumeStrengthAnalyzerProps) {
  const categories = useMemo(() => computeCategories(profile), [profile]);

  const totalScore = useMemo(
    () => categories.reduce((sum, c) => sum + c.earned, 0),
    [categories],
  );

  const suggestions = useMemo(
    () => categories.filter((c) => c.suggestion !== null),
    [categories],
  );

  const strengthLabel = getStrengthLabel(totalScore);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg font-semibold">Profile Strength</CardTitle>
          <Badge variant={strengthLabel.variant}>{strengthLabel.text}</Badge>
        </div>
        <Link
          to="/profile"
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
        >
          Edit Profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall score */}
        <div className="flex items-center justify-center py-2">
          <ATSScoreAnimator score={totalScore} />
        </div>

        {/* Category breakdown */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Score Breakdown</p>
          {categories.map((cat) => {
            const pct = cat.max > 0 ? Math.round((cat.earned / cat.max) * 100) : 0;
            return (
              <div key={cat.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    {cat.earned === cat.max ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : cat.earned > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    {cat.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {cat.earned}/{cat.max}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(cat.earned, cat.max)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Improvement suggestions */}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Suggestions to Improve</p>
            <ul className="space-y-2">
              {suggestions.map((s) => (
                <li key={s.label}>
                  <Link
                    to="/profile"
                    className="flex items-start gap-2 rounded-lg border border-dashed p-2.5 text-sm hover:bg-muted/50 transition-colors"
                  >
                    <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <span>{s.suggestion}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
