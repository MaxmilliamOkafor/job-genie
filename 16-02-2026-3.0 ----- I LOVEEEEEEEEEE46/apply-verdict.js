/**
 * Job Genie - Tailoring Focus (pre-submission guidance)
 *
 * WHY THIS EXISTS
 * ---------------
 * The pipeline computes a genuine qualification match, then auto-injects
 * gap-closing keywords to lift the score. Only the inflated number was
 * ever stored, and nothing rendered it -- so the user never learned WHICH
 * parts of their CV were doing the work and which gaps were still open.
 *
 * This module turns that data into TAILORING DIRECTION: for the gaps the
 * JD cares about most, what should this CV lead with, emphasise, or
 * reframe to make the strongest honest case for this specific role?
 *
 * It is deliberately NOT a go/no-go gate. This is tailoring software --
 * the user decides where to apply; our job is to make each application
 * as strong as it can truthfully be. Every item below is phrased as an
 * action, never as a discouragement, and never suggests claiming
 * experience the candidate does not have.
 *
 * Pure logic, no DOM, no network.
 */
(function (global) {
  'use strict';

  // Qualification types the JD weights most heavily. Gaps here deserve a
  // deliberate tailoring angle rather than a passing keyword mention.
  const HIGH_LEVERAGE_TYPES = new Set([
    'experience_years', 'education', 'certification', 'technical_skill',
  ]);

  const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?\s*(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|hands[- ]on\s+)?(?:experience|background)/i;

  // JD side: the LARGEST stated minimum is the real bar.
  function extractRequiredYears(jdText) {
    if (!jdText) return null;
    const re = new RegExp(YEARS_RE.source, 'gi');
    let m;
    let max = null;
    while ((m = re.exec(String(jdText))) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > 0 && n <= 40) max = max === null ? n : Math.max(max, n);
    }
    return max;
  }

  // CV side: an explicit claim wins; otherwise approximate from the span
  // of years present. Never used to fabricate tenure -- only to decide
  // whether to advise leading with scope instead of tenure.
  function extractCandidateYears(cvText) {
    if (!cvText) return null;
    const text = String(cvText);
    const explicit = text.match(new RegExp(YEARS_RE.source, 'i'));
    if (explicit) {
      const n = parseInt(explicit[1], 10);
      if (!isNaN(n) && n > 0 && n <= 40) return n;
    }
    const yearMatches = text.match(/\b(19[89]\d|20[0-4]\d)\b/g);
    if (yearMatches && yearMatches.length >= 2) {
      const earliest = Math.min.apply(null, yearMatches.map(Number));
      const span = new Date().getFullYear() - earliest;
      if (span > 0 && span <= 40) return span;
    }
    return null;
  }

  // Turn an unmet qualification into an honest tailoring instruction.
  function actionFor(qualType, label) {
    const l = String(label || '').trim().slice(0, 100);
    switch (qualType) {
      case 'education':
        return `"${l}". Lead with equivalent hands-on experience and any certifications up front, so a screener sees the capability before the credential.`;
      case 'certification':
        return `"${l}". If you hold anything adjacent, surface it in the header/certifications; if in progress, say so plainly.`;
      case 'technical_skill':
        return `"${l}". If you have genuine adjacent experience, name it explicitly in the summary and the closest bullet; don't leave the screener to infer it.`;
      case 'domain_knowledge':
        return `"${l}". Connect your nearest domain experience to this one in the summary line.`;
      default:
        return `"${l}". Work this into the bullet where you genuinely did it, using the JD's exact wording.`;
    }
  }

  /**
   * @returns {{focus,label,score,priorities,gaps,summary,advice}}
   */
  function evaluate({ thresholdResult = null, jdText = '', originalCV = '' } = {}) {
    const priorities = [];  // high-leverage gaps -> deliberate tailoring angle
    const gaps = [];        // lighter gaps -> mention where truthful

    // Genuine fit: the pre-injection score, so the user knows how much of
    // the match is real vs. keyword-assisted.
    let score = null;
    if (thresholdResult && typeof thresholdResult.initialScore === 'number') {
      score = Math.round(thresholdResult.initialScore);
    }

    // Seniority framing: when the JD's bar is above evidenced tenure, the
    // winning move is to lead with scope/impact rather than years.
    const requiredYears = extractRequiredYears(jdText);
    const candidateYears = extractCandidateYears(originalCV);
    if (requiredYears !== null && candidateYears !== null && candidateYears + 1 < requiredYears) {
      priorities.push(
        `JD asks for ${requiredYears}+ years; your CV evidences about ${candidateYears}. ` +
        `Lead with scope and impact: your largest system, biggest number, most senior decision, ` +
        `so the screener reads seniority from results rather than tenure.`
      );
    }

    const breakdown = (thresholdResult && thresholdResult.matchResults &&
      thresholdResult.matchResults.qualificationBreakdown) || [];
    for (const q of breakdown) {
      if (q.met || q.type !== 'required') continue;
      const label = String(q.qualification || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      if (HIGH_LEVERAGE_TYPES.has(q.qualType) && (q.confidence || 0) < 0.25) {
        priorities.push(actionFor(q.qualType, label));
      } else {
        gaps.push(label.slice(0, 110));
      }
    }

    // Focus level describes HOW MUCH tailoring work this role needs --
    // never whether to apply.
    let focus;
    if (priorities.length >= 2 || (score !== null && score < 55)) focus = 'heavy';
    else if (priorities.length === 1 || (score !== null && score < 75)) focus = 'targeted';
    else focus = 'light';

    const LABELS = {
      light: '🟢 Strong alignment, light tailoring',
      targeted: '🟡 Good angle available, targeted tailoring',
      heavy: '🔵 Needs a strong angle, heavy tailoring',
    };
    const ADVICE = {
      light: 'Your CV already speaks to this role. Make sure the metrics are real and the project links load.',
      targeted: 'Lead with the priority below and this becomes a genuinely competitive application.',
      heavy: 'Build the case around the priorities below. Lead with your strongest transferable evidence, and keep every claim true.',
    };

    const parts = [];
    if (score !== null) parts.push(`Genuine fit ${score}% before tailoring`);
    if (priorities.length) parts.push(`${priorities.length} priorit${priorities.length > 1 ? 'ies' : 'y'} to lead with`);
    if (gaps.length) parts.push(`${gaps.length} keyword gap${gaps.length > 1 ? 's' : ''}`);

    return {
      focus,
      label: LABELS[focus],
      score,
      requiredYears,
      candidateYears,
      priorities: priorities.slice(0, 4),
      gaps: gaps.slice(0, 4),
      summary: parts.join(' · '),
      advice: ADVICE[focus],
    };
  }

  const ApplyVerdict = { evaluate, extractRequiredYears, extractCandidateYears };
  global.ApplyVerdict = ApplyVerdict;
  if (typeof module !== 'undefined' && module.exports) module.exports = ApplyVerdict;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
