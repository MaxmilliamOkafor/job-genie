/**
 * LinkedIn Easy Apply, in a real browser, with the toggle ON.
 *
 * This is the one LinkedIn behaviour that matters: press Easy Apply, fill
 * every step from the saved profile, advance, and submit. None of it is
 * visible to a manifest test -- the filler is registered at RUNTIME by
 * background.js (jg-linkedin-autofill), so whether it fires depends on
 * service-worker state, the toggle defaults and the SPA's DOM, not on
 * anything static.
 *
 * The fixture is a four-step Easy Apply modal built the way LinkedIn
 * builds one: an artdeco dialog mounted outside the job container, footer
 * buttons labelled by aria-label, required fields marked with
 * aria-required, and a React-ish re-render between steps. Step three is
 * the Yes/No surface -- selects and radio groups, including the
 * sponsorship polarity trap and the "commute to this location" question
 * that used to resolve to the user's city and stall the flow.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');

const PORT = 8452;
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Project Manager | Acme | LinkedIn</title></head>
<body>
<div class="jobs-search__job-details">
  <h1 class="job-details-jobs-unified-top-card__job-title">Microsoft Dynamics 365 Project Manager</h1>
  <div class="job-details-jobs-unified-top-card__company-name">Acme Corp</div>
  <div class="jobs-description__content"><p>Lead Dynamics 365 delivery in Dublin. Email talent@acme-corp.test.</p></div>
  <button class="jobs-apply-button" aria-label="Easy Apply to Microsoft Dynamics 365 Project Manager"><span>Easy Apply</span></button>
</div>
<div id="modal-root"></div>
<div id="submitted" hidden>APPLICATION SUBMITTED</div>
<script>
// A LinkedIn-shaped Easy Apply modal: four steps, footer buttons keyed by
// aria-label, fields marked aria-required, re-rendered on each advance.
var step = 0;
var STEPS = [
  { name: 'Contact info', next: 'Continue to next step', html:
      '<label for="fn">First name</label><input id="fn" name="firstName" aria-required="true">' +
      '<label for="ln">Last name</label><input id="ln" name="lastName" aria-required="true">' +
      '<label for="em">Email address</label><input id="em" name="email" type="email" aria-required="true">' +
      '<label for="cc">Phone country code</label>' +
      '<select id="cc" name="country_code" aria-required="true">' +
      '<option value="">Select</option><option>Ireland (+353)</option><option>United Kingdom (+44)</option></select>' +
      '<label for="ph">Mobile phone number</label><input id="ph" name="phone" type="tel" aria-required="true">' },
  // The resume step. LinkedIn renders previously-uploaded resumes as radio
  // cards with the input visually hidden behind a styled label, and blocks
  // Continue until one is chosen. Nothing preselected here, which is the
  // case that used to stall the whole run.
  { name: 'Resume', next: 'Continue to next step', html:
      '<div class="jobs-document-upload-redesign-card__container">' +
      '<input type="radio" id="r1" name="resume" class="visually-hidden">' +
      '<label for="r1">Maxmilliam_Okafor_CV.pdf &mdash; uploaded 3 days ago</label>' +
      '<input type="radio" id="r2" name="resume" class="visually-hidden">' +
      '<label for="r2">old_resume_2019.pdf &mdash; uploaded 4 years ago</label>' +
      '</div>' +
      '<button type="button" id="upload">Upload resume</button>' },
  { name: 'Additional questions', next: 'Continue to next step', html:
      '<label for="yrs">How many years of project management experience do you have?</label>' +
      '<input id="yrs" name="years_pm" type="text" aria-required="true">' +
      '<label for="auth">Are you legally authorised to work in Ireland?</label>' +
      '<select id="auth" name="work_auth" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' +
      '<label for="city">City</label><input id="city" name="city" aria-required="true">' },
  // The Yes/No surface, in the two shapes LinkedIn uses: a select and a
  // radio group. "commute" is the one that used to resolve to the user's
  // city and stall the flow, and sponsorship is the polarity trap.
  { name: 'Screening questions', next: 'Review your application', html:
      '<label for="spon">Will you now or in the future require sponsorship for an employment visa?</label>' +
      '<select id="spon" name="sponsorship" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' +
      '<fieldset class="form-element"><legend>Are you able to reliably commute to this job\\'s location?</legend>' +
      '<label for="cm1">Yes</label><input type="radio" id="cm1" name="commute" value="yes" aria-required="true">' +
      '<label for="cm2">No</label><input type="radio" id="cm2" name="commute" value="no"></fieldset>' +
      '<fieldset class="form-element"><legend>Have you previously worked for this company?</legend>' +
      '<label for="pw1">Yes</label><input type="radio" id="pw1" name="prev" value="yes" aria-required="true">' +
      '<label for="pw2">No</label><input type="radio" id="pw2" name="prev" value="no"></fieldset>' +
      '<label for="age">Are you at least 18 years of age?</label>' +
      '<select id="age" name="age18" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' +
      '<label for="felony">Have you ever been convicted of a felony?</label>' +
      '<select id="felony" name="felony" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' +
      '<label for="skill">Do you have experience with Power BI?</label>' +
      '<select id="skill" name="powerbi" aria-required="true"><option value="">Select an option</option><option>Yes</option><option>No</option></select>' +
      '<label for="bg">I consent to a background check</label><input type="checkbox" id="bg" name="bg">' +
      // LinkedIn's real shape for a picker: an <input role="combobox">
      // typeahead whose listbox is rendered outside the control and tied
      // to it by aria-controls. A plain setValue types the text and never
      // commits a selection, so the step stays invalid.
      '<label for="cty">Country/Region</label>' +
      '<input id="cty" name="country" role="combobox" aria-autocomplete="list" aria-controls="cty-list" aria-required="true" autocomplete="off">' +
      '<ul id="cty-list" role="listbox"><li role="option">France</li><li role="option">Ireland</li><li role="option">Spain</li></ul>' },
  { name: 'Review', next: 'Submit application', html:
      '<p>Review your application</p>' +
      '<label for="follow">Follow Acme Corp to stay up to date with their news</label>' +
      '<input type="checkbox" id="follow" name="followCompany">' },
];
function render() {
  var s = STEPS[step];
  document.getElementById('modal-root').innerHTML =
    '<div class="artdeco-modal jobs-easy-apply-modal" role="dialog" data-test-modal aria-label="Apply to Acme Corp">' +
      '<h2>' + s.name + '</h2>' +
      '<form class="jobs-easy-apply-content">' + s.html + '</form>' +
      '<footer><button type="button" aria-label="' + s.next + '"><span>' + s.next + '</span></button></footer>' +
    '</div>';
  // A real listbox commits the selection into the control when an option
  // is clicked. Without this the fixture would accept a click that
  // changed nothing and report a pass it had not earned.
  var list = document.getElementById('cty-list');
  if (list) {
    list.addEventListener('click', function (ev) {
      var li = ev.target.closest('li[role="option"]');
      if (!li) return;
      var input = document.getElementById('cty');
      input.value = li.textContent;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  document.querySelector('#modal-root footer button').addEventListener('click', function () {
    if (step === STEPS.length - 1) {
      var f = document.getElementById('follow');
      window.__followedAtSubmit = !!(f && f.checked);
      document.getElementById('modal-root').innerHTML = '';
      document.getElementById('submitted').hidden = false;
      return;
    }
    step++;
    // Re-render asynchronously, the way React would.
    setTimeout(render, 120);
  });
}
window.__uploadPressed = false;
document.addEventListener('click', function (ev) {
  if (ev.target && ev.target.id === 'upload') window.__uploadPressed = true;
}, true);
document.querySelector('.jobs-apply-button').addEventListener('click', function () {
  setTimeout(render, 150);
});
</script>
</body></html>`;

const server = https.createServer(S.certs(), (q, r) => {
  r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  r.end(PAGE);
});

const PROFILE = {
  first_name: 'Maxmilliam', last_name: 'Okafor',
  email: 'maxokafordev@gmail.com', phone: '+353 87 000 0000',
  city: 'Dublin', country: 'Ireland',
  years: '6', work_authorized: 'Yes',
  skills: ['Microsoft Dynamics 365', 'Azure DevOps', 'Power BI', 'Agile'],
};

const URL_JOB = 'https://www.linkedin.com/jobs/view/5477345004/';

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-easyapply', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/pw-easyapply', S.launchOptions(PORT));
  const sw = await S.serviceWorker(ctx);

  const setState = (state) => sw.evaluate(
    (s) => new Promise((res) => chrome.storage.local.set(s, () => res(true))), state);
  const registered = () => sw.evaluate(async () => {
    const r = await chrome.scripting.getRegisteredContentScripts();
    return r.map((x) => ({ id: x.id, js: x.js, matches: x.matches, allFrames: x.allFrames }));
  });

  // ---- 1. it registers itself, unprompted -----------------------------
  await sw.evaluate(() => new Promise((res) => chrome.storage.local.remove(
    ['linkedin_autofill_enabled', 'linkedin_autoadvance_enabled', 'linkedin_autosubmit_enabled'], () => res(1))));
  await sw.evaluate(() => new Promise((res) => setTimeout(res, 600)));
  let reg = (await registered()).find((x) => x.id === 'jg-linkedin-autofill');
  t('the Easy Apply filler registers with the toggle never touched', !!reg,
    'registered: ' + JSON.stringify(await registered()));
  if (reg) {
    t('  it loads autofill-core.js before linkedin-autofill.js',
      reg.js[0] === 'autofill-core.js' && reg.js.includes('linkedin-autofill.js'), JSON.stringify(reg.js));
    t('  it runs in every frame', reg.allFrames === true, String(reg.allFrames));
    t('  it matches linkedin.com', reg.matches.some((m) => m.indexOf('linkedin.com') !== -1), JSON.stringify(reg.matches));
  }

  // ---- 2. an explicit OFF unregisters it ------------------------------
  await setState({ linkedin_autofill_enabled: false });
  await sw.evaluate(() => new Promise((res) => setTimeout(res, 700)));
  t('turning the toggle OFF unregisters it',
    !(await registered()).some((x) => x.id === 'jg-linkedin-autofill'),
    'still registered after an explicit false');

  await setState({ linkedin_autofill_enabled: true });
  await sw.evaluate(() => new Promise((res) => setTimeout(res, 700)));
  t('turning it back ON re-registers it',
    (await registered()).some((x) => x.id === 'jg-linkedin-autofill'));

  // ---- 3. the whole flow, toggle ON -----------------------------------
  await setState({
    ats_profile: PROFILE,
    linkedin_autofill_enabled: true,
    linkedin_autoadvance_enabled: true,
    linkedin_autosubmit_enabled: false,     // stop at the final step
  });

  const openJob = async () => {
    const p = await ctx.newPage();
    await p.goto(URL_JOB, { waitUntil: 'domcontentloaded', timeout: 20000 });
    return p;
  };

  // The filler is driven by a MutationObserver on a 700ms debounce, and
  // each step re-renders asynchronously; give the flow room to run.
  let page = await openJob();
  await page.waitForTimeout(6000);

  const state = await page.evaluate(() => ({
    submitted: !document.getElementById('submitted').hidden,
    modalOpen: !!document.querySelector('.jobs-easy-apply-modal'),
    heading: (document.querySelector('.jobs-easy-apply-modal h2') || {}).textContent || '',
    values: Array.from(document.querySelectorAll('#modal-root input, #modal-root select'))
      .map((i) => [i.id, i.value]),
  }));

  t('it pressed Easy Apply and opened the dialog by itself',
    state.modalOpen || state.submitted, JSON.stringify(state));
  t('it advanced past the contact step without help',
    state.heading !== 'Contact info', 'still on: ' + state.heading + ' ' + JSON.stringify(state.values));
  t('with auto-submit OFF it stops at the final step and does NOT submit',
    !state.submitted && /Review/i.test(state.heading),
    'submitted=' + state.submitted + ' heading=' + state.heading);
  await page.close();

  // ---- 4. what it actually typed --------------------------------------
  // Re-run step one in isolation so the filled values can be read before
  // the flow advances past them.
  await setState({ linkedin_autoadvance_enabled: false, linkedin_autosubmit_enabled: false });
  page = await openJob();
  await page.click('.jobs-apply-button');
  await page.waitForTimeout(2500);
  const filled = await page.evaluate(() => Object.fromEntries(
    Array.from(document.querySelectorAll('#modal-root input, #modal-root select')).map((i) => [i.id, i.value])));
  t('first name filled from the profile', filled.fn === 'Maxmilliam', JSON.stringify(filled));
  t('last name filled', filled.ln === 'Okafor', JSON.stringify(filled));
  t('email filled', filled.em === 'maxokafordev@gmail.com', JSON.stringify(filled));
  t('phone filled', (filled.ph || '').replace(/\s/g, '') === '+353870000000', JSON.stringify(filled));
  t('the phone country code is selected', /Ireland/.test(filled.cc || ''), JSON.stringify(filled));

  // Step two: the resume step, which blocks Continue on a CLICK rather
  // than a value. Nothing here touched it, so a run that had answered
  // every question still stalled on it.
  await page.click('#modal-root footer button');
  await page.waitForTimeout(2500);
  const resume = await page.evaluate(() => ({
    heading: (document.querySelector('#modal-root h2') || {}).textContent || '',
    r1: (document.getElementById('r1') || {}).checked,
    r2: (document.getElementById('r2') || {}).checked,
    uploadPressed: !!window.__uploadPressed,
  }));
  t('a resume is selected when none was', resume.r1 === true, JSON.stringify(resume));
  t('the most recent one is chosen, not the stale one', resume.r2 !== true, JSON.stringify(resume));
  t('no file upload is ever triggered', resume.uploadPressed === false,
    'it pressed Upload resume -- it must never upload or swap a file');

  // Step two is the one that decides whether the flow gets stuck: LinkedIn
  // prefills the contact step itself, so answering the employer's own
  // questions is the part that is actually the extension's work.
  await page.click('#modal-root footer button');
  await page.waitForTimeout(2500);
  const q = await page.evaluate(() => Object.fromEntries(
    Array.from(document.querySelectorAll('#modal-root input, #modal-root select')).map((i) => [i.id, i.value])));
  t('the years-of-experience question is answered', /\d/.test(q.yrs || ''), JSON.stringify(q));
  t('the work-authorisation dropdown is selected', q.auth === 'Yes', JSON.stringify(q));
  t('the city question is answered', (q.city || '').length > 0, JSON.stringify(q));

  // Step three: the Yes/No surface, in a real browser.
  await page.click('#modal-root footer button');
  await page.waitForTimeout(2500);
  const yn = await page.evaluate(() => {
    const v = {};
    for (const el of document.querySelectorAll('#modal-root input, #modal-root select')) {
      v[el.id] = el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value;
    }
    return v;
  });
  t('sponsorship -> No', yn.spon === 'No', JSON.stringify(yn));
  t('commute -> Yes (a radio group, not the user\'s city)', yn.cm1 === true && yn.cm2 === false, JSON.stringify(yn));
  t('previously worked here -> No', yn.pw2 === true && yn.pw1 === false, JSON.stringify(yn));
  t('at least 18 -> Yes', yn.age === 'Yes', JSON.stringify(yn));
  t('convicted of a felony -> No', yn.felony === 'No', JSON.stringify(yn));
  t('an evidenced skill -> Yes', yn.skill === 'Yes', JSON.stringify(yn));
  t('the consent checkbox is ticked', yn.bg === true, JSON.stringify(yn));
  t('the typeahead combobox commits a real selection', yn.cty === 'Ireland', JSON.stringify(yn));
  await page.close();

  // ---- 5. auto-submit ON completes the application --------------------
  await setState({ linkedin_autoadvance_enabled: true, linkedin_autosubmit_enabled: true });
  page = await openJob();
  await page.waitForTimeout(8000);
  const done = await page.evaluate(() => ({
    submitted: !document.getElementById('submitted').hidden,
    modalOpen: !!document.querySelector('.jobs-easy-apply-modal'),
    followed: window.__followedAtSubmit,
  }));
  t('with auto-submit ON the application is submitted end to end',
    done.submitted, JSON.stringify(done));
  t('it never opted the user into following the company',
    done.followed !== true,
    'ticked "Follow Acme Corp" -- that is a marketing opt-in, not a consent');
  await page.close();

  // ---- 6. the heavy engine stays off LinkedIn -------------------------
  page = await openJob();
  await page.waitForTimeout(800);
  const worlds = await sw.evaluate(async (wanted) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((x) => x.url === wanted);
    if (!tab) return { noTab: true };
    const r = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        core: typeof window.AutofillCore,
        sources: typeof window.JDContactSources,
        // The heavy tailoring engine -- must NOT be here; it crashes the SPA.
        tailor: typeof window.TailorUniversal,
        parser: typeof window.UniversalJDParser,
        pdf: typeof window.ProfessionalPDFEngine,
      }),
    });
    return r && r[0] && r[0].result;
  }, URL_JOB);
  t('the Easy Apply filler IS loaded on LinkedIn', worlds.core === 'object', JSON.stringify(worlds));
  t('the contact sources ARE loaded on LinkedIn', worlds.sources === 'object', JSON.stringify(worlds));
  t('the heavy tailoring engine is NOT loaded on LinkedIn',
    worlds.tailor === 'undefined' && worlds.parser === 'undefined' && worlds.pdf === 'undefined',
    JSON.stringify(worlds));
  await page.close();

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed  (LinkedIn Easy Apply, real Chromium)');
  await ctx.close();
  server.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
