/**
 * The two-page ATS flow, in a real browser, on every platform.
 *
 * Most ATS show the description at one URL and the FORM at another. This
 * navigates the way a user does -- open the posting, press Apply, land on
 * the form -- and then asks whether the extension still has a job
 * description to extract keywords from, a company to address an email to,
 * and the address that was printed in the JD body.
 *
 * Before jd-context.js it had none of them on the second page, and had
 * additionally overwritten what it captured on the first.
 */
const S = require('./support.cjs');
const { chromium } = S.skipUnlessReady(require('path').basename(__filename));
const https = require('https');
const fs = require('fs');

const PORT = 8446;
const AP = S.loadCjs('ats-platforms.js');

let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

// Posting URL -> apply URL, in the shapes these platforms actually use.
// Anything not named here gets the common /apply tail.
const APPLY_TAIL = {
  greenhouse: '/application',
  teamtailor: '/applications/new',
  recruitee: '/c/new',
  icims: '/candidate',
  workday: '/apply',
  personio: '/applications/new',
};

const DESC = `
  <h1>Microsoft Dynamics 365 Project Manager</h1>
  <p>Acme Corp is hiring a Project Manager to lead Dynamics 365 delivery in Dublin.</p>
  <p>Questions about this role? Email talent@acme-corp.test and we will respond.</p>
  <p>Requirements: 5+ years project management, stakeholder management, Azure DevOps,
     Agile delivery, budgeting, Power BI reporting, and ERP migration experience.</p>`;

const LD = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Microsoft Dynamics 365 Project Manager',
  description: '<p>Acme Corp is hiring a Project Manager to lead Dynamics 365 delivery in Dublin.</p>'
    + '<p>Requirements: 5+ years project management, stakeholder management, Azure DevOps, Agile delivery.</p>',
  hiringOrganization: { '@type': 'Organization', name: 'Acme Corp' },
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Dublin' } },
});

// The posting: description, address, an Apply link. No form.
const postingHtml = (applyPath) => `<!doctype html><html><head><meta charset="utf-8">
<title>Project Manager - Acme Corp</title>
<script type="application/ld+json">${LD}</script></head><body>
<div class="job-description">${DESC}</div>
<a id="applyBtn" href="${applyPath}">Apply now</a>
</body></html>`;

// The application page: a form, and nothing else. This is the point --
// there is no description here to fall back on.
const applyHtml = () => `<!doctype html><html><head><meta charset="utf-8">
<title>Apply</title></head><body>
<h1>Apply</h1>
<form>
  <label for="fn">First name</label><input id="fn" name="first_name">
  <label for="ln">Last name</label><input id="ln" name="last_name">
  <label for="em">Email</label><input id="em" name="email" type="email">
  <label for="cv">Resume/CV</label><input id="cv" name="resume" type="file">
  <label for="cl">Cover Letter</label><input id="cl" name="cover_letter" type="file">
  <button type="submit">Submit application</button>
</form></body></html>`;

const CASES = [];
for (const [key, p] of Object.entries(AP.PLATFORMS)) {
  if (key === 'linkedin') continue;              // not a tailoring target
  const frag = p.host[0];
  const host = frag.split('.').length > 2 ? frag : 'acme.' + frag;
  const base = key === 'dayforce'
    ? '/CandidatePortal/en-US/acme/Posting/View/5477345004'
    : '/careers/jobs/5477345004';
  const apply = key === 'dayforce'
    ? '/CandidatePortal/en-US/acme/Posting/Apply/5477345004'
    : base + (APPLY_TAIL[key] || '/apply');
  CASES.push({ key, label: p.label, host, jd: `https://${host}${base}`, apply: `https://${host}${apply}` });
}

const server = https.createServer(S.certs(), (req, res) => {
  const url = req.url || '/';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  // Anything that looks like an application step gets the form page.
  if (/\/(apply|application|applications|candidate|submit)(\/new)?\/?$/i.test(url)
      || /\/c\/new\/?$/i.test(url) || /Posting\/Apply/i.test(url)) {
    res.end(applyHtml());
  } else {
    // Match on HOST: every platform shares the same posting path here, so
    // matching on path hands them all the first platform's apply tail.
    const host = String(req.headers.host || '').split(':')[0];
    const m = CASES.find((c) => c.host === host);
    res.end(postingHtml(m ? m.apply.replace(/^https:\/\/[^/]+/, '') : '/apply'));
  }
});

(async () => {
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  fs.rmSync('/tmp/pw-twopage', { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext('/tmp/pw-twopage', S.launchOptions(PORT));
  const sw = await S.serviceWorker(ctx);

  console.log('POSTING -> APPLY  (does the job survive the navigation?)\n');
  for (const c of CASES) {
    const page = await ctx.newPage();
    let r;
    try {
      // 1. the posting. content.js captures it here.
      await page.goto(c.jd, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2200);          // the capture is on a settle timer

      // 2. press Apply, exactly as a user would.
      await page.click('#applyBtn');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(700);

      // 3. on the form page, ask the extension what it knows.
      r = await sw.evaluate(async (applyUrl) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((x) => x.url === applyUrl);
        if (!tab) return { noTab: true, saw: tabs.map((x) => x.url).slice(0, 5) };
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async () => {
            const out = { href: location.href, ctx: typeof window.JDContext };
            // What the page ITSELF offers -- the failure being fixed.
            let own = 0;
            for (const s of (window.ATSPlatforms ? window.ATSPlatforms.allDescriptionSelectors() : ['main'])) {
              try { const el = document.querySelector(s); if (el) own = Math.max(own, (el.textContent || '').trim().length); } catch (e) {}
            }
            out.ownDesc = own;
            out.ownEmails = window.JDContactSources
              ? (window.JDContactSources.harvest(document).emails || []).length : -1;
            out.isApplyPage = window.JDContext ? window.JDContext.isApplicationPage(document, location.href) : null;
            if (window.JDContext) {
              const rec = await window.JDContext.recall(location.href, {});
              out.recalled = rec ? {
                via: rec._via,
                desc: (rec.description || '').length,
                company: rec.company || '',
                title: rec.title || '',
                emails: (rec.emails || []).map((e) => e.email),
              } : null;
            }
            out.fileInputs = document.querySelectorAll('input[type=file]').length;
            return out;
          },
        });
        return (res && res[0] && res[0].result) || { execEmpty: true };
      }, c.apply);
    } catch (e) {
      r = { fatal: e.message };
    }
    await page.close();

    const rec = r && r.recalled;
    const ok = !!(r && !r.fatal
      && r.ownDesc < 400                    // the apply page really has no JD
      && r.ownEmails === 0                  // and no address of its own
      && rec && rec.desc > 300              // yet the posting is available
      && rec.company === 'Acme Corp'
      && /Project Manager/i.test(rec.title || '')
      && rec.emails.includes('talent@acme-corp.test')
      && r.fileInputs === 2);
    ok ? PASS++ : FAIL++;
    console.log((ok ? '  PASS  ' : '  FAIL  ') + c.label.padEnd(20)
      + 'pageJD=' + String((r && r.ownDesc) || 0).padEnd(6)
      + 'recalled=' + String(rec ? rec.desc : 0).padEnd(6)
      + 'via=' + String(rec ? rec.via : '-').padEnd(6)
      + 'company=' + String(rec ? rec.company : '-').padEnd(12)
      + 'email=' + (rec && rec.emails.includes('talent@acme-corp.test') ? 'carried' : 'LOST'));
    if (!ok) console.log('          ' + JSON.stringify(r));
  }

  console.log('\n' + PASS + ' passed, ' + FAIL + ' failed  (two-page ATS flow, real Chromium)');
  await ctx.close();
  server.close();
  process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.log('HARNESS FAILED:', e.stack); process.exit(1); });
