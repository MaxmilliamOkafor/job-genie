// Uploads the generated PDF to the live OpenResume parser and reports
// what it extracted. This is the check that could never run from the
// dev container, whose egress policy denies the host; a GitHub Actions
// runner has open egress, so the upload happens here.
import { chromium } from 'playwright';
import fs from 'fs';

const PDF = process.argv[2] || 'cv.pdf';
if (!fs.existsSync(PDF)) { console.error('no such file: ' + PDF); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2200 } });
let failed = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (ok ? '' : '\n           >> ' + detail));
  if (!ok) failed++;
};

try {
  await page.goto('https://www.open-resume.com/resume-parser', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.setInputFiles('input[type="file"]', PDF);
  // The parse is client-side and fast, but the table renders on a tick.
  await page.waitForTimeout(6000);

  const text = await page.evaluate(() => document.body.innerText);
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
  check('the job title carries no employment type',
    !/\(Contract, part-time\)/i.test(text), 'the qualifier is still in the title');
  check('no standard is bolted onto a bullet', !/,\s*with iso 9001/i.test(text),
    'the bolt-on survived');
} catch (e) {
  check('the run itself', false, (e && e.message) || String(e));
} finally {
  await browser.close();
}

console.log('\n' + (failed ? failed + ' FAILED' : 'all checks passed'));
process.exit(failed ? 1 : 0);
