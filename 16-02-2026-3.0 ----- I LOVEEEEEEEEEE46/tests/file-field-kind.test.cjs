// Which document a file input is for.
//
// THE BUG THIS EXISTS FOR
//   The check read the section around a field with a raw
//   text.includes('cv'), so ATTACHING A FILE changed the answer. Once the
//   CV was attached, SmartRecruiters rendered a control reading
//
//       Remove "Maxmilliam_Okafor_CV"?
//
//   into the same section -- and that string contains "cv". The
//   cover-letter input beside it then read as a CV field, and the CV was
//   attached into the cover-letter slot too. The first attachment
//   corrupted the detection that placed the second, which is why it only
//   ever showed up after something had already been attached.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP file-field-kind: jsdom not installed'); process.exit(0); }

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Lift the detection out of content.js and run it against a real DOM.
// Taken verbatim from the file, so it cannot drift from what ships.
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
const CV_WORDS_SRC = /const CV_WORDS = .*;/.exec(src)[0];
const body = [
  extract('_attachedFileNames'), extract('_withoutAttachmentNoise'),
  extract('_fieldOwnText'), CV_WORDS_SRC,
  extract('fileFieldKind'), extract('soleCandidate'),
  extract('isCVField'), extract('isCoverField'),
].join('\n');

function build(html, attachedNames) {
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>');
  const fn = new Function('document', 'cvFile', 'coverFile',
    body + '\nreturn { fileFieldKind, isCVField, isCoverField };');
  const names = attachedNames || {};
  return {
    doc: dom.window.document,
    api: fn(dom.window.document,
      names.cv ? { name: names.cv } : null,
      names.cover ? { name: names.cover } : null),
  };
}

// ---- 1. the exact SmartRecruiters shape ------------------------------
// One "Attachments" section holding both fields. After the CV attaches,
// its filename and a Remove control are rendered into the CV sub-block.
const SR_BEFORE = `
<section class="attachments"><h3>Attachments</h3>
  <div class="field-resume"><label for="cv">Resume</label><input id="cv" type="file"></div>
  <div class="field-cover"><label for="cl">Cover letter</label><input id="cl" type="file"></div>
</section>`;

const SR_AFTER = `
<section class="attachments"><h3>Attachments</h3>
  <div class="field-resume"><label for="cv">Resume</label><input id="cv" type="file">
    <div class="uploaded"><span>Maxmilliam_Okafor_CV.docx</span>
      <button type="button" aria-label='Remove "Maxmilliam_Okafor_CV"?'>Remove</button></div>
  </div>
  <div class="field-cover"><label for="cl">Cover letter</label><input id="cl" type="file"></div>
</section>`;

console.log('SMARTRECRUITERS: BEFORE ANYTHING IS ATTACHED');
{
  const { doc, api } = build(SR_BEFORE);
  t('the resume input is the CV field', api.isCVField(doc.getElementById('cv')));
  t('the cover-letter input is the cover field', api.isCoverField(doc.getElementById('cl')));
  t('the resume input is NOT the cover field', !api.isCoverField(doc.getElementById('cv')));
  t('the cover-letter input is NOT the CV field', !api.isCVField(doc.getElementById('cl')));
}

console.log('\nSMARTRECRUITERS: AFTER THE CV IS ATTACHED  (the reported bug)');
{
  const { doc, api } = build(SR_AFTER, { cv: 'Maxmilliam_Okafor_CV.docx' });
  t('the resume input is still the CV field', api.isCVField(doc.getElementById('cv')));
  t('the cover-letter input is STILL NOT a CV field',
    !api.isCVField(doc.getElementById('cl')),
    'the CV would be attached into the cover-letter slot -- the reported failure');
  t('the cover-letter input is still the cover field', api.isCoverField(doc.getElementById('cl')));
}

console.log('\n...AND AFTER BOTH ARE ATTACHED');
{
  const both = SR_AFTER.replace('<label for="cl">Cover letter</label><input id="cl" type="file">',
    '<label for="cl">Cover letter</label><input id="cl" type="file">'
    + '<div class="uploaded"><span>Maxmilliam_Okafor_Cover.docx</span>'
    + '<button type="button" aria-label=\'Remove "Maxmilliam_Okafor_Cover"?\'>Remove</button></div>');
  const { doc, api } = build(both,
    { cv: 'Maxmilliam_Okafor_CV.docx', cover: 'Maxmilliam_Okafor_Cover.docx' });
  t('the resume input is unchanged', api.isCVField(doc.getElementById('cv')));
  t('the cover-letter input is unchanged', api.isCoverField(doc.getElementById('cl')));
  t('nothing has become the other kind',
    !api.isCoverField(doc.getElementById('cv')) && !api.isCVField(doc.getElementById('cl')));
}

// ---- 2. a filename with "cover" in it must not flip the CV field -----
console.log('\nTHE MIRROR CASE');
{
  const { doc, api } = build(
    SR_BEFORE.replace('<input id="cv" type="file">',
      '<input id="cv" type="file"><span>Max_Okafor_Cover_Letter.pdf</span>'),
    { cover: 'Max_Okafor_Cover_Letter.pdf' });
  t('a cover-letter FILENAME beside the resume input does not make it a cover field',
    api.isCVField(doc.getElementById('cv')), api.fileFieldKind(doc.getElementById('cv')));
}

// ---- 3. "cv" must be a word, not a substring -------------------------
console.log('\n"cv" IS A WORD, NOT A SUBSTRING');
for (const [label, kind] of [
  ['Upload your CV', 'cv'],
  ['Resume', 'cv'],
  ['Curriculum Vitae', 'cv'],
  ['Cover letter', 'cover'],
]) {
  const { doc, api } = build(
    '<div><label for="f">' + label + '</label><input id="f" type="file"></div>');
  t('"' + label + '" -> ' + kind, api.fileFieldKind(doc.getElementById('f')) === kind,
    api.fileFieldKind(doc.getElementById('f')));
}
{
  // Words that merely CONTAIN the letters c-v.
  const { doc, api } = build(
    '<div><label for="f">Upload your MCVEIGH reference letter</label><input id="f" type="file"></div>');
  t('"MCVEIGH" is not a CV field', api.fileFieldKind(doc.getElementById('f')) !== 'cv',
    api.fileFieldKind(doc.getElementById('f')));
}

// ---- 4. an ambiguous shared container must not guess ------------------
console.log('\nAMBIGUITY IS NOT GUESSED');
{
  // A bare input inside a section mentioning both, with no labelling of
  // its own. Attaching to the wrong slot looks done and reaches the
  // recruiter that way; an empty field is visible to the user.
  const { doc, api } = build(
    '<section>Attach your resume and cover letter<input id="f" type="file"></section>');
  t('an unlabelled input in a section naming both is neither',
    api.fileFieldKind(doc.getElementById('f')) === '',
    api.fileFieldKind(doc.getElementById('f')));
}

// ---- 5. other ATS shapes still resolve -------------------------------
console.log('\nOTHER ATS SHAPES');
for (const [name, html, id, kind] of [
  ['Greenhouse', '<div class="field"><label for="a">Resume/CV</label><input id="a" type="file"></div>', 'a', 'cv'],
  ['Greenhouse cover', '<div class="field"><label for="b">Cover Letter</label><input id="b" type="file"></div>', 'b', 'cover'],
  ['Workday', '<div><input id="c" type="file" data-automation-id="resumeUpload" aria-label="Resume Upload"></div>', 'c', 'cv'],
  ['name attribute', '<div><input id="d" type="file" name="resume"></div>', 'd', 'cv'],
  ['name attribute cover', '<div><input id="e" type="file" name="cover_letter"></div>', 'e', 'cover'],
]) {
  const { doc, api } = build(html);
  t(name, api.fileFieldKind(doc.getElementById(id)) === kind, api.fileFieldKind(doc.getElementById(id)));
}

// ---- 6. the sole-candidate rule ---------------------------------------
// An upload widget often gives its input no labelling at all: the word
// "Resume" sits in a heading further away than the ancestor walk reaches,
// or is drowned by drag-and-drop helper text. Classifying every input as
// '' means NOTHING is attached, which is a silent failure.
console.log('\nSOLE CANDIDATE (unlabelled upload widgets)');
{
  const { doc, api } = build(
    '<div class="dropzone">Drag and drop your file here, or browse to upload. '
    + 'Accepted formats are PDF, DOC, DOCX and TXT, up to 10 MB. '
    + 'Your document will be parsed to prefill the application.'
    + '<input id="f" type="file"></div>');
  t('a lone unlabelled file input is the CV', api.isCVField(doc.getElementById('f')));
  t('...and is not the cover letter', !api.isCoverField(doc.getElementById('f')));
}
{
  const { doc, api } = build(
    '<div><div class="a"><input id="f1" type="file"></div>'
    + '<div class="b"><label for="f2">Cover letter</label><input id="f2" type="file"></div></div>');
  t('with two inputs, the one beside the cover label is the cover',
    api.isCoverField(doc.getElementById('f2')));
  t('...and the other is the CV by elimination', api.isCVField(doc.getElementById('f1')));
  t('...and the cover input is not also the CV', !api.isCVField(doc.getElementById('f2')));
}
{
  const { doc, api } = build(
    '<div><label for="f">Upload your cover letter</label><input id="f" type="file"></div>');
  t('a lone COVER input is not claimed as the CV', !api.isCVField(doc.getElementById('f')));
}

// ---- 7. the upload-confirmation signal --------------------------------
// The actual cause of the SmartRecruiters symptom: a React ATS reads the
// input and then CLEARS it, so input.files goes back to 0. The re-attach
// guard never fired and the 50ms loop ran for its full 30-second window,
// flipping the widget in and out of its uploaded state.
console.log('\nUPLOAD CONFIRMATION (input.files is not the only signal)');
{
  const dom = new JSDOM('<!doctype html><html><body><form>'
    + '<div class="dropzone"><input id="f" type="file">'
    + '<div class="chip">Maxmilliam_Okafor_CV.docx'
    + '<button aria-label=\'Remove "Maxmilliam_Okafor_CV"?\'>Remove</button></div>'
    + '</div></form></body></html>');
  const fn = new Function('document', 'cvFile', 'coverFile',
    body + '\n' + extract('pageShowsAttachment') + '\n' + extract('inputHoldsFile')
    + '\nreturn { pageShowsAttachment, inputHoldsFile };');
  const api = fn(dom.window.document, { name: 'Maxmilliam_Okafor_CV.docx' }, null);
  const input = dom.window.document.getElementById('f');
  t('the input itself reports empty (React cleared it)', input.files.length === 0);
  t('but the page is displaying the filename',
    api.pageShowsAttachment('Maxmilliam_Okafor_CV.docx'));
  t('so the file counts as attached and is not re-attached',
    api.inputHoldsFile(input, { name: 'Maxmilliam_Okafor_CV.docx' }),
    'the 50ms loop would keep re-attaching for 30 seconds');
  t('a file the page is NOT showing does not count',
    !api.pageShowsAttachment('Someone_Else_CV.docx'));
  t('a too-short name is never matched loosely', !api.pageShowsAttachment('cv.doc'));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
