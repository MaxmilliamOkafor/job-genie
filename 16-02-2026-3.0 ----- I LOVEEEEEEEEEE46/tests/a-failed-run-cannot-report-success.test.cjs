// THE RUN FAILED AND THE EXTENSION SAID "COMPLETE!"
//
// Reported across several rounds as "extension is still doing nothing",
// "it wasn't finding or tailoring anything or generating the files",
// and finally "still crashes when Processing tailored Document".
//
// The screenshot that solved it showed a cross on step 1, a tick on
// step 2, and a spinner on step 3 that never resolved. Nothing writes
// that combination deliberately. It is the fingerprint of two functions
// disagreeing:
//
//   tailorDocuments caught its own failure, showed a toast, and
//   RETURNED NORMALLY. Its finally block stamped all three step icons
//   with a cross.
//
//   runExtractAndApply awaited it, saw a resolved promise, and carried
//   on: step 2 complete, step 3 working, "Complete! Tailored CV and
//   Cover Letter ready.", success toast. Steps 2 and 3 were overwritten
//   on the way past. Step 1's cross was the only survivor.
//
// So a failed run reported success, and the toast that said otherwise
// was replaced a few lines later by one that said it had worked.
//
// A SECOND FAULT IN THE SAME CATCH: signalAutomationComplete was called
// twice, the second time unguarded, directly beneath a guarded copy
// whose own comment says "guarded to prevent double-crash". A throw
// there escapes during error handling, which is the worst moment to
// lose the original error.
//
// Three rules now:
//   1. tailorDocuments rethrows.
//   2. Callers that cannot handle it swallow the rejection explicitly,
//      rather than leaving an unhandled one.
//   3. The caller checks for an actual CV before claiming success,
//      because a resolved promise is not a document.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(DIR, 'popup.js'), 'utf8');

// Brace counting through a two-thousand-line method trips over braces
// inside strings, regexes and template literals. These are the two
// regions the fix lives in, delimited by text that only appears there.
const between = (from, to) => {
  const a = src.indexOf(from);
  if (a === -1) return '';
  const b = src.indexOf(to, a);
  return b === -1 ? src.slice(a) : src.slice(a, b + to.length);
};
// The catch of tailorDocuments, from its own comment to the finally.
const tailor = between('THIS CATCH USED TO END THE STORY', '} finally {');
// The stretch of the caller between awaiting the tailoring and the
// success message it used to print unconditionally.
// Terminated on the ASSIGNMENT, not on the message text: the comment
// explaining this fix quotes the message, and matching that would end
// the region before the code it is meant to cover.
const outer = between('DIRECT API CALL: Use tailorDocuments()',
  "textContent = 'Complete!");

console.log('THE FAILURE REACHES THE CALLER');
{
  t('  the catch of tailorDocuments was found', tailor.length > 200,
    tailor.length + ' chars');
  t('  its catch rethrows', /\n      throw error;\n    \} finally \{/.test(tailor),
    'the caller still cannot tell a failed run from a successful one');
  t('  ...and says why in a comment', /AND THE CALLER IS TOLD/.test(tailor),
    'a bare rethrow invites the next person to remove it');
}

console.log('\nAND THE ERROR HANDLER CANNOT ITSELF CRASH');
{
  const calls = (tailor.match(/signalAutomationComplete\(/g) || []).length;
  t('  signalAutomationComplete is called once in the catch', calls === 1,
    calls + ' calls -- the duplicate unguarded one is back');
  t('  and that call is guarded',
    /try \{\s*\n\s*await this\.signalAutomationComplete\(/.test(tailor),
    'a throw during error handling loses the original error');
}

console.log('\nAND THE CALLER DOES NOT CLAIM SUCCESS WITHOUT A DOCUMENT');
{
  t('  the caller region was found', outer.length > 200, outer.length + ' chars');
  t('  it checks for real CV text after awaiting',
    /generatedDocuments\.cv\.length > 80/.test(outer),
    'a resolved promise is treated as a delivered document');
  t('  ...and throws rather than printing Complete!',
    /finished but produced no CV text/.test(outer),
    'the success message can still print on an empty run');
  // `outer` ends AT the success message, so the check being inside it
  // is exactly the claim that it runs first.
  t('  the check comes before the success message',
    outer.indexOf('produced no CV text') !== -1
      && outer.trim().endsWith("textContent = 'Complete!"),
    outer.slice(-120));
}

console.log('\nAND NO CALLER LEAVES AN UNHANDLED REJECTION');
{
  // Two fire-and-forget call sites. Both raise their own UI inside
  // tailorDocuments, so they only have to absorb the rejection.
  const sites = src.match(/this\.tailorDocuments\([^)]*\)/g) || [];
  t('  every call site found', sites.length >= 3, JSON.stringify(sites));
  t('  the tailor button swallows it explicitly',
    /this\.tailorDocuments\(\{ force: true \}\)\.catch\(\(\) => \{\}\);/.test(src),
    'clicking Tailor can now raise an unhandled rejection');
  t('  the post-login trigger too',
    /this\.tailorDocuments\(\)\.catch\(\(\) => \{\}\);/.test(src),
    'logging in can now raise an unhandled rejection');
}

console.log('\nAND A CRASH ANYWHERE LANDS IN THE EXPORT');
{
  // The failure was invisible for three rounds because nothing that
  // could see it was being written anywhere the user could send back.
  t('  the failure is logged with its stack and context',
    /jgLog\('error', 'tailor_failed'/.test(tailor) && /stack: error && error\.stack/.test(tailor),
    'the error is console-only again');
  t('  an uncaught error anywhere in the popup is captured',
    /addEventListener\('error'/.test(src) && /popup_uncaught/.test(src),
    'a throw outside a try is invisible to the export');
  t('  ...and so is an unhandled rejection',
    /addEventListener\('unhandledrejection'/.test(src) && /popup_unhandled_rejection/.test(src),
    'a rejected promise nobody awaited is invisible');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
