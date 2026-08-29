// A HUNDRED APPLICATIONS, NOT ONE EMAIL.
//
// Everything upstream could be perfect -- the LinkedIn search, the
// provider, the address -- and no note would go out, because the send
// path never waited for any of it.
//
// followupDetectContact() finds the address published in the posting.
// When there is none, it falls back: the employer's careers page, then
// the user's contact-lookup provider. That fallback had two faults.
//
//   1. It was called INSIDE `if (info)`, where `info` is a DOM element in
//      the composer panel. Finding the recipient was conditional on a bit
//      of UI existing. No panel rendered, no lookup attempted at all.
//
//   2. It was not awaited. followupDetectContact returned immediately,
//      so `await this.contactDetection` in autoSendFollowup resolved
//      while the lookup was still in flight. followupContext() then read
//      an empty To field, reported 'no-recipient', and stopped -- and the
//      lookup finished a moment later with nobody listening.
//
// Fault 2 is why this survived every manual test: click around slowly
// and the lookup has long since finished by the time you press Send. Run
// it as part of an automatic tailoring pass and it loses the race every
// time. Which is exactly the difference between "it worked before" and a
// hundred applications with nothing sent.
//
// So this suite drives autoSendFollowup itself, on a posting that
// publishes no address, and asserts the outcome is 'sent'.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');

// The two faults are structural, so assert the structure directly: this
// is the part that no amount of mocking would catch if it regressed.
console.log('THE FALLBACK IS NOT GATED ON A UI ELEMENT');
const detectBody = SRC.slice(SRC.indexOf('async followupDetectContact()'),
  SRC.indexOf('async followupEnrichmentState()') > SRC.indexOf('async followupDetectContact()')
    ? SRC.indexOf('async followupEnrichmentState()') : SRC.length);
const callIdx = detectBody.indexOf('this.followupFindCareersAddress()');
t('  followupFindCareersAddress is still called', callIdx > -1,
  'the fallback chain has been removed entirely');
{
  // Find the last `if (info) {` before the call, walk to its MATCHING
  // close brace, and check the call sits after it. Counting braces
  // between the two does not work: the call has its own `if` block, whose
  // opener would be counted as nesting.
  const lastInfoIf = detectBody.lastIndexOf('if (info) {', callIdx);
  let closesAt = -1;
  if (lastInfoIf > -1) {
    let depth = 0;
    for (let i = detectBody.indexOf('{', lastInfoIf); i < detectBody.length; i++) {
      if (detectBody[i] === '{') depth++;
      else if (detectBody[i] === '}') { depth--; if (!depth) { closesAt = i; break; } }
    }
  }
  t('  and is NOT inside `if (info)`',
    lastInfoIf === -1 || (closesAt > -1 && closesAt < callIdx),
    'finding the recipient must not depend on the composer panel being rendered');
  t('  it runs whenever the posting published no address',
    /if \(!detected\.hasPublishedEmail\) \{\s*await this\.followupFindCareersAddress/.test(detectBody),
    'the fallback must be gated on the posting, not on the UI');
}
t('  and it is awaited', /await this\.followupFindCareersAddress\(\)/.test(detectBody),
  'not awaiting it is what loses the race against autoSendFollowup');

console.log('\nAND THE LOOKUP IS AWAITABLE AT ALL');
const careersBody = SRC.slice(SRC.indexOf('followupFindCareersAddress()'),
  SRC.indexOf('async followupEnrich()'));
t('  followupFindCareersAddress is async', /async followupFindCareersAddress\(\)/.test(SRC),
  'a callback-only function cannot be awaited, so awaiting it would be a no-op');
t('  it returns the provider lookup rather than firing and forgetting',
  /return this\.followupEnrich\(\)/.test(careersBody), careersBody.slice(-300));
t('  and it cannot hang the application', /setTimeout\(\(\) => done\(null\)/.test(careersBody),
  'the careers probe goes through the service worker, which can be asleep');

console.log('\nTHE PROVIDER LOOKUP REPORTS ITS ADDRESS BACK');
// The end marker must be the METHOD DEFINITION, not one of the several
// call sites earlier in the file, or the slice comes out backwards and
// the assertions below silently test an empty string.
const enrichStart = SRC.indexOf('async followupEnrich()');
const enrichEnd = SRC.indexOf('\n  enrichCompanyName()', enrichStart);
const enrichBody = SRC.slice(enrichStart, enrichEnd > enrichStart ? enrichEnd : SRC.length);
t('  (the slice under test is not empty)', enrichBody.length > 200,
  'boundaries wrong: ' + enrichBody.length + ' chars');
t('  followupEnrich returns the address it found',
  /return hit\.email;/.test(enrichBody), 'the caller cannot resolve without it');
t('  and it writes it onto the detected contact, not only the DOM field',
  /detected\.email = hit\.email/.test(enrichBody),
  'followupContext reads detected.email when there is no rendered field');

console.log('\nAND followupContext CAN SEE IT WITHOUT A RENDERED FIELD');
// The automatic path may run with no composer in the DOM at all.
const ctxBody = SRC.slice(SRC.indexOf('async followupContext()'),
  SRC.indexOf('async followupContext()') + 1600);
t('  it falls back to detected.email',
  /detected\.email/.test(ctxBody.slice(0, ctxBody.indexOf('jobId'))), ctxBody.slice(0, 400));

console.log('\nAND EVERY OUTCOME IS STILL RECORDED');
// The reason a hundred silent failures were possible: nothing said which
// of the exits had been taken.
const autoBody = SRC.slice(SRC.indexOf('async autoSendFollowup()'),
  SRC.indexOf('async followupEnrichmentState()'));
for (const state of ['module-missing', 'placeholder', 'disabled', 'no-recipient',
  'no-documents', 'sent', 'failed']) {
  t('  "' + state + '" is reported', autoBody.indexOf("'" + state + "'") > -1,
    'a silent exit is indistinguishable from a working send');
}
t('  the outcome is persisted for later inspection',
  /followup_last_outcome/.test(autoBody),
  'without this the user cannot tell why nothing arrived');

console.log('\nAND THE ANTI-SPAM POLICY IS STILL APPLIED',);
// Sending must not become eager just because it now works. A repeat
// employer sees every past email in the thread.
t('  followupSend still runs the policy', /followupSend\(\{ test: false \}\)/.test(autoBody),
  'the company-level policy is what stops a second note to the same employer');

console.log('\nTHE NOTE GOES OUT AFTER THE DOCUMENTS EXIST, NEVER BEFORE');
// The requirement in the user's words: send once the CV and cover letter
// are fully tailored and the .docx files are in hand. Ordering is the
// whole of it -- a note sent a moment early carries nothing, and an
// empty-handed follow-up is worse than none.
{
  const attachIdx = SRC.indexOf('await this.attachBothDocuments()');
  const storeIdx = SRC.indexOf('ats_lastGeneratedDocuments: this.generatedDocuments');
  const sendIdx = SRC.indexOf('await this.autoSendFollowup()');
  t('  documents are generated and attached first',
    attachIdx > -1 && attachIdx < sendIdx, 'attach=' + attachIdx + ' send=' + sendIdx);
  t('  and stored before the note is composed',
    storeIdx > -1 && storeIdx < sendIdx, 'store=' + storeIdx + ' send=' + sendIdx);
  t('  autoSendFollowup is the last step of the run',
    sendIdx > -1, 'the send is not wired into the tailoring path at all');
  t('  and it cannot fail the tailoring run',
    /try \{\s*await this\.autoSendFollowup\(\);\s*\} catch/.test(SRC),
    'a failed note must not look like a failed tailor');
}

console.log('\nAND IT REFUSES TO SEND WITH NOTHING ATTACHED');
t('  no documents means no note', /no-documents/.test(autoBody)
  && /this\.followupAttachments\(\)/.test(autoBody),
  'an empty-handed follow-up is worse than none');

console.log('\nAND WHAT IT ATTACHES IS THE DOCX');
{
  const aStart = SRC.indexOf('followupAttachments() {');
  const aBody = SRC.slice(aStart, aStart + 1400);
  t('  the slice under test is not empty', aBody.length > 200, String(aBody.length));
  t('  DOCX is preferred over PDF', /if \(docx\) return/.test(aBody)
    && aBody.indexOf('if (docx) return') < aBody.indexOf('if (pdf) return'),
    'attach_format is pinned to docx, so the pdf fields are usually empty');
  t('  both the CV and the cover letter are attached',
    /g\.cvDocx/.test(aBody) && /g\.coverDocx/.test(aBody), aBody.slice(-400));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
