// THE EXTENSION SHIPS DOCX. THE PDF IS A CONVERSION OF IT.
//
// This suite set out to render the PDF and parse it, because the PDF is
// what gets uploaded and every other document assertion here runs
// against the DOCX. It found something better.
//
// There are four PDF engines in this codebase (professional-pdf-engine,
// cv-formatter-perfect, cv-formatter-perfect-enhanced, pdf-ats-turbo,
// openresume-generator) and every one of them opens with
//
//     if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
//       throw new Error('jsPDF library not loaded');
//     }
//
// jsPDF is not in the extension. Not a vendored file, not a script tag,
// not a manifest entry, not a web-accessible resource. So none of those
// paths can run: each throws and the caller falls through. popup.html
// loads exactly one document generator, docx-generator.js, and the
// filename it writes is `${base}_CV.docx`.
//
// The extension produces a DOCX. Any PDF the user holds was made by
// opening that DOCX and exporting it.
//
// That explains the original failure exactly. The letter spacing lived
// in the DOCX heading run (`spacing: 24`); Word carried it into the PDF
// text layer on export, which is why the parser read
// "P R O F ES S I O NA L EXP ER I ENCE" out of a PDF the extension never
// generated. It also means the fix in docx-generator is THE fix, and the
// letter-spacing removed from the two stylesheets was housekeeping on
// code that cannot execute.
//
// So this asserts the architecture rather than pretending to test a
// renderer that never runs. If jsPDF is ever added, the PDF path becomes
// live and this suite must be replaced by a real render-and-parse test:
// the first assertion below fails loudly the moment that happens.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const files = fs.readdirSync(DIR);

console.log('NO PDF ENGINE CAN RUN, BECAUSE jsPDF IS NOT HERE');
{
  t('  no jsPDF file is bundled',
    !files.some((f) => /jspdf/i.test(f)) && !fs.existsSync(path.join(DIR, 'lib')),
    files.filter((f) => /jspdf/i.test(f)).join(', '));
  t('  the manifest does not load one', !/jspdf/i.test(read('manifest.json')), 'manifest references jsPDF');
  t('  popup.html does not load one', !/jspdf/i.test(read('popup.html')), 'popup references jsPDF');
  // Each engine DEPENDS on the global, which is what makes it
  // unreachable. Two guard on it and throw a clean error; the other two
  // destructure it and throw a ReferenceError. The outcome is the same
  // and the dependency is the thing worth asserting, not the manner of
  // the failure.
  const engines = ['professional-pdf-engine.js', 'openresume-generator.js',
    'pdf-ats-turbo.js', 'cv-formatter-perfect-enhanced.js'];
  for (const e of engines) {
    t('  ' + e + ' depends on the absent global',
      /\bjspdf\b/i.test(read(e)),
      'this engine no longer needs jsPDF, so it may now run and a real render test is owed');
  }
}

console.log('\nAND THE POPUP BUILDS A DOCX');
{
  const popupHtml = read('popup.html');
  t('  docx-generator is loaded', /docx-generator\.js/.test(popupHtml), 'absent');
  t('  and it is the only document generator loaded',
    !/professional-pdf-engine|cv-formatter-perfect|openresume-generator|pdf-ats-turbo/.test(popupHtml),
    'a PDF engine is loaded in the popup after all, so it may be reachable');
  t('  the CV filename is a .docx', /_CV\.docx/.test(read('popup.js')), 'no .docx filename');
}

console.log('\nSO THE DOCX IS WHERE EVERY PARSING GUARANTEE HAS TO LIVE');
// Restating the load-bearing ones against the file that actually ships,
// because a PDF exported from it inherits exactly these.
{
  const docx = read('docx-generator.js');
  const headingRun = docx.slice(docx.indexOf('run(upper'), docx.indexOf('run(upper') + 200);
  t('  the heading carries no letter spacing', !/spacing:\s*\d/.test(headingRun),
    headingRun.slice(0, 120));
  t('  one phone rule, exported for anything else that needs it',
    /normalizePhone:\s*normalizePhoneToken/.test(docx), 'not exported');
  t('  dashes are folded where text becomes a run',
    /xmlEscape\(foldDashes\(text\)\)/.test(docx), 'a caller can bypass the dash guard');
  t('  and roles are held together across a page break',
    /keepNext: true/.test(docx), 'no keepNext');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
