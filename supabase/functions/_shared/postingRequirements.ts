// Requirement-only input shared by extraction, tailoring and keyword scores.
const EXCLUDED = /\b(?:benefits?|perks?|pay range|compensation|salary|remuneration|equity|stock|pension|what (?:we|you(?:'|’)ll) (?:offer|get)|why\s+\S+|about (?:us|the company|our)|who we are|our (?:story|values|culture|mission|team|people)|values|culture|diversity|inclusion|belonging|equal (?:employment )?opportunity|eeo|e-verify|legal|privacy|data protection|gdpr|accommodation|disability|how to apply|application (?:process|instructions)|hiring process|interview process|next steps|life at|our offer|package)\b/i;
const REQUIRED = /\b(?:requirements?|qualifications?|skills?|experience|responsibilities|duties|what you(?:'|’)ll do|what you(?:'|’)ll bring|what makes you a great fit|what we(?:'|’)re looking for|about you|you (?:will|should) have|must have|nice to have|the role|role overview|day to day|day-to-day|tech stack|technologies)\b/i;
const LEAD_IN = /^(?:we have|we offer|you(?:'|’)ll get|including)\s*:?$/i;
const NOTICE = /\b(?:your|applicant(?:'s|s')?|candidate(?:'s|s')?)\s+(?:personal\s+)?(?:data|information)\b|\b(?:process|collect|store|hold|retain|use)\s+(?:your\s+)?personal\s+(?:data|information)\b|\bprivacy\s+(?:notice|policy|statement)\b|\b(?:applicant|candidate|recruitment)\s+privacy\b|\bdata\s+protection\s+(?:notice|policy|statement)\b/i;
export const isApplicantDataNotice = (line: string): boolean => NOTICE.test(line);

export function stripNonRequirementSections(jobDescription: string): { text: string; removedSections: string[] } {
  const kept: string[] = [], removedSections: string[] = [];
  let skipping = false;
  const plain = String(jobDescription || '').replace(/<\/(?:p|div|li|h[1-6])>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/(?:^|\s)(Why [A-Za-z][\w &'-]{0,45}?|About us|Benefits?(?:\s*&\s*Perks)?|Perks|Pay Range|Compensation|What we offer|What You(?:'|’)ll Do|What You(?:'|’)ll Bring|What Makes You a Great Fit|Requirements|Responsibilities|Qualifications|Equal (?:Employment )?Opportunity|We have|We offer|You(?:'|’)ll get|Including):\s*/gi, '\n$1:\n');
  for (const line of plain.split(/\r?\n/)) {
    const heading = line.trim().replace(/^#{1,6}\s*|\*\*/g, '');
    const leadIn = LEAD_IN.test(heading);
    const headingShaped = heading && heading.length <= 80 && (/:$/.test(heading) || (!/[.!?]$/.test(heading) && heading.split(/\s+/).length <= 8 && /^[A-Z]/.test(heading)));
    const regulationRequirement = /\b(?:gdpr|data protection|privacy|legal)\b/i.test(heading) && /\b(?:experience|exposure|knowledge|understanding|working|with|skills?)\b/i.test(heading) && !isApplicantDataNotice(heading);
    if (!leadIn && headingShaped) {
      if (EXCLUDED.test(heading) && !regulationRequirement) {
        skipping = true;
        removedSections.push(heading.replace(/:$/, ''));
        continue;
      }
      // Unknown headings and short list lead-ins cannot reopen a benefits section.
      if (REQUIRED.test(heading) || regulationRequirement) skipping = false;
    }
    if (!skipping && !isApplicantDataNotice(line) && !/\b(?:equal[- ]opportunity employer|all qualified applicants|without regard to race)\b/i.test(line)) kept.push(line);
  }
  // Never restore removed boilerplate, even when it is most of the posting.
  return { text: kept.join('\n').trim(), removedSections };
}