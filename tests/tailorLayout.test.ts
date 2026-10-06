import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  acceptRewrite, applyLetterDate, bulletLengthOk, bulletTarget, acceptLetterRewording, copiesBullet, dropClaimSentences, findCopiedSentences, findBadBullets, shapeCoverLetter, formatLetterDate, formatSkillsSection, coverLetterShapeBlock, rightToWorkStatement, enforceLetterRightToWork, employerToolSentences, dropSentences, stripLetterBanned, isFragment, findFragments, letterSignOff, applySignOff, letterToolList, isToolName, protectedSentences,
} from '../supabase/functions/tailor-application/guards';

const one = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs.'; // 95
const long = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs, and then rolled the same approach out to two other teams.'; // ~150

describe('bullet length', () => {
  it('accepts 85-105 and 175-210 only', () => {
    expect(bulletLengthOk(59)).toBe(false); expect(bulletLengthOk(60)).toBe(true); expect(bulletLengthOk(85)).toBe(true); expect(bulletLengthOk(105)).toBe(true);
    expect(bulletLengthOk(106)).toBe(false); expect(bulletLengthOk(174)).toBe(false);
    expect(bulletLengthOk(175)).toBe(true); expect(bulletLengthOk(210)).toBe(true); expect(bulletLengthOk(211)).toBe(false);
  });
  it('finds only out-of-range experience bullets', () => {
    const cv = `PROFESSIONAL EXPERIENCE\nEngineer | Acme | 2020 - 2023\n• ${one}\n• ${long}\n\nTECHNICAL SKILLS\nPython`;
    const bad = findBadBullets(cv);
    expect(one.length).toBeGreaterThanOrEqual(85);
    expect(bad.length).toBe(1);
    expect(bad[0].text).toBe(long);
  });
  it('rejects a rewrite that loses a number or keyword', () => {
    expect(acceptRewrite(long, one, ['Python', 'SQL'])).toBe(true);
    expect(acceptRewrite(long, one.replace('Python and ', ''), ['Python'])).toBe(false);
    expect(bulletTarget(140)).toBe('one line, 85 to 105 characters');
    expect(bulletTarget(174)).toBe('one line, 85 to 105 characters');
    expect(bulletTarget(211)).toBe('two lines, 175 to 210 characters');
    expect(acceptRewrite('Cut costs 30% using Python across teams', one, [])).toBe(false);
  });
});

describe('headline', () => {
  it('never writes a headline line into the CV text', () => {
    const src = readFileSync('supabase/functions/tailor-application/index.ts', 'utf8');
    expect(src).not.toContain('chooseHeldHeadline(');
    expect(src).not.toContain('enforceTargetRoleLine(result.tailoredResume)');
  });
});

describe('bullet rewrite adds nothing', () => {
  it('rejects longer rewrites and new content words', () => {
    expect(acceptRewrite(long, one + ' enhancing overall system efficiency.'.slice(0, 5), ['Python'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine days to three with Python and SQL jobs, enhancing user experience.', ['Python', 'SQL'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine working days to three with Python and SQL jobs.', ['Python', 'SQL'])).toBe(false);
    expect(acceptRewrite(long, 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs.', ['Python', 'SQL'])).toBe(true);
  });
});

describe('claim removal', () => {
  it('drops the whole sentence, never only the words', () => {
    const { text, removed } = dropClaimSentences('Dear Hiring Team,\nAt Acme I built a Figma library where I implemented Figma to refine user experiences. I cut costs by 20%.', ['Figma']);
    expect(text).toBe('Dear Hiring Team,\nI cut costs by 20%.');
    expect(removed.length).toBe(1);
    expect(text).not.toContain('implemented to');
  });
});

describe('cover letter shape', () => {
  const bullet = 'Cut month-end close from nine days to three by moving reconciliations into Python and SQL jobs';
  it('four body paragraphs kept, no Also, copied bullet kept when not reworded, header kept', () => {
    const letter = 'Dear Hiring Team,\n\nAcme needs faster reporting.\n\nAlso, I know SQL well.\n\n' + bullet + '. Your team grows fast.\n\nI can start in a month.\n\nKind regards,\nJane Doe';
    const { text } = shapeCoverLetter(letter, [bullet], { name: 'Jane Doe', contact: 'Dublin | +353 1 | jane@x.com' });
    const paras = text.split('\n\n');
    expect(paras[0]).toBe('Jane Doe\nDublin | +353 1 | jane@x.com');
    expect(paras[1]).toBe('Dear Hiring Team,');
    expect(paras.length).toBe(7);
    expect(paras[3]).toBe('I know SQL well.');
    expect(paras[5]).toBe('I can start in a month.');
    expect(text).toContain(bullet);
    expect(copiesBullet(bullet + '.', [bullet])).toBe(true);
    expect(text.split('\n\n').some((p) => /^Also,/.test(p))).toBe(false);
  });
  it('five body paragraphs: extra middle paragraph joins paragraph 2; company and closing paragraphs stay on their own', () => {
    const letter = 'Dear Hiring Team,\n\nAcme needs an engineer who can secure its platform.\n\nLed ISO 27001 certification at Accenture across 4 delivery centres, closing 120 audit findings in 6 months.\n\nDelivered a £3.2m cost reduction at Accenture by consolidating 14 legacy reporting tools into Power BI.\n\nAcme is opening a Dublin office this year, which matters to me as a Dublin resident.\n\nI am an Irish citizen with full right to work in the UK. My notice period is one month. I am available for a call whenever suits you.\n\nKind regards,\nJane Doe';
    const { text, notes } = shapeCoverLetter(letter, [], { name: 'Jane Doe', contact: '' });
    const paras = text.split('\n\n');
    expect(paras.length).toBe(7);
    expect(notes.some((n) => n.includes('into paragraph 2'))).toBe(true);
    expect(paras[2]).toBe('Acme needs an engineer who can secure its platform.');
    expect(paras[3]).toContain('ISO 27001');
    expect(paras[3]).toContain('£3.2m');
    expect(paras[4]).toContain('Dublin office');
    expect(paras[5]).toContain('notice period is one month');
  });
});

describe('cover letter rules', () => {
  it('1. opening story kept word for word, then the sentence naming role and company', () => {
    const story = 'At nineteen I rebuilt the payroll system for my family bakery over one summer.';
    const letter = 'Dear Hiring Team,\n\nWhen I was nineteen I rebuilt a bakery payroll. I am applying for the Data Engineer role at Acme.\n\nResults.\n\nAcme fact.\n\nI am available for a call whenever suits you.\n\nKind regards,\nJane Doe';
    const { text } = shapeCoverLetter(letter, [], { name: 'Jane Doe', contact: '' }, {}, { openingStory: story, company: 'Acme', role: 'Data Engineer' });
    expect(text.split('\n\n')[2]).toBe(story + ' I am applying for the Data Engineer role at Acme.');
    expect(coverLetterShapeBlock('', '', '', story, 'London')).toContain(`word for word, never reworded: "${story}"`);
    expect(coverLetterShapeBlock('', '', '', '', 'London')).toContain('single strongest result');
  });
  it('2. shape: 200 to 280 words, four paragraphs, company fact never invented, call line', () => {
    const b = coverLetterShapeBlock('', 'one month', 'Irish citizen, full right to work in the UK and Ireland', '', 'London');
    expect(b).toContain('200 to 280 words, 4 paragraphs');
    expect(b).toContain('Never invent a company fact.');
    expect(b).toContain('"I am available for a call whenever suits you."');
  });
  it('3. a run of 8 or more words matching the CV counts as copied', () => {
    const cv = 'Built a fraud scoring service in Go that handled two million card payments every day';
    expect(copiesBullet('At Revolut I built a fraud scoring service in Go that handled payments.', [cv])).toBe(true);
    expect(copiesBullet('I designed fraud scoring in Go for two million daily payments.', [cv])).toBe(false);
  });
  it('4. right to work stated only when supported', () => {
    const letter = 'Dear Hiring Team,\n\nI am authorized to work in the United States. My notice period is one month.\n\nKind regards,';
    expect(rightToWorkStatement('Irish', ['IE'], 'Austin, TX')).toBe('');
    const none = enforceLetterRightToWork(letter, '');
    expect(none.text).not.toContain('authorized');
    expect(none.text).toContain('notice period');
    expect(enforceLetterRightToWork(letter, 'EU citizen, no visa sponsorship needed').text).not.toContain('United States');
    expect(enforceLetterRightToWork('I am an Irish citizen with full right to work in the UK.', 'Irish citizen, full right to work in the UK and Ireland').text).toContain('Irish citizen');
  });
  it('5. a tool is named at an employer only when that employer names it', () => {
    const exp = [{ company: 'Accenture', description: 'Built dashboards in Power BI' }, { company: 'Stripe', description: 'Wrote Python services' }];
    const letter = 'Dear Hiring Team,\n\nAt Accenture I built Power BI dashboards. At Accenture I wrote Python services. At Stripe I wrote Python services.';
    expect(employerToolSentences(letter, exp, ['Python', 'Power BI'])).toEqual(['At Accenture I wrote Python services.']);
    expect(dropSentences(letter, ['At Accenture I wrote Python services.'])).not.toContain('At Accenture I wrote Python');
  });
  it('6. banned phrases removed', () => {
    const out = stripLetterBanned('This role aligns with your mission. I utilize robust tools. Also, I significantly cut costs effectively. Additionally, I leverage SQL. Furthermore, I lead. Alongside that, I mentor. I welcome the opportunity to talk. I built impactful, seamless actionable insights, showing my ability to lead.');
    for (const b of ['aligns with your mission', 'I welcome the opportunity', 'impactful', 'leverage', 'utilize', 'seamless', 'robust', 'significantly', 'effectively', 'showing my ability', 'Also,', 'Additionally,', 'Furthermore,', 'Alongside that,', 'actionable insights']) expect(out).not.toContain(b);
    expect(out).toContain('I use tools.');
    expect(out).toContain('I cut costs.');
    expect(stripLetterBanned('I am excited about the opportunity at Acme. I cut costs.')).toBe('I cut costs.');
  });
  it('7. fragments are found and reworded, keeping facts', () => {
    expect(isFragment('Js, having authored three internal libraries, I led the move.')).toBe(true);
    expect(isFragment('having authored three libraries.')).toBe(true);
    expect(isFragment('I authored three internal libraries.')).toBe(false);
    const frag = 'Js, having authored three internal libraries used by 40 engineers.';
    const letter = `Dear Hiring Team,\n\nOpening.\n\n${frag}\n\nFact.\n\nClose.\n\nKind regards,`;
    expect(findFragments(letter)).toEqual([frag]);
    const good = 'I authored three internal libraries used by 40 engineers.';
    expect(acceptLetterRewording(frag, good, 'authored three internal libraries used by 40 engineers')).toBe(true);
    expect(shapeCoverLetter(letter, [], { name: '', contact: '' }, { [frag]: good }).text).toContain(good);
  });
  it('8. sign-off by country', () => {
    expect(letterSignOff('London')).toBe('Kind regards,');
    expect(letterSignOff('Dublin, Ireland')).toBe('Kind regards,');
    expect(letterSignOff('Austin, TX')).toBe('Sincerely,');
    expect(applySignOff('Body.\n\nBest regards,\nJane', 'Austin, TX')).toBe('Body.\n\nSincerely,\nJane');
    expect(applySignOff('Body.\n\nSincerely,\nJane', 'Cambridge, UK')).toBe('Body.\n\nKind regards,\nJane');
  });
  it('no em dashes in the rules', () => {
    expect(coverLetterShapeBlock('Whitney Ross', 'one month', 'x', 'story', 'London')).not.toContain('\u2014');
  });
});

describe('cover letter rule fixes', () => {
  it('tools: only real tool names count, matched against the whole experience entry', () => {
    const acc = 'At Accenture, I led the security architecture for a regulated financial services client and closed all but three gaps in their ISO 27001 pre-audit.';
    const exp = [{ company: 'Accenture', title: 'Security Architect', bullets: ['Automated evidence collection in Terraform for 12 accounts'] }];
    const tools = letterToolList([], ['audit', 'security', 'compliance', 'fraud', 'identity verification', 'healthcare', 'leadership', 'Terraform', 'Go', 'React', 'PostgreSQL', 'AWS', 'Salesforce']);
    expect(tools).toEqual(['Terraform', 'Go', 'React', 'PostgreSQL', 'AWS', 'Salesforce']);
    expect(employerToolSentences(`Dear Hiring Team,\n\n${acc}`, exp, tools)).toEqual([]);
    expect(employerToolSentences('Dear Hiring Team,\n\nAt Accenture I automated evidence in Terraform.', exp, tools)).toEqual([]);
    expect(employerToolSentences('Dear Hiring Team,\n\nAt Accenture I built React dashboards.', exp, tools)).toEqual(['At Accenture I built React dashboards.']);
    expect(isToolName('audit')).toBe(false);
    expect(isToolName('ServiceNow')).toBe(true);
  });
  it('right to work: "citizen" alone is not a right-to-work sentence', () => {
    const letter = 'Dear Hiring Team,\n\nI protected citizen data for 3 million users. I am an EU citizen. As an Irish citizen I need no visa.\n\nSincerely,';
    const out = enforceLetterRightToWork(letter, '');
    expect(out.text).toContain('I protected citizen data for 3 million users.');
    expect(out.text).not.toContain('I am an EU citizen');
    expect(out.text).not.toContain('As an Irish citizen');
    expect(rightToWorkStatement('Irish', ['IE'], 'Austin, TX')).toBe('');
  });
  it('the opening story comes out word for word', () => {
    const story = 'At Revolut I traced a fraud ring that had significantly drained 400 accounts. I am an Irish citizen who never forgot it.';
    const letter = `Dear Hiring Team,\n\n${story} I am applying for the Fraud Analyst role at Acme.\n\nAt Revolut I wrote React tools. I cut losses by 20%.\n\nAcme fact.\n\nClose.\n\nKind regards,`;
    const protect = protectedSentences(story);
    const exp = [{ company: 'Revolut', description: 'Python' }];
    let t = enforceLetterRightToWork(letter, '', protect).text;
    const bad = employerToolSentences(t, exp, ['React', 'fraud'], protect);
    t = dropSentences(t, [...bad, ...protect], protect);
    t = stripLetterBanned(t, story);
    expect(t).toContain(story);
    expect(t).not.toContain('React');
    expect(stripLetterBanned(`${story} Also, I lead.`, story)).toBe(`${story} I lead.`);
  });
});

describe('skills format', () => {
  it('outputs labelled lines in order and drops non-skills', () => {
    const cv = 'TECHNICAL SKILLS\nTools: Docker, Python, React, KYC, Irish citizen, Industrial Designers\nLanguages & Citizenship: English (fluent), French\nSoft: Stakeholder Management\n\nEDUCATION\nBSc';
    const { text, dropped } = formatSkillsSection(cv);
    expect(text).toContain('Programming: Python\nFrameworks: React\nCloud & DevOps: Docker\nRisk & Compliance: KYC\nProfessional: Stakeholder Management\nLanguages: English (fluent), French');
    expect(dropped).toEqual(['Irish citizen', 'Industrial Designers']);
    expect(text).toContain('\nEDUCATION');
  });
  it('keeps team and stakeholder keywords; governance and protection are Risk & Compliance', () => {
    const { text, dropped } = formatSkillsSection('TECHNICAL SKILLS\nCross-functional Teams, Stakeholders, Data Governance, Data Protection, Pandas, Software Engineers');
    expect(dropped).toEqual(['Software Engineers']);
    expect(text).toContain('Data & ML: Pandas\nRisk & Compliance: Data Governance, Data Protection\nProfessional: Cross-functional Teams, Stakeholders');
  });
});

describe('copied bullets are reworded, never deleted', () => {
  const b1 = 'Led ISO 27001 certification at Accenture across 4 delivery centres, closing 120 audit findings in 6 months';
  const b2 = 'Delivered a £3.2m cost reduction at Accenture by consolidating 14 legacy reporting tools into Power BI';
  const cv = `PROFESSIONAL EXPERIENCE\n• ${b1}\n• ${b2}`;
  const letter = `Dear Hiring Team,\n\nAcme needs an engineer who can secure its platform.\n\n${b1}. ${b2}.\n\nI am available to talk at your convenience.\n\nKind regards,\nJane Doe`;
  it('keeps the ISO 27001 and £3.2m sentences, reworded or as they were', () => {
    const copied = findCopiedSentences(letter, [b1, b2]);
    expect(copied.length).toBe(2);
    const good = 'At Accenture I led ISO 27001 certification across 4 delivery centres, closing 120 audit findings in 6 months.';
    const bad = 'At Accenture I led ISO 27001 certification, transforming security culture.';
    expect(acceptLetterRewording(copied[0], good, cv)).toBe(true);
    expect(acceptLetterRewording(copied[0], bad, cv)).toBe(false);
    const rew = { [copied[0]]: good };
    const { text } = shapeCoverLetter(letter, [b1, b2], { name: 'Jane Doe', contact: '' }, rew);
    expect(text).toContain('ISO 27001');
    expect(text).toContain('£3.2m');
    expect(text).toContain(good);
    expect(text).toContain(b2);
    const plain = shapeCoverLetter(letter, [b1, b2], { name: 'Jane Doe', contact: '' }).text;
    expect(plain).toContain(b1);
    expect(plain).toContain(b2);
    expect(plain.split('\n\n').every((p) => p.trim())).toBe(true);
  });
});

describe('letter date', () => {
  const d = new Date(Date.UTC(2026, 9, 5));
  it('formats by country', () => {
    expect(formatLetterDate(d, false)).toBe('5 October 2026');
    expect(applyLetterDate('Date: 01/02/2026\nDear Hiring Team,\nBody', 'Austin, TX', d)).toBe('October 5, 2026\n\nDear Hiring Team,\nBody');
    expect(applyLetterDate('Re: Data Engineer\nDear Hiring Team,\nBody', 'Berlin, Germany', d)).toBe('5 October 2026\n\nRe: Data Engineer\nDear Hiring Team,\nBody');
  });
});

import { assembleLetter, buildSlotLetter, checkAgainstBullet, checkResult, checkCompanyFact, checkWhy, composeResult, copiesRun, isStoryLine, parseReply, profileBullets, orderResults, unsupportedClaims, bannedIn, letterBody, LETTER_WORD_FLOOR, COPY_RUN } from '../supabase/functions/tailor-application/letterSlots';
import { letterRightToWorkSentence } from '../supabase/functions/tailor-application/guards';

describe('cover letter slots', () => {
  const experience = [
    { company: 'Meta', title: 'Software Engineer', bullets: ['Cut p99 latency by 38% for the ads delivery platform by parallelising downstream calls in Go across twelve services'] },
    { company: 'Accenture', title: 'Security Consultant', bullets: ['Led the ISO 27001 pre-audit for a regulated bank client and closed all but 3 control gaps before the external audit'] },
    { company: 'SolimHealth', title: 'Software Engineer', bullets: ['Built the clinician dashboard in React for cognitive screening of patients used by forty clinics'] },
    { company: 'Citigroup', title: 'Software Engineer', bullets: ['Reworked how anti money laundering alerts were grouped and scored in Python, clearing a two-year backlog', 'Built Python reconciliation jobs that cut month-end close from nine days to three for the payments team'] },
  ];
  const bullets = profileBullets(experience);
  const story = 'At Citigroup, the anti money laundering team had a two-year backlog of alerts, most of them false. I reworked how those alerts were grouped and scored in Python, and the team cleared the backlog without missing genuine cases.';
  const ctx = {
    experience, bullets, company: 'Nametag', story: '',
    cvText: 'Software Engineer | Meta\n• Cut p99 latency by 38% for the ads delivery platform by parallelising downstream calls in Go across twelve services',
    description: 'Nametag is building identity verification for account recovery and help desk resets, stopping fraud.',
    tools: ['Python', 'Terraform', 'Go', 'React'],
    profileText: 'Software Engineer Security Consultant ISO 27001 Python Go React',
    requirements: ['Go', 'React', 'security'],
  };

  it('copy limit is 12 words in a row, so a close retelling of the line passes', () => {
    expect(COPY_RUN).toBe(12);
    const t = composeResult('cut p99 latency by 38% for the ads delivery platform, parallelising downstream Go calls', 'Meta');
    expect(copiesRun(t, ctx.cvText.split('\n'))).toBe(false);
    expect(checkResult(t, bullets[0], ctx)).toEqual([]);
    expect(copiesRun('At Meta, I cut p99 latency by 38% for the ads delivery platform by parallelising downstream calls in Go across twelve services.', ctx.cvText.split('\n'))).toBe(true);
  });

  it('writes every result as "At X, I ..." and never "... at X." at the end', () => {
    expect(composeResult('I cut latency by 38% at Meta.', 'Meta')).toBe('At Meta, I cut latency by 38%.');
    expect(composeResult('Built the dashboard', 'SolimHealth')).toBe('At SolimHealth, I built the dashboard.');
    expect(composeResult('At Meta, I cut latency', 'Meta')).toBe('At Meta, I cut latency.');
  });

  it('never uses the line the story is based on; other lines from that employer are fine', () => {
    expect(isStoryLine(bullets[3], story)).toBe(true);
    expect(isStoryLine(bullets[4], story)).toBe(false);
    expect(checkResult(composeResult('reworked how anti money laundering alerts were grouped and scored in Python', 'Citigroup'), bullets[3], { ...ctx, story }).join()).toContain('opening story');
    expect(checkResult(composeResult('built Python reconciliation jobs that cut month-end close from nine days to three', 'Citigroup'), bullets[4], { ...ctx, story })).toEqual([]);
  });

  it('a result must come from its numbered line: 60% of words, no added number, tool or listed word', () => {
    const b = bullets[0];
    expect(checkAgainstBullet('At Meta, I cut latency by 45% with Go.', b, ctx.tools).join()).toContain('45');
    expect(checkAgainstBullet('At Meta, I cut p99 latency by 38% with Terraform.', b, ctx.tools).join()).toContain('Terraform');
    expect(checkAgainstBullet('At Meta, I transformed the ads delivery platform, cutting p99 latency by 38%.', b, ctx.tools).join()).toContain('transformed');
    expect(checkAgainstBullet('At Meta, I enhanced user engagement across a seamless journey for many happy customers.', b, ctx.tools).join()).toContain('60%');
  });

  it('banned openers and filler as patterns, and no "where I" after the target company', () => {
    for (const t of ['I am eager to apply for this.', "I'm thrilled to apply.", 'This connects to my experience at Meta.', 'Its emphasis on identity matters.', 'This resonates with me.', 'I successfully led it.']) expect(bannedIn(t).length).toBeGreaterThan(0);
    expect(checkResult('At Meta, I cut p99 latency by 38% for Nametag, where I worked.', bullets[0], ctx).join()).toContain('where I');
  });

  it('companyFact and why', () => {
    expect(checkCompanyFact('Nametag is building identity verification for account recovery.', ctx)).toEqual([]);
    expect(checkCompanyFact('Your posting says: "Nametag is building".', ctx).join()).toContain('start with');
    expect(checkWhy('Stopping fraud is the problem I worked on at Citigroup.', 'Nametag is stopping fraud.', ['At Citigroup, I stopped fraud.'], ctx)).toEqual([]);
    expect(checkWhy('This connects to my experience.', 'Nametag is stopping fraud.', [], ctx).length).toBeGreaterThan(0);
  });

  it('never claims an unheld title or field', () => {
    expect(unsupportedClaims('As a Full Stack Engineer, I cut latency.', experience, ctx.profileText).length).toBe(1);
    expect(unsupportedClaims('With a strong background in product design, I led work.', experience, ctx.profileText).length).toBe(1);
  });

  it('parses picks with line numbers', () => {
    const r = parseReply('```json\n{"opening":{"line":1,"clause":"cut latency"},"results":[{"line":2,"clause":"led it"}],"companyFact":"Nametag x","why":"y"}\n```');
    expect(r.opening?.line).toBe(1); expect(r.results[0].line).toBe(2); expect(r.companyFact).toBe('Nametag x');
  });

  it('never names the same employer in two sentences in a row', () => {
    const emp = ['Meta', 'Accenture'];
    expect(orderResults(['At Meta, a.', 'At Meta, b.', 'At Accenture, c.'], 'Intro.', emp)).toEqual(['At Meta, a.', 'At Accenture, c.', 'At Meta, b.']);
  });

  const base = { name: 'Max Okafor', contact: 'Dublin, Ireland | +353 08 742 61508 | max@x.com', greeting: 'Dear Hiring Team,', role: 'Full Stack Engineer', company: 'Nametag', notice: '1 month', signOff: 'Sincerely,', employers: ['Meta', 'Accenture', 'SolimHealth', 'Citigroup'] };

  it('a failed "why" leaves paragraph 3 as the company fact alone', () => {
    const body = letterBody({ ...base, story, results: ['At Meta, I a.'], companyFact: 'Nametag is building identity verification', rightToWork: '' });
    expect(body[2]).toBe('Nametag is building identity verification.');
    expect(body[0].startsWith(story)).toBe(true);
    const t = assembleLetter({ ...base, story, results: ['At Meta, I a.'], companyFact: 'Nametag x', rightToWork: '' });
    expect(t).toContain('+353 08 742 61508');
  });

  it('replaces a failed result with the next best line from a different employer, up to three, until 150 words', async () => {
    const calls: string[] = [];
    const replies = [
      JSON.stringify({ results: [
        { line: 1, clause: 'cut p99 latency by 38% for the ads delivery platform, parallelising downstream Go calls' },
        { line: 2, clause: 'transformed everything with Terraform at a bank' },
      ], companyFact: 'Nametag is building identity verification for account recovery.', why: 'This connects to my experience.' }),
      JSON.stringify({ results: [
        { line: 3, clause: 'built the clinician dashboard in React for cognitive screening of patients across forty clinics' },
        { line: 5, clause: 'built Python reconciliation jobs that cut month-end close from nine days to three for payments' },
      ], why: 'Stopping fraud in account recovery is the alert problem I worked on.' }),
      JSON.stringify({ results: [] }),
    ];
    const logs: string[] = [];
    const out = await buildSlotLetter({ ...base, story, rightToWork: '' }, { ...ctx, story }, async (p) => { calls.push(p); return replies[calls.length - 1] ?? '{}'; }, (m) => logs.push(m));
    expect(out).not.toBeNull();
    const r = out!.parts.results;
    expect(r.length).toBe(3);
    expect(new Set(r.map((x) => x.match(/^At ([^,]+),/)![1])).size).toBe(3);
    expect(r.every((x) => /^At [^,]+, I /.test(x))).toBe(true);
    expect(calls[0]).not.toContain('3. [Citigroup]');
    expect(calls[1]).not.toContain('[Meta]');
    expect(out!.used.join()).not.toContain('line 2');
    expect(logs.join()).toContain('line 2 failed');
    expect(LETTER_WORD_FLOOR).toBe(150);
  });

  it('opening is tied to a numbered line too', async () => {
    const reply = JSON.stringify({ opening: { line: 1, clause: 'cut latency by 99% with Terraform' }, results: [], companyFact: 'Nametag is building identity verification.' });
    const out = await buildSlotLetter({ ...base, story: '', rightToWork: '' }, ctx, async () => reply);
    expect(out!.parts.opening).toBeUndefined();
  });
});

describe('right to work sentences', () => {
  it('UK jobs: only Irish or British citizenship, as a full sentence', () => {
    expect(letterRightToWorkSentence('Irish', ['IE'], 'London, UK')).toBe('As an Irish citizen, I have the right to work in the UK.');
    expect(letterRightToWorkSentence('British', [], 'Dublin, Ireland')).toBe('As a British citizen, I have the right to work in Ireland.');
    expect(letterRightToWorkSentence('EU Citizen', ['IE', 'GB'], 'London, UK')).toBe('');
    expect(rightToWorkStatement('EU Citizen', ['IE', 'GB'], 'London, UK')).toBe('');
  });
  it('other countries: full sentence, never "X citizen, no visa sponsorship needed"', () => {
    expect(letterRightToWorkSentence('EU Citizen', [], 'Berlin, Germany')).toBe('As an EU citizen, I have the right to work in Germany without visa sponsorship.');
    expect(letterRightToWorkSentence('EU Citizen', ['US'], 'Seattle, WA')).toBe('I have the right to work in the United States without visa sponsorship.');
    expect(letterRightToWorkSentence('Irish', ['IE'], 'Cambridge, MA')).toBe('');
  });
});

import { restorePunctuation, checkWhy as checkWhy2 } from '../supabase/functions/tailor-application/letterSlots';
describe('company paragraph tightening', () => {
  it('restores the posting punctuation of a company fact', () => {
    const d = 'Nametag is building identity verification for the moments that matter most: account recovery, help desk resets and high-risk transactions. More.';
    expect(restorePunctuation('Nametag is building identity verification for the moments that matter most account recovery help desk resets and high-risk transactions.', d)).toBe('Nametag is building identity verification for the moments that matter most: account recovery, help desk resets and high-risk transactions.');
  });
  it('why: "identity" does not match "identifies", and "similar to" is refused', () => {
    const ctx: any = { company: 'Nametag', story: '', experience: [], profileText: '' };
    expect(checkWhy2('Identity verification matters here.', 'Nametag builds identity verification.', ['At SolimHealth, I built a product that identifies decline.'], ctx).join()).toContain('same problem');
    expect(checkWhy2('Fraud matters, similar to my fraud work.', 'Nametag stops fraud.', ['At Citigroup, I cut fraud.'], ctx).join()).toContain('similar to');
  });
});
