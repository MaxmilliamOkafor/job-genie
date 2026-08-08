// A HANDLER THAT DOES NOT EXIST FAILS SILENTLY UNTIL IT IS CLICKED.
//
// popup.js bound three listeners to this.toggleJobTitleEdit() and
// this.saveJobTitleEdit(), and neither method was defined anywhere. The
// ✏️ button beside the detected job title is unhidden on every NON-ATS
// site -- company career pages, LinkedIn, Indeed -- which is exactly
// where detection is least reliable, so the one control for correcting a
// wrong title threw TypeError on click and did nothing.
//
// Nothing caught it because a missing method is not a syntax error and
// the button is only reachable by hand. Two checks:
//
//   SWEEP      every this.method() called anywhere in the extension is
//              defined in its own file. This is the general guard -- it
//              is what would have caught the original bug.
//
//   BEHAVIOUR  the two methods, executed against a fake DOM, using the
//              real source text lifted out of popup.js rather than a
//              copy, so drift breaks the test.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');

// ---- SWEEP -----------------------------------------------------------
console.log('EVERY this.method() IS DEFINED, IN EVERY FILE');
const files = fs.readdirSync(DIR).filter((n) => n.endsWith('.js'));
t('  there are files to check', files.length > 5, String(files.length));
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const called = new Set([...src.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  if (!called.size) continue;
  const defined = new Set();
  // class / object-literal shorthand, `name: function(`, and `this.name =`
  for (const m of src.matchAll(/^\s{2,8}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) defined.add(m[1]);
  for (const m of src.matchAll(/^\s{2,8}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function)?\s*[(a-zA-Z]/gm)) defined.add(m[1]);
  for (const m of src.matchAll(/(?:this|[A-Za-z_$][\w$]*\.prototype)\.([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1]);
  const missing = [...called].filter((n) => !defined.has(n));
  t('  ' + f, missing.length === 0,
    'called but never defined: ' + missing.join(', ')
      + '\n              this throws TypeError the moment that path is taken');
}

// ---- the button is reachable, so the handler matters -----------------
console.log('\nTHE EDIT BUTTON IS REALLY SHOWN');
const html = fs.readFileSync(path.join(DIR, 'popup.html'), 'utf8');
const popupSrc = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');
t('  popup.html has the button and the input',
  /id="editJobTitle"/.test(html) && /id="jobTitleInput"/.test(html));
t('  it is unhidden on non-ATS sites',
  /editBtn\.classList\.toggle\('hidden',\s*isATSPlatform\)/.test(popupSrc),
  'if it were never shown the missing handler would be unreachable');

// ---- BEHAVIOUR -------------------------------------------------------
// Lift the two methods out of popup.js and run them. popup.js as a whole
// cannot be loaded here -- it wants chrome.* and a real document -- but
// executing the actual source beats asserting on regexes.
function lift(name) {
  const start = popupSrc.indexOf('\n  ' + name + '(');
  const asyncStart = popupSrc.indexOf('\n  async ' + name + '(');
  const from = start === -1 ? asyncStart : start;
  if (from === -1) return null;
  // Walk braces from the method's opening { to its matching close.
  const open = popupSrc.indexOf('{', from);
  let depth = 0, i = open;
  for (; i < popupSrc.length; i++) {
    if (popupSrc[i] === '{') depth++;
    else if (popupSrc[i] === '}') { depth--; if (!depth) break; }
  }
  return popupSrc.slice(from + 1, i + 1);
}

const toggleSrc = lift('toggleJobTitleEdit');
const saveSrc = lift('saveJobTitleEdit');
t('  toggleJobTitleEdit is defined in popup.js', !!toggleSrc, 'not found');
t('  saveJobTitleEdit is defined in popup.js', !!saveSrc, 'not found');

if (toggleSrc && saveSrc) {
  const mkEl = () => {
    const cls = new Set(['hidden']);
    return {
      value: '', textContent: '', focused: false, selected: false,
      classList: {
        add: (c) => cls.add(c), remove: (c) => cls.delete(c),
        contains: (c) => cls.has(c),
        toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)),
      },
      focus() { this.focused = true; }, select() { this.selected = true; },
      _cls: cls,
    };
  };

  const build = () => {
    const titleEl = mkEl(); titleEl._cls.delete('hidden');
    const inputEl = mkEl();
    const els = { jobTitle: titleEl, jobTitleInput: inputEl };
    global.document = { getElementById: (id) => els[id] || null };
    const saved = [];
    global.chrome = { storage: { local: { set: async (o) => { saved.push(o); } } } };
    const host = {
      currentJob: { title: 'Wrong Title', url: 'https://x.test/job/1' },
      status: null,
      setStatus(m) { this.status = m; },
      updateJobDisplay() { titleEl.textContent = this.currentJob ? this.currentJob.title : ''; },
    };
    // eslint-disable-next-line no-new-func
    const obj = new Function('return { ' + toggleSrc + ', ' + saveSrc + ' };')();
    Object.assign(host, obj);
    return { host, titleEl, inputEl, saved };
  };

  console.log('\n  OPENING THE EDITOR');
  {
    const { host, titleEl, inputEl } = build();
    host.toggleJobTitleEdit();
    t('    the input is shown', !inputEl.classList.contains('hidden'));
    t('    the heading is hidden', titleEl.classList.contains('hidden'));
    t('    it is prefilled with the current title', inputEl.value === 'Wrong Title', inputEl.value);
    t('    and focused', inputEl.focused && inputEl.selected);
  }

  console.log('\n  SAVING A CORRECTION');
  {
    const { host, titleEl, inputEl, saved } = build();
    host.toggleJobTitleEdit();
    inputEl.value = '  Senior Project Manager  ';
    return host.saveJobTitleEdit().then(() => {
      t('    the title is updated and trimmed',
        host.currentJob.title === 'Senior Project Manager', host.currentJob.title);
      t('    it is marked as the user\'s', host.currentJob.titleSource === 'manual');
      t('    keyed to the URL it was made on',
        host.currentJob.manualTitleUrl === 'https://x.test/job/1', host.currentJob.manualTitleUrl);
      t('    it is persisted', saved.length === 1 && !!saved[0].ats_lastJob,
        JSON.stringify(saved));
      t('    the editor closes', inputEl.classList.contains('hidden')
        && !titleEl.classList.contains('hidden'));
      return rest();
    });
  }
}
function rest() {
  console.log('\n  ENTER THEN BLUR MUST NOT SAVE TWICE');
  // Enter hides the field, which fires blur, which calls save again.
  const start = popupSrc.indexOf('async saveJobTitleEdit()');
  const head = popupSrc.slice(start, start + 700);
  t('    save returns early once the editor is closed',
    /if \(inputEl\.classList\.contains\('hidden'\)\) return;/.test(head),
    'a second call would run against an already-committed value');

  console.log('\n  A BLANK ENTRY DOES NOT WIPE THE TITLE');
  t('    empty input is rejected',
    /if \(!next \|\| !this\.currentJob \|\| next === this\.currentJob\.title\)/.test(popupSrc),
    'clearing the box and blurring would blank the detected job');

  console.log('\n  A RE-SCAN DOES NOT DISCARD THE CORRECTION');
  // The popup re-scans on open, so without this the edit survives seconds.
  t('    the prior manual title is captured before reconcile',
    /const priorManualTitle\s*=/.test(popupSrc));
  t('    ...and only reapplied on the same URL',
    /priorManualTitle\.url === \(reconciled\.url \|\| tab\.url\)/.test(popupSrc),
    'a different posting would inherit the previous job\'s manual title');

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
  process.exit(FAIL ? 1 : 0);
}
