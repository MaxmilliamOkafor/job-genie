// "Application submitted after 1 step(s)" — with nothing submitted.
//
// Reported with a screenshot: a LinkedIn job page, NO Easy Apply dialog
// open, the blue Easy Apply button still sitting there, and the popup
// reporting a successful submission after one step.
//
// Two independent faults produced that, and either alone is enough:
//
//   DETECTION WAS TOO LOOSE. A container qualified as an Easy Apply
//   dialog on the strength of the WORDS "easy apply" appearing in it --
//   and the blue CTA on every job page says exactly that. The job pane
//   itself was therefore treated as a dialog.
//
//   SUCCESS WAS ASSUMED, NOT CHECKED. Having clicked a button was taken
//   as proof an application had been sent. That is the worse of the two:
//   a wrong answer that looks like success hides the bug underneath it.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP no-phantom-submit: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'linkedin-autofill.js'), 'utf8');

// Lift the detector out verbatim so it cannot drift from what ships.
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('not found: ' + name);
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unterminated: ' + name);
}
const consts = [
  /const FOOTER_BTN_SEL = \[[\s\S]*?\]\.join\(','\);/.exec(src)[0],
  /const CONTAINER_SEL = \[[\s\S]*?\]\.join\(','\);/.exec(src)[0],
  /const STEP_TEXT = .*;/.exec(src)[0],
].join('\n');
const body = [
  consts,
  // The detector records which element it matched, so the trace can name
  // a false positive instead of leaving it invisible. Stubbed here.
  'const _traced = []; function trace(ev, d) { _traced.push([ev, d]); }',
  extract('_rendered'), extract('_containerFor'), extract('_describe'),
  extract('_hasStepMachinery'), extract('_submissionConfirmed'),
  extract('findEasyApplyModal'),
].join('\n');

function detect(html) {
  const dom = new JSDOM(html, { url: 'https://www.linkedin.com/jobs/search-results/?currentJobId=4421213926' });
  // jsdom has no layout: give elements a real box so _rendered works.
  dom.window.Element.prototype.getClientRects = function () { return [{ width: 100, height: 30 }]; };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent',
    { get() { return this.parentElement; }, configurable: true });
  const fn = new Function('document', 'window', 'getComputedStyle',
    body + '\nreturn { modal: findEasyApplyModal(), traced: _traced };');
  try {
    const r = fn(dom.window.document, dom.window, dom.window.getComputedStyle.bind(dom.window));
    return r.modal;
  } catch (e) {
    return { error: e.message };
  }
}

// ---- the page from the screenshot -----------------------------------
// A job view with the CTA, the Jobright panel, LinkedIn's premium cards
// and the messaging overlay. No dialog anywhere.
const JOB_PAGE = `<!doctype html><html><head><title>AI Engineer | LinkedIn</title></head><body>
<div class="search-reusables__filter-bar" role="toolbar">
  <button aria-pressed="true"><span>Easy Apply</span></button>
</div>
<div class="jobs-search__job-details">
  <h1 class="job-details-jobs-unified-top-card__job-title">AI Engineer</h1>
  <div class="jobs-apply-button"><button aria-label="Easy Apply to AI Engineer"><span>Easy Apply</span></button></div>
  <button><span>Save</span></button>
  <section><h2>About the job</h2><p>At Portless, we specialize in global delivery solutions.</p></section>
  <aside><p>Add this job to view your Match Score and tailor your resume.</p>
    <button>Tailor my resume</button><button>Show match details</button>
    <button>Help me stand out</button></aside>
  <section><h3>See how you compare to other applicants</h3>
    <p>2228 Applicants</p></section>
</div>
<div role="dialog" class="msg-overlay-conversation-bubble"><header>Qurat Kumail</header>
  <textarea placeholder="Write a message"></textarea><button>Send</button></div>
</body></html>`;

console.log('THE PAGE FROM THE SCREENSHOT  (no dialog open)');
{
  const m = detect(JOB_PAGE);
  t('no Easy Apply dialog is detected', m === null,
    m && m.error ? 'threw: ' + m.error
      : 'matched <' + (m && m.tagName) + ' class="' + (m && m.className) + '"> — this became the '
        + '"dialog", and the first submit-looking button inside it was clicked');
}

// The messaging overlay is a real [role="dialog"] with a "Send" button.
console.log('\nOTHER DIALOGS ON THE PAGE ARE NOT APPLICATIONS');
for (const [name, html] of [
  ['the messaging overlay',
   `<!doctype html><html><body><div role="dialog"><textarea></textarea><button>Send</button></div></body></html>`],
  ['a notifications dropdown',
   `<!doctype html><html><body><div role="dialog"><p>Easy Apply to 3 new jobs</p><button>Next</button></div></body></html>`],
  ['a cookie banner',
   `<!doctype html><html><body><div role="dialog"><p>We use cookies</p><button>Continue</button></div></body></html>`],
]) t(name + ' is not an Easy Apply dialog', detect(html) === null,
  'matched something that is not an application step');

// ---- a REAL dialog must still be found ------------------------------
console.log('\nA REAL EASY APPLY DIALOG IS STILL FOUND');
for (const [name, html] of [
  ['by its footer aria-label',
   `<!doctype html><html><body><div class="artdeco-modal jobs-easy-apply-modal" role="dialog">
     <h2>Contact info</h2><input id="fn"><footer>
     <button aria-label="Continue to next step"><span>Next</span></button></footer></div></body></html>`],
  ['on the review step',
   `<!doctype html><html><body><div class="artdeco-modal" role="dialog">
     <h2>Review your application</h2><footer>
     <button aria-label="Submit application"><span>Submit application</span></button></footer></div></body></html>`],
  ['by exact button text alone',
   `<!doctype html><html><body><div role="dialog"><h2>Contact info</h2><input>
     <button>Submit application</button></div></body></html>`],
]) {
  const m = detect(html);
  t(name, !!m && !m.error, m && m.error ? m.error : 'a genuine dialog was missed');
}

// ---- the honesty rule -----------------------------------------------
console.log('\nSUBMISSION IS CONFIRMED, NOT ASSUMED');
t('a submit click is verified before reporting success',
  /const confirmed = !still \|\| stepSignature\(still\) !== sig \|\| _submissionConfirmed\(\);/.test(src),
  'success is still assumed from having clicked');
t('an unconfirmed submit reports that it was NOT sent',
  /the application was NOT sent/.test(src),
  'a failed submit would still read as success');
t('...and reports it as stuck rather than submitted',
  /trace\('submit\.unconfirmed'[\s\S]{0,200}?done\('stuck'/.test(src));

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
