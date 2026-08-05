// Ten real Greenhouse postings that DO publish an address in the body.
// Every one of these must yield a recipient; a posting that publishes a
// contact and still reports "no address found" is the failure that makes
// the whole follow-up feature pointless.
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP jd-embedded-email: jsdom not installed'); process.exit(0); }
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const loadCjs=(f)=>{const fs=require('fs'),path=require('path'),Module=require('module');
  const file=path.join(__dirname,'..',f);const m=new Module(file,null);m.filename=file;
  m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;};

const dom=new JSDOM('<body></body>',{url:'https://job-boards.greenhouse.io/array/jobs/5477345004'});
global.window=dom.window; global.document=dom.window.document;
global.chrome={runtime:{id:'x'},storage:{local:{get:(k,cb)=>cb({})}}};
const S=loadCjs('jd-contact-sources.js');
const E=loadCjs('jd-contact-extractor.js');

// Greenhouse renders the posting into #content. The address is TYPED into
// the body -- not a mailto link, not JSON-LD. That is the common case and
// the one the harvester could not see.
const page = (bodyHtml) => `
  <nav><a href="/">Jobs</a></nav>
  <div id="content">
    <h1>The Role</h1>
    ${bodyHtml}
  </div>
  <footer>Powered by Greenhouse. See our <a href="/privacy">privacy policy</a>.</footer>`;

const CASES = [
  ['Array',          'talent@array.com',
   'Questions about this role? Reach out to talent@array.com and we will help.'],
  ['Human Interest', 'careers@humaninterest.com',
   'For questions regarding this position, please contact careers@humaninterest.com.'],
  ['GiveDirectly',   'careers@givedirectly.org',
   'General interest applications can be sent to careers@givedirectly.org.'],
  ['Pathward',       'careers@pathward.com',
   'If you need assistance applying, email careers@pathward.com.'],
  ['STR',            'appassist@str.us',
   'Applicants may contact appassist@str.us with questions about the process.'],
  ['Kodiak',         'careers@kodiak.ai',
   'Reach the recruiting team at careers@kodiak.ai.'],
  ['Swift Solar',    'careers@swiftsolar.com',
   'Please direct enquiries to careers@swiftsolar.com.'],
];

for (const [company, expected, sentence] of CASES) {
  document.body.innerHTML = page('<p>'+sentence+'</p>');
  const h = S.harvest(document);
  t(company+': address found on the page', h.emails.some(e=>e.email===expected),
    JSON.stringify(h.emails.map(e=>e.email)));

  // The whole point: this must work even when currentJob.description is
  // truncated or empty, which is what an ATS summary often is.
  const r = E.extract({ jdText:'', url:'https://job-boards.greenhouse.io/x/jobs/1',
                        ownEmail:'maxokafordev@gmail.com', pageSources:h });
  t(company+': chosen as the recipient with no JD text at all', r.email===expected,
    r.email+' (source '+r.emailSource+')');
}

// ---- page furniture must not become a recipient -----------------------
document.body.innerHTML = page(
  '<p>Contact talent@array.com about the role.</p>'
  +'<p>Report abuse to abuse@greenhouse.io or privacy@greenhouse.io.</p>');
let h=S.harvest(document);
let r=E.extract({jdText:'',url:'x',ownEmail:'',pageSources:h});
t('the hiring address wins over ATS boilerplate', r.email==='talent@array.com', r.email);
t('the ATS vendor domain is not offered', !r.allEmails.some(e=>/greenhouse\.io$/.test(e)),
  JSON.stringify(r.allEmails));

// ---- an accommodations mailbox is not a hiring contact ---------------
// It is published for disability accommodation requests. Writing a job
// follow-up there misuses it, and lands badly with the person reading it.
document.body.innerHTML = page(
  '<p>Applicants needing accommodation may email accommodations.apply@energyhub.net.</p>'
  +'<p>For role questions contact careers@energyhub.net.</p>');
h=S.harvest(document);
r=E.extract({jdText:'',url:'x',ownEmail:'',pageSources:h});
t('a careers inbox outranks an accommodations inbox', r.email==='careers@energyhub.net',
  r.email+'  all='+JSON.stringify(r.allEmails));

// Accommodations-only: still better than nothing, but must not be first
// choice if anything else exists. On its own it is all there is.
document.body.innerHTML = page(
  '<p>Applicants requiring accommodation may email accommodations@example.com.</p>');
h=S.harvest(document);
r=E.extract({jdText:'',url:'x',ownEmail:'',pageSources:h});
t('an accommodations-only posting does not silently pick it as the recipient',
  r.email!=='accommodations@example.com' || r.emailSource==='page-text',
  r.email+' ('+r.emailSource+')');

// ---- the user's own address is never the recipient --------------------
document.body.innerHTML = page('<p>Send to maxokafordev@gmail.com</p>');
h=S.harvest(document);
r=E.extract({jdText:'',url:'x',ownEmail:'maxokafordev@gmail.com',pageSources:h});
t('the user is never mailed by their own tool', r.email==='', r.email);

// ---- nothing published still means nothing --------------------------
document.body.innerHTML = page('<p>Apply through the portal. No contact details.</p>');
h=S.harvest(document);
t('a posting with no address yields none', h.emails.length===0, JSON.stringify(h.emails));

// ---- shapes a real posting actually uses ------------------------------
const shape = (html, label, expected, ownEmail) => {
  document.body.innerHTML = page(html);
  const hh = S.harvest(document);
  const rr = E.extract({jdText:'',url:'https://job-boards.greenhouse.io/x/jobs/1',
                        ownEmail:ownEmail||'',pageSources:hh});
  t(label, rr.email===expected, 'got ' + (rr.email||'(none)') + '  all=' + JSON.stringify(rr.allEmails));
};

// No space between the address and the next sentence (block elements run
// together in textContent).
shape('<p>Email talent@array.com</p><p>For details see below.</p>',
  'an address at a block boundary is not merged with the next sentence', 'talent@array.com');
shape('<div>Contact careers@kodiak.ai</div><div>About us</div>',
  'same for divs', 'careers@kodiak.ai');
shape('<li>careers@swiftsolar.com</li><li>Benefits</li>',
  'same for list items', 'careers@swiftsolar.com');

// Sentence punctuation directly after the address.
shape('<p>Write to talent@array.com.</p>', 'a trailing full stop is not part of the address', 'talent@array.com');
shape('<p>Write to talent@array.com, or apply online.</p>', 'a trailing comma is stripped', 'talent@array.com');
shape('<p>(talent@array.com)</p>', 'a closing bracket is stripped', 'talent@array.com');
shape('<p>Questions? talent@array.com!</p>', 'trailing punctuation generally', 'talent@array.com');

// Mixed case and surrounding markup.
shape('<p>Email <strong>Talent@Array.com</strong> today.</p>',
  'case is preserved but still matched', 'Talent@Array.com');
shape('<p>Email <a href="mailto:talent@array.com">our team</a>.</p>',
  'a mailto link still works', 'talent@array.com');
shape('<p>Reach <b>careers</b>@<i>pathward.com</i> for help.</p>',
  'an address split across inline tags is still read', 'careers@pathward.com');

// Multi-part TLDs must survive.
shape('<p>Contact careers@arrayhq.co.uk for details.</p>',
  'a two-part TLD is kept whole', 'careers@arrayhq.co.uk');
shape('<p>Contact careers@arrayhq.co.uk.Next section</p>',
  'a two-part TLD is not extended into the next word', 'careers@arrayhq.co.uk');

// The posting body wins over page furniture.
shape('<p>Contact talent@array.com about the role.</p>',
  'an address in the body is used', 'talent@array.com', 'maxokafordev@gmail.com');

// Several addresses: the hiring one must win.
shape('<p>Press: press@array.com. Legal: legal@array.com. Roles: talent@array.com.</p>',
  'press and legal never outrank a hiring inbox', 'talent@array.com');
shape('<p>General info@array.com. Applications to careers@array.com.</p>',
  'a general info box never outranks careers', 'careers@array.com');
shape('<p>Recruiter aoife.byrne@array.com. Also careers@array.com.</p>',
  'a named recruiter outranks the shared inbox', 'aoife.byrne@array.com');

// Purpose-specific mailboxes must never be first choice.
for (const [addr, label] of [
  ['accommodations@array.com','accommodations'],
  ['accessibility@array.com','accessibility'],
  ['ada@array.com','ADA'],
  ['disability.support@array.com','disability support'],
]) {
  shape('<p>For '+label+' email '+addr+'. For roles email careers@array.com.</p>',
    'a careers inbox outranks the '+label+' inbox', 'careers@array.com');
}

// Nothing may be invented.
shape('<p>Apply via the portal.</p>', 'no address means no recipient', '');
shape('<p>Version 2.0 costs 5.00 and ships 01.02.2026.</p>', 'numbers are not addresses', '');
shape('<p>See https://array.com/careers for more.</p>', 'a URL is not an address', '');
shape('<p>Follow @arrayjobs on X.</p>', 'a social handle is not an address', '');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
