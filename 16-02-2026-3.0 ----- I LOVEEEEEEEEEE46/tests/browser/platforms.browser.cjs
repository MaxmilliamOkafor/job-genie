/**
 * Real-browser verification of every ATS in ats-platforms.js.
 *
 * Two things the earlier harnesses got wrong, both harness bugs:
 *   1. page.route() fulfilment does not trigger content-script injection.
 *      Pages are now served by a local HTTPS server reached over genuine
 *      https:// navigations, so Chromium's own match patterns decide.
 *   2. page.evaluate() runs in the page's MAIN world. Content-script
 *      globals live in the extension's ISOLATED world, so they are
 *      invisible there and the harness read "nothing injected". Probing
 *      now goes through chrome.scripting.executeScript from the service
 *      worker -- the same path popup.js uses in production.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const EXT = S.EXT;
const PORT = 8443;

const AP = S.loadCjs('ats-platforms.js');

// ---- fixtures built FROM the product's own selectors -------------------
function elementFor(sel) {
  const tokens = sel.match(/^([a-zA-Z0-9]*)((?:[#.]|\[)[\s\S]*)?$/);
  if (!tokens) return null;
  const tag = tokens[1] || 'div';
  const rest = tokens[2] || '';
  const attrs = []; const classes = []; let id = '';
  const re = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)([~^$*|]?=)"?([^"\]]*)"?\s*i?\]/g;
  let m; let consumed = 0;
  while ((m = re.exec(rest))) {
    consumed += m[0].length;
    if (m[1]) id = m[1];
    else if (m[2]) classes.push(m[2]);
    else if (m[3]) attrs.push([m[3], m[5]]);
  }
  if (consumed !== rest.length) return null;
  if (/^(main|article|body|html)$/i.test(tag)) return null;
  const parts = [tag];
  if (id) parts.push(`id="${id}"`);
  if (classes.length) parts.push(`class="${classes.join(' ')}"`);
  for (const [k, v] of attrs) parts.push(`${k}="${v}"`);
  return { open: '<' + parts.join(' ') + '>', close: '</' + tag + '>' };
}
function pickDescriptor(p) {
  for (const sel of p.description || []) {
    const el = elementFor(sel);
    if (el) return { sel, el };
  }
  return null;
}
function hostFor(frag) {
  if (frag.indexOf('/') !== -1) return null;
  return frag.split('.').length > 2 ? frag : 'acme.' + frag;
}

const BODY = `
  <h1>Microsoft Dynamics 365 Project Manager</h1>
  <p>Acme Corp is hiring a Project Manager to lead Dynamics 365 delivery in Dublin.</p>
  <p>Questions about this role? Email talent@acme-corp.test and we will respond.</p>
  <p>Requirements: 5+ years project management, stakeholder management, Azure DevOps,
     Agile delivery, budgeting, Power BI reporting, and ERP migration experience.</p>
  <p>For reasonable accommodations contact accommodations@acme-corp.test.</p>`;

const LD = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Microsoft Dynamics 365 Project Manager',
  description: '<p>Acme Corp is hiring a Project Manager to lead Dynamics 365 delivery in Dublin.</p>'
    + '<p>Requirements: 5+ years project management, stakeholder management, Azure DevOps, '
    + 'Agile delivery, budgeting, Power BI reporting and ERP migration experience.</p>',
  identifier: { '@type': 'PropertyValue', value: 'R-2291' },
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp', sameAs: 'https://www.acme-corp.test' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Dublin', addressCountry: 'IE' } },
});

const pageHtml = (desc) => `<!doctype html><html><head><meta charset="utf-8">
<title>Project Manager - Acme Corp</title>
<script type="application/ld+json">${LD}</script></head><body>
${desc.el.open}${BODY}${desc.el.close}
<form>
  <label for="cv">Resume/CV</label><input id="cv" name="resume" type="file">
  <label for="cl">Cover Letter</label><input id="cl" name="cover_letter" type="file">
  <button type="submit">Submit application</button>
</form></body></html>`;

// EVERY host fragment of every platform, not just the first: a vendor's
// second domain (myworkdaysite.com, icims.eu, theresumator.com, ukg.com…)
// is where coverage silently stops.
const CASES = [];
for (const [key, p] of Object.entries(AP.PLATFORMS)) {
  const desc = pickDescriptor(p);
  for (const frag of p.host) {
    const host = hostFor(frag);
    if (!desc || !host) { CASES.push({ key, label: p.label + ' [' + frag + ']', skip: !desc ? 'no buildable selector' : 'path-scoped host' }); continue; }
    const url = key === 'linkedin'
      ? `https://www.${frag}/jobs/view/5477345004/`
      : `https://${host}/careers/jobs/5477345004`;
    CASES.push({
      key,
      label: (p.label + ' [' + frag + ']'),
      host: key === 'linkedin' ? 'www.' + frag : host,
      url,
      desc,
    });
  }
}

const EXCLUDED = [
  ['Lever', 'https://jobs.lever.co/acme/abc-123'],
  ['Ashby', 'https://jobs.ashbyhq.com/acme/abc-123'],
  ['Rippling', 'https://ats.rippling.com/acme/jobs/abc-123'],
  ['Indeed', 'https://www.indeed.com/viewjob?jk=abc123'],
  ['Glassdoor', 'https://www.glassdoor.com/job-listing/pm-acme-JV_123.htm'],
  ['Wellfound', 'https://wellfound.com/jobs/123-pm'],
  ['Otta', 'https://otta.com/jobs/123'],
  ['Workday lookalike', 'https://myworkdayjobs.com.evil.example/careers/jobs/5477345004'],
  ['Greenhouse lookalike', 'https://greenhouse.io.phish.example/careers/jobs/5477345004'],
];

const defaultDesc = { sel: '.job-description', el: { open: '<div class="job-description">', close: '</div>' } };
const byHost = new Map();
for (const c of CASES) if (c.host) byHost.set(c.host, c.desc);

const server = https.createServer(
  S.certs(),
  (req, res) => {
    const host = String(req.headers.host || '').split(':')[0];
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pageHtml(byHost.get(host) || defaultDesc));
  });

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-run4', { recursive: true, force: true });

  const ctx = await chromium.launchPersistentContext('/tmp/pw-run4', S.launchOptions(PORT, '/tmp/pw-run4'));
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });

  async function probe(url) {
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(700);
      return await sw.evaluate(async (wanted) => {
        const tabs = await chrome.tabs.query({});
        const t = tabs.find((x) => x.url === wanted);
        if (!t) return { noTab: true, saw: tabs.map((x) => x.url) };
        const out = {};
        // Declared literally here, not built from a string: the extension's
        // CSP forbids new Function(), and chrome.scripting serialises a
        // real function without eval.
        const inPage = () => {
          const o = {
            href: location.href,
            ats: typeof window.ATSPlatforms,
            src: typeof window.JDContactSources,
            ext: typeof window.JDContactExtractor,
            fileInputs: document.querySelectorAll('input[type=file]').length,
          };
          if (window.ATSPlatforms) {
            const A = window.ATSPlatforms;
            o.platform = A.detect(location.hostname, location.href);
            const ld = A.fromJobPostingLd(document);
            o.ldDesc = (ld.description || '').length;
            o.ldCompany = ld.company || '';
            o.ldLocation = ld.location || '';
            o.ldJobId = ld.jobId || '';
            o.jobId = A.jobIdFromUrl(location.href);
            let best = '';
            for (const s of A.selectorsFor(o.platform, 'description')) {
              try { const el = document.querySelector(s); if (el && el.textContent.length > best.length) best = el.textContent; } catch (e) {}
            }
            o.cssDesc = best.trim().length;
            let t2 = '';
            for (const s of A.selectorsFor(o.platform, 'title')) {
              try { const el = document.querySelector(s); if (el && el.textContent.trim()) { t2 = el.textContent.trim(); break; } } catch (e) {}
            }
            o.title = t2;
          }
          if (window.JDContactSources) {
            try { o.emails = (window.JDContactSources.harvest(document).emails || []).map((e) => e.email); }
            catch (e) { o.harvestError = String(e && e.message); }
          }
          return o;
        };
        try {
          const r = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: inPage });
          Object.assign(out, (r && r[0] && r[0].result) || { execEmpty: true });
        } catch (e) { out.execError = e.message; }
        // The recognition gate: content.js returns before registering its
        // listener when the host is not supported, so "no receiver" IS the
        // rejection signal.
        out.gate = await new Promise((res) => {
          try {
            chrome.tabs.sendMessage(t.id, { action: 'CHECK_READY_STATUS' }, (resp) => {
              if (chrome.runtime.lastError) return res({ noReceiver: chrome.runtime.lastError.message });
              res(resp || { empty: true });
            });
          } catch (e) { res({ err: e.message }); }
        });
        return out;
      }, url);
    } catch (e) {
      return { fatal: e.message };
    } finally { await page.close(); }
  }

  let pass = 0, fail = 0, skipped = 0;
  const failures = [];

  console.log('SUPPORTED PLATFORMS  (detect / JSON-LD / CSS selectors / job id / gate / embedded email)\n');
  for (const c of CASES) {
    if (c.skip) { skipped++; console.log('  SKIP  ' + c.label.padEnd(34) + c.skip); continue; }
    const r = await probe(c.url);
    const gateOk = !!(r.gate && r.gate.supportedHost === true);
    const emailOk = (r.emails || []).includes('talent@acme-corp.test');
    const ok = r.ats === 'object' && r.src === 'object' && r.ext === 'object'
      && r.platform === c.key
      && r.ldDesc > 150 && r.cssDesc > 150
      && /Project Manager/i.test(r.title || '')
      && gateOk && emailOk && r.fileInputs === 2;
    ok ? pass++ : fail++;
    if (!ok) failures.push([c.label, r]);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + c.label.padEnd(34)
      + 'detect=' + String(r.platform || '-').padEnd(16)
      + 'ld=' + String(r.ldDesc || 0).padEnd(5)
      + 'css=' + String(r.cssDesc || 0).padEnd(5)
      + 'id=' + String(r.jobId || r.ldJobId || '-').padEnd(11)
      + 'gate=' + (gateOk ? 'yes' : 'NO ').padEnd(4)
      + 'email=' + (emailOk ? 'yes' : 'NO'));
  }

  console.log('\nEXCLUDED  (must not detect, must not pass the gate)\n');
  for (const [label, url] of EXCLUDED) {
    const r = await probe(url);
    const detected = !!r.platform;
    const gated = !!(r.gate && r.gate.supportedHost === true);
    const ok = !r.fatal && !detected && !gated;
    ok ? pass++ : fail++;
    if (!ok) failures.push([label, r]);
    console.log((ok ? '  PASS  ' : '  FAIL  ') + label.padEnd(22)
      + 'detect=' + String(r.platform || '(none)').padEnd(14)
      + 'gate=' + (gated ? 'PASSED (bad)' : 'blocked'));
  }

  if (failures.length) {
    console.log('\nDETAIL');
    for (const [l, r] of failures) console.log('  ' + l + ': ' + JSON.stringify(r));
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + skipped + ' skipped   (real Chromium, real https origins, extension isolated world)');
  await ctx.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
