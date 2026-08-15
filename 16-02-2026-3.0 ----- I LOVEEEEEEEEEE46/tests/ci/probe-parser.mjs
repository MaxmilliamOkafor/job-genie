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
    console.log('  no file input: the upload is behind a control this pass does not drive');
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
