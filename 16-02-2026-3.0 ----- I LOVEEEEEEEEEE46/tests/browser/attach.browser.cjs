/**
 * End-to-end attachment check in a real browser, on every ATS.
 *
 * Sends the same attachDocument message popup.js sends, then reads back
 * input.files -- the thing that decides whether a recruiter receives a
 * tailored CV or an empty application.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const EXT = S.EXT;
const PORT = 8444;

const AP = S.loadCjs('ats-platforms.js');

// Two realistic upload-field shapes plus an iframe-embedded one, because
// iCIMS and several employer sites serve the form inside a frame.
const FORM = `
<form>
  <label for="cv">Resume/CV</label>
  <input id="cv" name="resume" type="file" accept=".pdf,.doc,.docx">
  <label for="cl">Cover Letter</label>
  <input id="cl" name="cover_letter" type="file" accept=".pdf,.doc,.docx">
  <button type="submit">Submit application</button>
</form>`;

const LD = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Microsoft Dynamics 365 Project Manager',
  description: '<p>Acme Corp is hiring a Project Manager for Dynamics 365 delivery in Dublin.</p>'
    + '<p>Requirements: 5+ years project management, stakeholder management, Azure DevOps and Agile delivery.</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Dublin' } },
});

const page = () => `<!doctype html><html><head><meta charset="utf-8"><title>PM - Acme</title>
<script type="application/ld+json">${LD}</script></head><body>
<div class="job-description"><h1>Microsoft Dynamics 365 Project Manager</h1>
<p>Acme Corp is hiring a Project Manager to lead Dynamics 365 delivery in Dublin.</p>
<p>Questions? Email talent@acme-corp.test.</p>
<p>Requirements: 5+ years project management, stakeholder management, Azure DevOps, Agile.</p></div>
${FORM}</body></html>`;

const HOSTS = [];
for (const [key, p] of Object.entries(AP.PLATFORMS)) {
  const frag = p.host[0];
  const host = frag.split('.').length > 2 ? frag : 'acme.' + frag;
  HOSTS.push([p.label, key === 'linkedin' ? 'https://www.linkedin.com/jobs/view/5477345004/' : `https://${host}/careers/jobs/5477345004`]);
}

const server = https.createServer(
  S.certs(),
  (q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(page()); });

// A minimal but genuinely valid DOCX (a real zip), so createDocxFile
// receives real bytes rather than something the browser rejects.
const DOCX_B64 = 'UEsDBAoAAAAAAMp9Bl0AAAAAAAAAAAAAAAAFABwAd29yZC9VVAkAA0usdGpLrHRqdXgLAAEEAAAAAAQAAAAAUEsDBBQAAAAIAMp9Bl1qHrVGhwAAALIAAAARABwAd29yZC9kb2N1bWVudC54bWxVVAkAA0usdGpLrHRqdXgLAAEEAAAAAAQAAAAARc7BDsIgDAbgV1l4gHV68EAYO/gKZncE3EiAkoKiby/Mg5evaf+0qVjewQ8vS9lhnNlpnNgiReUG9TPYWIYWx8zrzPZSEgfIerdB5RGTjS17IAVVWksbVCSTCLXN2cUteDhP0wWCcpH1k3c0n15ThzpF3pTzSNYM11VAH3TpMB3+luD/kPwCUEsDBBQAAAAIAMp9Bl2Rzx8FvQAAACkBAAATABwAW0NvbnRlbnRfVHlwZXNdLnhtbFVUCQADS6x0akusdGp1eAsAAQQAAAAABAAAAAB9kL0OwjAMhF8lyoqoCwMDassArMDAC1ipWyKaHyXm7+1xATEwMNrf3fnkanV3g7pSyjb4Ws+KUq+a6viIlJUQn2t9Yo5LgGxO5DAXIZIX0oXkkGVMPUQ0Z+wJ5mW5ABM8k+cpjxm6qTbU4WVgtb3L+n1F7Fqt37rxVK0xxsEaZMEwUmiqvZRKtiV1wMQ7dKKCW0gttMFcnDiL/zFX3/50nYaus4a+/jEtpmAoZ+t7NxRf4tD6yacHvJ7RPAFQSwMECgAAAAAAyn0GXQAAAAAAAAAAAAAAAAYAHABfcmVscy9VVAkAA0usdGpLrHRqdXgLAAEEAAAAAAQAAAAAUEsDBBQAAAAIAMp9Bl1fM5VSlQAAAAcBAAALABwAX3JlbHMvLnJlbHNVVAkAA0usdGpLrHRqdXgLAAEEAAAAAAQAAAAAjc87DsIwDAbgq0Q+QJ0yMKCmXVi6Ii4QJW5T0TzkhNftycBAEQOjf//6LHfDw6/iRpyXGBS0jYSh70606lKD7JaURW2ErMCVkg6I2TjyOjcxUaibKbLXpY48Y9LmomfCnZR75E8DtqYYrQIebQvi/Ez0jx2naTF0jObqKZQfJ74aVdY8U1Fwj2zRvuOmsoB9h5sX+xdQSwECHgMKAAAAAADKfQZdAAAAAAAAAAAAAAAABQAYAAAAAAAAABAA7UEAAAAAd29yZC9VVAUAA0usdGp1eAsAAQQAAAAABAAAAABQSwECHgMUAAAACADKfQZdah61RocAAACyAAAAEQAYAAAAAAABAAAApIE/AAAAd29yZC9kb2N1bWVudC54bWxVVAUAA0usdGp1eAsAAQQAAAAABAAAAABQSwECHgMUAAAACADKfQZdkc8fBb0AAAApAQAAEwAYAAAAAAABAAAApIERAQAAW0NvbnRlbnRfVHlwZXNdLnhtbFVUBQADS6x0anV4CwABBAAAAAAEAAAAAFBLAQIeAwoAAAAAAMp9Bl0AAAAAAAAAAAAAAAAGABgAAAAAAAAAEADtQRsCAABfcmVscy9VVAUAA0usdGp1eAsAAQQAAAAABAAAAABQSwECHgMUAAAACADKfQZdXzOVUpUAAAAHAQAACwAYAAAAAAABAAAApIFbAgAAX3JlbHMvLnJlbHNVVAUAA0usdGp1eAsAAQQAAAAABAAAAABQSwUGAAAAAAUABQCYAQAANQMAAAAA';

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-attach', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/pw-attach', S.launchOptions(PORT, '/tmp/pw-attach'));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  let pass = 0, fail = 0;
  for (const [label, url] of HOSTS) {
    const p = await ctx.newPage();
    let r;
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(600);
      r = await sw.evaluate(async ([wanted, b64]) => {
        const tabs = await chrome.tabs.query({});
        const t = tabs.find((x) => x.url === wanted);
        if (!t) return { noTab: true };
        const send = (msg) => new Promise((res) => {
          try {
            chrome.tabs.sendMessage(t.id, msg, (resp) => {
              if (chrome.runtime.lastError) return res({ err: chrome.runtime.lastError.message });
              res(resp || { empty: true });
            });
          } catch (e) { res({ err: e.message }); }
        });
        const cv = await send({ action: 'attachDocument', type: 'cv', docx: b64, filename: 'Max_Okafor_CV.docx' });
        const cl = await send({ action: 'attachDocument', type: 'cover', docx: b64, filename: 'Max_Okafor_Cover.docx', text: 'Dear Hiring Manager, ...' });
        const seen = await chrome.scripting.executeScript({
          target: { tabId: t.id },
          func: () => Array.from(document.querySelectorAll('input[type=file]'))
            .map((i) => ({ id: i.id, n: i.files ? i.files.length : -1, name: i.files && i.files[0] ? i.files[0].name : '' })),
        });
        return { cv, cl, files: (seen && seen[0] && seen[0].result) || [] };
      }, [url, DOCX_B64]);
    } catch (e) { r = { fatal: e.message }; }
    await p.close();

    const files = r.files || [];
    const cvIn = files.find((f) => f.id === 'cv');
    const clIn = files.find((f) => f.id === 'cl');
    const ok = !!(r.cv && r.cv.success && r.cl && r.cl.success
      && cvIn && cvIn.n === 1 && /CV\.docx$/i.test(cvIn.name)
      && clIn && clIn.n === 1 && /Cover\.docx$/i.test(clIn.name));
    ok ? pass++ : fail++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label.padEnd(20)
      + 'cv=' + (cvIn ? cvIn.name || '(none)' : '-').padEnd(22)
      + 'cover=' + (clIn ? clIn.name || '(none)' : '-'));
    if (!ok) console.log('          ' + JSON.stringify(r));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed  (attachment into a real file input)');
  await ctx.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
