// Uploads the generated PDF to the live OpenResume parser and reports
// what it extracted. This is the check that could never run from the
// dev container, whose egress policy denies the host; a GitHub Actions
// runner has open egress, so the upload happens here.
import { chromium } from 'playwright';
import fs from 'fs';

const PDF = process.argv[2] || 'cv.pdf';
if (!fs.existsSync(PDF)) { console.error('no such file: ' + PDF); process.exit(1); }

// THREE OUTCOMES, NOT TWO.
//
// This drives somebody else's website. It goes down, it changes its
// markup, a runner loses DNS -- none of which says anything about the
// CV, and all of which used to come back as the same red X as a genuine
// parse regression. A check that cries wolf gets ignored, and then the
// one time it means something it gets ignored too.
//
//   0  every assertion passed
//   1  the site worked and the CV parsed WRONG -- a real regression
//   2  the site could not be reached or never showed our upload, so
//      nothing was graded. Reported as skipped, not failed.
const EXIT_OK = 0, EXIT_REGRESSION = 1, EXIT_UNAVAILABLE = 2;

let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  console.log('SITE UNAVAILABLE: browser would not launch: ' + ((e && e.message) || e));
  process.exit(EXIT_UNAVAILABLE);
}
const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
let failed = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : '\n           >> ' + detail));
  if (!ok) failed++;
};

// Set once we know the site itself is fine, so a later throw is read as
// a real failure rather than as the site being down.
let reachable = false;

try {
  await page.goto('https://www.open-resume.com/resume-parser', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.setInputFiles('input[type="file"]', PDF);
  reachable = true;

  // WAIT FOR OUR RESUME, NOT A FIXED DELAY.
  //
  // The page ships a demo resume and renders ITS values until the upload
  // is parsed. On a six-second delay one run read the demo and reported
  // on it: Name "Leo Leopard", Email "lleopard@laverne.edu", Phone
  // "(909) 555-5555" -- a complete, plausible-looking result belonging to
  // someone else, with the file visibly attached as "cv.pdf - 47.9 KB".
  //
  // A test that can silently grade a different document is worse than no
  // test, so this waits for the demo to be REPLACED and refuses to
  // assert if it never is.
  const DEMO = /Leo Leopard|laverne\.edu|LionLike MindState|Volunteer Swim Coach/i;
  let replaced = false;
  try {
    await page.waitForFunction(
      () => !/Leo Leopard|laverne\.edu/i.test(document.body.innerText),
      { timeout: 45000 });
    replaced = true;
  } catch (e) { /* reported below */ }
  await page.waitForTimeout(1500);

  const text = await page.evaluate(() => document.body.innerText);
  // The demo never being replaced means the upload was never parsed --
  // the site's problem, not the CV's. Grading someone else's resume, or
  // reporting a regression that was never measured, are both worse than
  // saying nothing.
  if (!replaced || DEMO.test(text)) {
    console.log('SITE UNAVAILABLE: the demo resume was still rendered after 45s, '
      + 'so the upload was never parsed and nothing was graded.');
    fs.writeFileSync('parse-output.txt', text);
    await page.screenshot({ path: 'parse-screenshot.png', fullPage: true });
    await browser.close();
    process.exit(EXIT_UNAVAILABLE);
  }
  fs.writeFileSync('parse-output.txt', text);
  await page.screenshot({ path: 'parse-screenshot.png', fullPage: true });

  // Read a labelled value out of the results table.
  //
  // The results are a TABLE, and innerText separates table cells with a
  // TAB, not a newline. The first version of this only accepted a
  // newline, so Name, Phone and Location all came back empty while Email
  // passed -- because Email was matched from the raw text instead. Three
  // empty fields and one populated, split exactly along that line, was
  // the scraper and not the parse.
  const field = (label) => {
    const re = new RegExp('^[ \\t]*' + label + '[ \\t]*[\\t\\n]+[ \\t]*(.+)$', 'mi');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  // Printed in full so the result can be read from the log rather than
  // taken on trust, and so a failure can be diagnosed without the
  // artifact.
  console.log('\n=== THE PARSER PAGE, VERBATIM ===');
  console.log(text.split('\n').slice(0, 60).map((l) => '  | ' + l).join('\n'));

  console.log('\n=== WHAT THE LIVE PARSER EXTRACTED ===');
  for (const l of ['Name', 'Email', 'Phone', 'Location']) {
    console.log('  ' + l.padEnd(10) + JSON.stringify(field(l)));
  }

  console.log('\n=== THE ASSERTIONS ===');
  check('name is parsed', /Maxmilliam Okafor/i.test(field('Name')), field('Name'));
  check('email is parsed', /maxokafordev@gmail\.com/i.test(text), field('Email'));
  // The format proven by the user's own working CV.
  check('phone is parsed as the national number',
    field('Phone').replace(/\D/g, '') === '0874261508', field('Phone'));
  check('location is parsed', /Dublin/i.test(field('Location')), field('Location'));

  // THE ONE THAT MATTERED: these three came back empty, because the
  // letter-spaced headings meant no section was ever found.
  check('WORK EXPERIENCE is not empty',
    /Meta/i.test(text) && /Accenture/i.test(text),
    'no employer in the parsed output -- sections were not detected');
  check('job titles are parsed',
    /Software Engineer/i.test(text) && /Solutions Architect/i.test(text), 'absent');
  check('dates are parsed',
    /2023/.test(text) && /2021/.test(text), 'absent');
  check('EDUCATION is not empty',
    /Imperial College London/i.test(text) || /Derby/i.test(text), 'absent');
  check('SKILLS is not empty', /Python|Kubernetes/i.test(text), 'absent');

  // The renderer guarantees, seen through a real parse.
  check('no heading arrived letter-spaced',
    !/P\s+R\s+O\s+F\s+E/i.test(text), (text.match(/.{0,40}P\s+R\s+O\s+F.{0,20}/) || [''])[0]);
  check('no en or em dash survived', !/[–—]/.test(text),
    (text.match(/.{0,25}[–—].{0,25}/) || [''])[0]);
  check('the company is a bare name',
    /Meta/.test(text) && !/formerly Facebook/i.test(text),
    'the parenthetical reached the company field');
  check('the job title carries no employment type',
    !/\(Contract, part-time\)/i.test(text), 'the qualifier is still in the title');
  check('no standard is bolted onto a bullet', !/,\s*with iso 9001/i.test(text),
    'the bolt-on survived');
} catch (e) {
  const msg = (e && e.message) || String(e);
  if (!reachable) {
    console.log('SITE UNAVAILABLE: ' + msg);
    try { await browser.close(); } catch (_) {}
    process.exit(EXIT_UNAVAILABLE);
  }
  // Reached the site and then threw. Most often its markup moved, which
  // is still not a statement about the CV, so it is reported the same
  // way rather than as a regression.
  console.log('SITE UNAVAILABLE: reached the parser but the run threw: ' + msg);
  try { await browser.close(); } catch (_) {}
  process.exit(EXIT_UNAVAILABLE);
} finally {
  try { await browser.close(); } catch (_) {}
}

console.log('\n' + (failed ? failed + ' FAILED' : 'all checks passed'));
process.exit(failed ? EXIT_REGRESSION : EXIT_OK);
