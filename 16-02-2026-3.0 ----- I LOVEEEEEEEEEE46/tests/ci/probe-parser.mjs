// A DISCOVERY PASS OVER A PARSER I CANNOT SEE FROM THE DEV CONTAINER.
//
// open-resume is asserted properly because its source is public and its
// page shape is known. For the others -- Past the Bots, which simulates
// Workday, Greenhouse, Taleo, Lever and iCIMS, and the rest -- the page
// shape is unknown from here, and guessing selectors then asserting
// against the guess would produce a green tick that means nothing.
//
// So this uploads the CV, reports what the page did, and does NOT
// assert. It exists to learn the shape so the next commit can assert.
// It never fails the build: an exploratory step that goes red teaches
// nothing and hides the step that matters.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = process.argv[2];
const PDF = process.argv[3] || 'cv.pdf';
const TAG = (process.argv[4] || 'probe').replace(/[^a-z0-9-]/gi, '');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });
try {
  console.log('--- ' + URL);
  const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('  http ' + (res && res.status()));
  console.log('  title ' + JSON.stringify(await page.title()));

  // A landing page that renders a SAMPLE report is the trap open-resume
  // set: pastthebots.com shows "Jordan Rivera / PARSE HEALTH 58 / JD
  // MATCH 41" as marketing, and reading that back as a score for our CV
  // would be inventing a result. Flagged so the log cannot mislead.
  const pre = (await page.evaluate(() => document.body.innerText)) || '';
  const sample = /Jordan Rivera|sample report|illustrative/i.test(pre);
  if (sample) console.log('  NOTE: this page renders its own SAMPLE report. '
    + 'Any score visible before an upload belongs to the sample, not to us.');

  const inputs = await page.locator('input[type="file"]').count();
  console.log('  file inputs on the page: ' + inputs);
  // A site that needs an account will say so long before it takes a file.
  const body = (await page.evaluate(() => document.body.innerText)) || '';
  const gated = /sign in|sign up|log in|create an account|start free trial/i.test(body.slice(0, 3000));
  console.log('  looks account-gated: ' + gated);

  if (inputs > 0) {
    await page.locator('input[type="file"]').first().setInputFiles(PDF);
    await page.waitForTimeout(12000);
    const after = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync('probe-' + TAG + '.txt', after);
    console.log('  --- page after upload, first 60 lines ---');
    console.log(after.split('\n').slice(0, 60).map((l) => '  | ' + l).join('\n'));
  } else {
    // The input is commonly rendered only after a call-to-action is
    // clicked, so try the obvious ones before giving up.
    for (const label of [/check my r|check r|upload|get started free|scan|analyse|analyze/i]) {
      try {
        const btn = page.getByRole('link', { name: label }).or(page.getByRole('button', { name: label })).first();
        if (await btn.count()) {
          await btn.click({ timeout: 5000 });
          await page.waitForTimeout(4000);
          const n = await page.locator('input[type="file"]').count();
          console.log('  after clicking a call-to-action, file inputs: ' + n + ' at ' + page.url());
          if (n > 0) {
            await page.locator('input[type="file"]').first().setInputFiles(PDF);
            await page.waitForTimeout(15000);
            const after = await page.evaluate(() => document.body.innerText);
            fs.writeFileSync('probe-' + TAG + '.txt', after);
            console.log('  --- after upload, first 12 lines ---');
            console.log(after.split('\n').slice(0, 12).map((l) => '  | ' + l).join('\n'));
            await page.screenshot({ path: 'probe-' + TAG + '.png', fullPage: true });
            break;
          }
        }
      } catch (e) { console.log('  cta attempt: ' + String(e.message).split('\n')[0]); }
    }
    console.log('  (no direct file input on the landing page)');
    fs.writeFileSync('probe-' + TAG + '.txt', body);
    console.log(body.split('\n').slice(0, 40).map((l) => '  | ' + l).join('\n'));
  }
  await page.screenshot({ path: 'probe-' + TAG + '.png', fullPage: true });
} catch (e) {
  console.log('  probe could not complete: ' + ((e && e.message) || e).split('\n')[0]);
} finally {
  await browser.close();
}
// Always zero: this pass reports, it does not judge.
process.exit(0);
