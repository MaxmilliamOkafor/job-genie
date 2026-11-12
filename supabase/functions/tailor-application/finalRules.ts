// The final CV rules of the 10 Nov extension brief, in order, as one pure
// step so tests exercise exactly what the function runs. Idempotent: the
// extension re-runs its own clean-up on every preview and download, and a
// second pass here returns the same text.
import { capKeywordAdditions, dropUnheldQualifications, removeSelfTalkFromCv, restorePostingGrafts, tidySkillsSection } from "../_shared/documentRules.ts";
import { dropPageTitleWrapper, noForeignUsAuthorisation, noGraftedAbility, noHomeRelocation, oneEntryPerLanguage, skillsReadRight, strayGloss } from "../_shared/postingLessons.ts";

const BULLET = /^(\s*(?:[•●▪◦‣∙·*]|-)\s+)(.*)$/;
const LABEL_LINE = /^\s*[^:]{2,40}:\s/;

/**
 * The 12 Nov Stripe Dublin lessons on a CV: the work leads each bullet, no
 * bracketed word inside a noun phrase, one entry per language, word-named
 * products only when the profile shows them, half-phrases written as skills,
 * no relocation to the home city, no US authorisation for a job outside the US,
 * and no "Job Application for" wrapper.
 */
export function cvReadsRight(cv: string, ctx: { profileText: string; homeCity?: string; jobCountry?: string | null }): { cv: string; notes: string[] } {
  const notes: string[] = [];
  const lines = String(cv || "").split("\n").map((l) => {
    const m = BULLET.exec(l);
    if (m) {
      const body = noGraftedAbility(m[2]);
      if (body !== m[2]) notes.push(`bullet reworded so the work leads: ${body}`);
      return m[1] + body;
    }
    if (LABEL_LINE.test(l)) return l;
    const next = strayGloss(l);
    if (next !== l) notes.push("bracketed word inside a phrase removed");
    return next;
  });
  let next = lines.join("\n");
  next = oneEntryPerLanguage(next);
  const skills = skillsReadRight(next, ctx.profileText);
  notes.push(...skills.notes);
  next = noForeignUsAuthorisation(noHomeRelocation(dropPageTitleWrapper(skills.cv), ctx.homeCity || ""), ctx.jobCountry ?? null);
  return { cv: next === cv ? cv : next, notes };
}

export function finalCvRules(cv: string, ctx: { profileText: string; profileBullets: string[]; posting?: string; homeCity?: string; jobCountry?: string | null }): { cv: string; notes: string[]; summaryChanged: boolean } {
  const notes: string[] = [];
  const grafts = restorePostingGrafts(cv, ctx.profileBullets, ctx.posting || "", ctx.profileText);
  if (grafts.restored.length) notes.push(`posting duties grafted onto bullets, profile line restored: ${grafts.restored.join(" | ")}`);
  const capped = capKeywordAdditions(grafts.cv, ctx.profileBullets);
  if (capped.cut.length) notes.push(`keyword additions over the limit removed: ${capped.cut.join(", ")}`);
  const skills = tidySkillsSection(capped.cv, ctx.profileText);
  notes.push(...skills.notes);
  const quals = dropUnheldQualifications(skills.cv, ctx.profileText);
  if (quals.removed.length) notes.push(`qualifications not held removed: ${quals.removed.join(" | ")}`);
  const self = removeSelfTalkFromCv(quals.cv, ctx.profileBullets);
  if (self.removed.length) notes.push(`self-referential wording removed: ${self.removed.join(" | ")}`);
  const right = cvReadsRight(self.cv, ctx);
  notes.push(...right.notes);
  return { cv: right.cv, notes, summaryChanged: self.summaryChanged };
}
