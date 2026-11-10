// The final CV rules of the 10 Nov extension brief, in order, as one pure
// step so tests exercise exactly what the function runs. Idempotent: the
// extension re-runs its own clean-up on every preview and download, and a
// second pass here returns the same text.
import { capKeywordAdditions, dropUnheldQualifications, removeSelfTalkFromCv, restorePostingGrafts, tidySkillsSection } from "../_shared/documentRules.ts";

export function finalCvRules(cv: string, ctx: { profileText: string; profileBullets: string[]; posting?: string }): { cv: string; notes: string[]; summaryChanged: boolean } {
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
  return { cv: self.cv, notes, summaryChanged: self.summaryChanged };
}
