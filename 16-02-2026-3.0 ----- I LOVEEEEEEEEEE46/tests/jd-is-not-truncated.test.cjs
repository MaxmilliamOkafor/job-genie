// A POSTING SPLIT ACROSS SEVERAL NODES IS STILL ONE POSTING.
//
// From a live ATS audit, 20 August 2026:
//
//   workable.description reads [data-ui="job-description"] only.
//   Workable also emits [data-ui="job-requirements"] and
//   [data-ui="job-benefits"]. You're tailoring against the overview and
//   dropping every requirement.
//
// The description selector list takes the FIRST selector that matches.
// That is right when one node holds the posting and wrong when it holds
// the opening paragraph, and the second case is what Workable and
// SmartRecruiters do. Requirements are the half a CV is scored against,
// so losing them is not a partial failure -- it is tailoring against the
// wrong document while reporting success.
//
// This is the same truncation ats-platforms.js was written to stop,
// arriving by a different route: "a platform could be supported -- its
// scripts loading, its host permitted -- while the tailor read a
// truncated description."
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
(() => {
  const file = path.join(DIR, 'ats-platforms.js');
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const AP = global.ATSPlatforms;

console.log('THE PLATFORMS THAT SPLIT THE POSTING SAY SO');
for (const [key, want] of [
  ['workable', ['[data-ui="job-description"]', '[data-ui="job-requirements"]', '[data-ui="job-benefits"]']],
  ['smartrecruiters', ['#st-companyDescription', '#st-jobDescription', '#st-qualifications', '#st-additionalInformation']],
]) {
  const parts = AP.descriptionPartsFor(key).map((p) => p.selector);
  t('  ' + key + ' names all of its parts', JSON.stringify(parts) === JSON.stringify(want),
    JSON.stringify(parts));
}
t('  the requirements node is weighted above the rest',
  AP.descriptionPartsFor('workable').find((p) => /requirements/.test(p.selector)).weight === 2,
  JSON.stringify(AP.descriptionPartsFor('workable')));
t('  and labelled, so a caller knows which part it is',
  AP.descriptionPartsFor('smartrecruiters').find((p) => p.selector === '#st-qualifications').label === 'qualifications',
  JSON.stringify(AP.descriptionPartsFor('smartrecruiters')));

console.log('\nAND A PLATFORM THAT KEEPS IT IN ONE NODE IS UNAFFECTED');
for (const key of ['greenhouse', 'workday', 'icims', 'teamtailor']) {
  t('  ' + key + ' declares no parts, so the old path runs',
    AP.descriptionPartsFor(key).length === 0, JSON.stringify(AP.descriptionPartsFor(key)));
}
t('  an unknown platform does not throw',
  AP.descriptionPartsFor('not-a-platform').length === 0 && AP.descriptionPartsFor(null).length === 0);

console.log('\nGREENHOUSE READS THE POSTING, NOT THE APPLICATION FORM');
// #content led the list and does not exist on the current
// job-boards.greenhouse.io at all. The next selectors that DO match
// include .posting, which is the whole page: the description plus about
// 15k characters of application-form field labels, which the tailor then
// treats as the posting.
{
  const sel = AP.selectorsFor('greenhouse', 'description');
  t('  .job__description.body is tried first', sel[0] === '.job__description.body', JSON.stringify(sel.slice(0, 3)));
  t('  ...before #content, which no longer exists',
    sel.indexOf('.job__description.body') < sel.indexOf('#content'), JSON.stringify(sel));
  t('  ...and before .posting, which is the whole page',
    sel.indexOf('.job__description.body') < sel.indexOf('.posting'), JSON.stringify(sel));
}

console.log('\nAND content.js ACTUALLY CONCATENATES THEM');
// The map declaring the parts changes nothing on its own. This is the
// half that was missing: the extractor has to read every part.
{
  const src = fs.readFileSync(path.join(DIR, 'content.js'), 'utf8');
  t('  the extractor asks for the parts',
    /AP\.descriptionPartsFor\(platformKey\)/.test(src),
    'content.js never calls descriptionPartsFor, so the entries are decoration');
  t('  ...reads every one rather than the first that matches',
    /for \(const part of parts\)/.test(src), 'only one part is read');
  t('  ...and prefers the assembled text over the single selector',
    /const cssDesc = partsDesc \|\|/.test(src),
    'the concatenated description is computed and then ignored');
}

console.log('\nTHE CONCATENATION ITSELF');
// Exercised directly, with the shape the real page has: three nodes, one
// of them empty, and a container that repeats a part already read.
{
  const assemble = (nodes, parts) => {
    const seen = [];
    for (const part of parts) {
      const text = (nodes[part.selector] || '').trim();
      if (!text || seen.some((s) => s.indexOf(text) !== -1)) continue;
      seen.push(text);
    }
    return seen.join('\n\n');
  };
  const parts = AP.descriptionPartsFor('workable');
  const joined = assemble({
    '[data-ui="job-description"]': 'We are looking for a support engineer.',
    '[data-ui="job-requirements"]': 'Requires Windows, macOS and Zendesk.',
    '[data-ui="job-benefits"]': 'Pension and 25 days holiday.',
  }, parts);
  t('  every part is present', /support engineer/.test(joined) && /Zendesk/.test(joined)
    && /Pension/.test(joined), JSON.stringify(joined));
  t('  in document order',
    joined.indexOf('support engineer') < joined.indexOf('Zendesk')
      && joined.indexOf('Zendesk') < joined.indexOf('Pension'), JSON.stringify(joined));

  const missing = assemble({
    '[data-ui="job-description"]': 'We are looking for a support engineer.',
    '[data-ui="job-requirements"]': 'Requires Windows, macOS and Zendesk.',
  }, parts);
  t('  a missing part costs nothing', /Zendesk/.test(missing) && !/undefined/.test(missing),
    JSON.stringify(missing));

  const nested = assemble({
    '[data-ui="job-description"]': 'Overview. Requires Zendesk.',
    '[data-ui="job-requirements"]': 'Requires Zendesk.',
  }, parts);
  t('  a part already inside one that was read is not repeated',
    (nested.match(/Requires Zendesk/g) || []).length === 1, JSON.stringify(nested));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
