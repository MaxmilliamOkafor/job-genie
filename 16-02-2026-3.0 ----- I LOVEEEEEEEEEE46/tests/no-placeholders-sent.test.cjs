// A PLACEHOLDER TOKEN MUST NEVER REACH A RECRUITER.
//
// The resume-prompt technique of writing "[FILL IN]" where a metric is
// missing is sound advice for a chat window: the human proof-reads before
// submitting, and the marker is what prompts them to supply the real
// number.
//
// This tool is not a chat window. It attaches the generated document to
// real applications and can email it unattended, so the same marker gets
// no proof-read -- it lands on a recruiter's desk and reads as
// carelessness. So the prompt reports missing metrics in a separate
// section instead of writing markers into the CV, and the send path
// refuses to go out unattended if one escapes anyway.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

global.window = global;
(() => {
  const file = path.join(DIR, 'validation-engine.js');
  const m = new Module(file, null);
  m.filename = file; m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
})();
const V = global.ValidationEngine;

console.log('THE DETECTOR CATCHES WHAT A MODEL ACTUALLY EMITS');
for (const s of [
  'Increased revenue by [FILL IN]% last year',
  'Delivered the rollout for [Company Name]',
  'Grew active users by [X]',
  'Cut costs by [xx]%',
  'Managed a budget of [INSERT AMOUNT]',
  'Owner: [your name]',
  'Shipped on time; TBD on final scale',
  'Rolled out to <TEAM_NAME>',
  'Reduced churn by [NUMBER] percent',
]) t('  flags ' + JSON.stringify(s.slice(0, 44)), V.findPlaceholders(s).length > 0,
  'this would be emailed to a recruiter as written');

console.log('\nAND LEAVES REAL CV PROSE ALONE');
// False positives are worse than useless here: they would block a correct
// application from ever being sent.
for (const s of [
  'Reduced deployment time by 40% across weekly releases',
  'Led a team of 5 engineers (2023-2025)',
  'Migrated 12TB of data to AWS',
  'Built C# services [see portfolio for detail]',
  'Scored 95% on the internal audit',
  'Delivered D365 F&O across four regions',
  'Cut AWS spend from $40k to $22k per month',
]) t('  clean ' + JSON.stringify(s.slice(0, 44)), V.findPlaceholders(s).length === 0,
  'false positive: ' + JSON.stringify(V.findPlaceholders(s)));

console.log('\nAND THE SCHEMA\'S OWN LABELS, WHICH MODELS ECHO BACK');
// The response schema labels its fields "[Job Title]", "[GPA if
// applicable]" and so on. A model echoes those whenever it has no value,
// so they arrive looking like real content.
for (const s of ['[Job Title]', '[Degree Name]', '[School Name]', '[Dates]',
  '[GPA if applicable]', '[Company Name]']) {
  t('  flags ' + s, V.findPlaceholders(s).length > 0,
    'this would be printed on the CV as the field value');
}
t('  but genuine bracketed prose is still clean',
  V.findPlaceholders('Built C# services [see portfolio for detail]').length === 0);

console.log('\nIT REPORTS EACH DISTINCT TOKEN ONCE, IN ORDER');
const many = V.findPlaceholders('[FILL IN] then [Company Name] then [FILL IN] again and TBD');
t('  deduplicated', many.length === 3, JSON.stringify(many));
t('  in the order they appear',
  /fill/i.test(many[0]) && /company/i.test(many[1]) && /tbd/i.test(many[2]), JSON.stringify(many));
t('  empty text is clean, not an error', V.findPlaceholders('').length === 0
  && V.findPlaceholders(null).length === 0 && V.findPlaceholders(undefined).length === 0);

console.log('\nTHE UNATTENDED SEND IS BLOCKED, NOT THE GENERATION');
const popupSrc = read('popup.js');
t('  autoSendFollowup checks for placeholders',
  /ValidationEngine\.findPlaceholders/.test(popupSrc),
  'an escaped marker would be emailed');
t('  ...and returns instead of sending',
  /state === 'placeholder'|'placeholder',[\s\S]{0,200}?return;/.test(popupSrc)
    || /await outcome\('placeholder'[\s\S]{0,220}?return;/.test(popupSrc),
  'the guard must stop the send, not just log');
t('  ...naming the tokens so the fix is obvious',
  /found\.slice\(0, 3\)\.join/.test(popupSrc), 'a bare refusal is not actionable');
t('  the module is actually loaded in the popup',
  /<script src="validation-engine\.js"><\/script>/.test(read('popup.html')),
  'ValidationEngine would be undefined and the guard would never run');
t('  generation itself is not blocked',
  !/findPlaceholders[\s\S]{0,300}?success:\s*false/.test(read('docx-generator.js')),
  'losing the document is worse than reviewing it');

console.log('\nTHE PROMPT FORBIDS EMITTING THEM IN THE FIRST PLACE');
// Belt and braces: the guard above is the last line of defence, not the
// first. The tailoring prompt should never produce one.
const P = '../supabase/functions/tailor-application/index.ts';
let prompt = null;
try { prompt = fs.readFileSync(path.join(DIR, P), 'utf8'); } catch (e) {}
if (!prompt) {
  console.log('  SKIP  tailoring prompt not present in this checkout');
} else {
  t('  placeholder tokens are banned by name',
    /\[FILL IN\]/.test(prompt) && /placeholder tokens/i.test(prompt),
    'the model has no instruction against them');
  t('  ...with the reason stated, so it is not edited away',
    /attaches\s+the\s+generated\s+document\s+to\s+real\s+applications/i.test(prompt),
    'the ban reads as arbitrary without it, and gets tuned away later');
  // The response contract is "Return ONLY valid JSON - no extra text", so
  // a free-text section after the CV would either be dropped or appended
  // after the JSON and break the parse -- taking the whole run with it.
  t('  missing metrics are reported through the JSON contract',
    /"metricsWorthAdding"/.test(prompt),
    'the useful half of the technique is lost if only the ban survives');
  t('  ...and the schema declares the field to put them in',
    /"metricsWorthAdding": \[/.test(prompt),
    'the model is told to report gaps with nowhere to write them');
  t('  ...as an array, not free text after the CV',
    !/emit a separate section/i.test(prompt),
    'free text after a JSON-only response breaks JSON.parse');
  t('  the schema\'s own bracket labels are excluded from the ban',
    /bracketed labels in the JSON schema/i.test(prompt),
    'the model would otherwise read the ban as forbidding the schema itself');
  t('  the XYZ achievement formula is taught',
    /accomplished \[X\], as measured by \[Y\], by doing \[Z\]/i.test(prompt));
  t('  ...and made subject to the anti-fabrication rule',
    /SUBJECT TO RULE 0[\s\S]{0,200}?fabricated outcome/i.test(prompt),
    'the formula invites invented numbers unless it is fenced');
  t('  weak bullet openers are banned',
    /Responsible for/.test(prompt) && /Helped with/.test(prompt));
  t('  the two-line bullet cap is NOT present',
    !/TWO LINES MAXIMUM/.test(prompt),
    'it was removed deliberately: it fought the keyword-density rules the '
      + 'ATS score depends on');
  t('  the summary is written so passing feels like a mistake',
    /PASSING WOULD FEEL LIKE A MISTAKE/i.test(prompt));
  t('  ...with filler phrases banned by name',
    /results-driven/.test(prompt) && /team player/.test(prompt));
  t('  ...and still fenced by the evidence rules',
    /SUBJECT TO RULES -1 AND 0/.test(prompt),
    'a persuasive summary must not become an inflated one');
  t('  the verification checklist covers the new rules',
    /strong action verb/i.test(prompt) && /ZERO placeholder tokens/i.test(prompt));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
