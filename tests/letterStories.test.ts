import { describe, expect, it } from 'bun:test';
import { checkAgainstBullet, copiesRun, COPY_RUN, type ProfileBullet } from '../supabase/functions/tailor-application/letterSlots';

// The letter tells one or two stories from your profile lines, in new words.
// Before 5 Nov the checks rejected almost every story, so letters came back
// as one sentence and CV bullets were pasted in. These are real lines from
// the profile with the kind of story the letter should carry.
const line = (n: number, company: string, text: string): ProfileBullet => ({ n, company, text });
const TOOLS = ['React', 'TypeScript', 'GraphQL', 'Python', 'AWS', 'EKS', 'Terraform', 'Helm', 'Airflow', 'SQL Server', 'Kubernetes', 'Salesforce'];
const L = {
  meta: line(1, 'Meta', 'Rebuilt the internal campaign diagnostics tool in React, TypeScript and GraphQL. The old tool was slow enough that sales engineers raised tickets instead of using it and the rewrite cleared most of that queue.'),
  bids: line(2, 'Accenture', 'Served as technical lead on five pre-sales bids, authoring the architecture sections and presenting solutions to client CTOs.'),
  feed: line(3, 'Citigroup', 'Met every regulatory deadline after three late submissions in a single year by automating the daily regulatory data feed (Airflow, SQL Server).'),
  clin: line(4, 'SolimHealth', 'Shipped every release on the date committed to the clinical team. Owned the product roadmap and wrote the requirements and acceptance criteria for each release.'),
};

describe('a story told in new words passes', () => {
  const ok = (story: string, l: ProfileBullet) => {
    const f = checkAgainstBullet(story, l, TOOLS);
    expect(f).toEqual([]);
    expect(copiesRun(story, [l.text])).toBe(false);
  };
  it('the diagnostics tool, told from the sales engineers\' side', () =>
    ok('At Meta, sales engineers had stopped using our campaign diagnostics tool because it was too slow, and raised tickets instead. I rebuilt it in React, TypeScript and GraphQL, and most of that queue went away.', L.meta));
  it('pre-sales bids, told as the client CTOs\' need', () =>
    ok('At Accenture, client CTOs wanted to see how a solution would work before they bought it. As technical lead on five pre-sales bids, I wrote the architecture sections and presented the solutions to them.', L.bids));
  it('the late regulatory submissions', () =>
    ok('At Citigroup, three regulatory submissions had been late in a single year. I automated the daily data feed with Airflow and SQL Server, and every deadline after that was met.', L.feed));
  it('release dates kept for clinicians', () =>
    ok('At SolimHealth, the clinical team needed releases on the dates they could plan around. I owned the roadmap, wrote the requirements and acceptance criteria, and shipped every release on the date committed.', L.clin));
});

describe('an invented claim still fails', () => {
  const bad = (story: string, l: ProfileBullet) => expect(checkAgainstBullet(story, l, TOOLS).length).toBeGreaterThan(0);
  it('a figure the line does not have', () => bad('At Accenture, I led five pre-sales bids that won 30 million in contracts for the firm.', L.bids));
  it('a tool the line does not name', () => bad('At Citigroup, three submissions had been late. I automated the daily feed with Airflow and Kubernetes.', L.feed));
  it('an outcome the line does not record', () => bad('At Accenture, I led five pre-sales bids, strengthened client relationships and grew revenue across the region.', L.bids));
  it('the wrong employer', () => bad('At Google, I rebuilt the internal campaign diagnostics tool in React.', L.meta));
});

describe('a pasted bullet still fails', () => {
  it('the line reordered, with no story around it', () => {
    const ifrs = line(5, 'Citigroup', 'Presented the IFRS 9 staging review to the risk committee and executives, which adopted it into policy');
    expect(checkAgainstBullet('At Citigroup, I presented the IFRS 9 staging review to executives and the risk committee, which adopted it into policy.', ifrs, TOOLS).some((f) => /retells line/.test(f))).toBe(true);
  });
  it(`${COPY_RUN} words in a row from the line is a copy`, () => {
    expect(copiesRun('At Meta, I rebuilt the internal campaign diagnostics tool in React, TypeScript and GraphQL.', [L.meta.text])).toBe(true);
  });
});

import { buildSlotLetter, profileBullets } from '../supabase/functions/tailor-application/letterSlots';
describe('the opening tells the story, not the CV line', () => {
  const experience = [{ company: 'Northwind', title: 'Analyst', bullets: ['Automated the client accounts feed after three late submissions in a single year, and it met every deadline thereafter'] }];
  const ctx: any = { experience, bullets: profileBullets(experience), company: 'Acme', story: '', cvText: '', description: 'Acme runs client accounts with strict deadlines.', tools: [], profileText: '', requirements: ['client accounts', 'deadline', 'submissions'] };
  const base = { name: 'M', contact: 'c', greeting: 'Dear Hiring Team,', story: '', role: 'Account Analyst', company: 'Acme', rightToWork: '', notice: '', signOff: 'Kind regards,', employers: ['Northwind'] };
  it('uses the model\'s checked story clause for the opening', async () => {
    const reply = JSON.stringify({ opening: { line: 1, problem: 'Three submissions had been late in a single year.', clause: 'automated the client accounts feed, and every deadline after that was met' }, results: [] });
    const out = await buildSlotLetter(base, ctx, async () => reply);
    const body = (out?.letter || '');
    expect(body).toContain('Three submissions had been late in a single year. At Northwind, I automated the client accounts feed, and every deadline after that was met.');
    expect(body).not.toContain('Automated the client accounts feed after three late submissions in a single year, and it met every deadline thereafter'.toLowerCase().slice(0, 40));
  });
});
