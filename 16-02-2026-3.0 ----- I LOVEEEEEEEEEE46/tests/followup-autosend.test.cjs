let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const src=require('fs').readFileSync(require('path').join(__dirname,'..','popup.js'),'utf8');

// --- ordering: documents must exist before the note is sent
const iDocx=src.indexOf('this.buildDocxArtifact();');
// See followup-actually-sends: the key no longer carries the base64,
// only the ordering matters here.
const iStore=src.indexOf('ats_lastGeneratedDocuments: lastRun');
const iSend=src.indexOf('await this.autoSendFollowup();');
t('DOCX artifacts built before send', iDocx>0 && iDocx<iSend, 'docx@'+iDocx+' send@'+iSend);
t('documents persisted before send', iStore>0 && iStore<iSend, 'store@'+iStore+' send@'+iSend);
t('send is called exactly once in the flow', (src.match(/await this\.autoSendFollowup\(\);/g)||[]).length===1);

// --- the method's guards
const m=/^  async autoSendFollowup\(\) \{[\s\S]*?\n  \}/m.exec(src);
t('method exists', !!m);
const fn=m[0];
// The toggle now DEFAULTS ON, so the gate reads "=== false", not
// "!== true". What matters is that it is read and that it can stop a send.
t('gated on the followup_enabled toggle',
  /followup_enabled/.test(fn) && /cfg\.followup_enabled === false/.test(fn) && /return;/.test(fn), fn);
t('requires a found recipient', /if \(!ctx\.email\)/.test(fn));
t('requires documents to attach', /followupAttachments\(\)/.test(fn) && /!files\.length/.test(fn), fn);
t('routes through followupSend, so anti-spam policy applies', /this\.followupSend\(\{ test: false \}\)/.test(fn));
t('failures never break the tailoring run', /catch \(e\)/.test(fn));
// Silence was the bug: fifteen applications produced fifteen console
// lines and no visible difference between off, no-recipient and sent.
t('every exit is reported, not just logged',
  ['disabled','no-recipient','no-documents','sent','failed'].every(k=>fn.includes("'"+k+"'")), fn.slice(0,200));
t('the outcome is persisted so it can be checked afterwards',
  /followup_last_outcome/.test(fn), 'no record of what happened');
t('a skipped send explains why no address was found',
  /followupEnrichmentState\(\)/.test(fn), 'dead end for the user');
t('does not send a test email', !/test: true/.test(fn));

// --- the dead queue must be gone
t('no reference to untracked ats_submitted_jobs', !/ats_submitted_jobs/.test(src));
t('no orphaned pending-send queue', !/followup_pending_send/.test(src));

// --- detection is async now, so the auto-send must wait for it
// Contact detection injects into the job tab and may consult a lookup
// provider. If the send does not await it, a slow page produces "no
// address" and the note is silently never sent.
t('contact detection is tracked as a promise',
  /this\.contactDetection\s*=[\s\S]{0,120}followupDetectContact\(\)/.test(src), 'fire and forget');
t('the auto-send waits for contact detection',
  /await this\.contactDetection/.test(fn),
  'would decide "no address" mid-detection');
t('waiting for detection cannot fail the send',
  /try\s*\{\s*await this\.contactDetection;\s*\}\s*catch/.test(src), 'a detection error would abort the note');

// --- detection must not be a side effect of an unrelated feature
// It used to sit at the end of the ApplyVerdict block inside the
// qualification-threshold branch, giving it four independent ways to never
// run -- either engine missing, or either call throwing -- each caught and
// logged as a verdict failure. Fifteen applications completed perfectly and
// never looked for anybody to send to.
const detectAt=src.indexOf('this.contactDetection = Promise.resolve()');
t('detection is started exactly once',
  (src.match(/this\.contactDetection\s*=\s*Promise\.resolve\(\)/g)||[]).length===1);
t('detection does not live inside the ApplyVerdict block',
  detectAt < src.indexOf("typeof ApplyVerdict !== 'undefined'"), 'gated behind the verdict panel');
t('detection does not live inside the qualification-threshold block',
  detectAt < src.indexOf("typeof QualificationThresholdEngine !== 'undefined'"), 'gated behind the threshold engine');
t('detection runs before document generation starts',
  detectAt < src.indexOf('const startTime = Date.now()'), 'serialised after tailoring');
t('detection is not wrapped in another feature\'s try/catch',
  /this\._tailoringInProgress = true;[\s\S]{0,1400}this\.contactDetection = Promise\.resolve\(\)/.test(src),
  'not hoisted to the top of the run');

// --- the follow-up must never be able to break the tailoring run
// Hoisting detection to the top of tailorDocuments moved it OUT of another
// feature's try block and left it in the middle of the tailoring path with
// no guard of its own: a synchronous throw kills the run, and a rejected
// promise nobody awaits surfaces as an unhandled error. The CV is the
// product; finding a recipient is an extra.
t('the hoisted detection cannot throw synchronously',
  /this\.contactDetection = Promise\.resolve\(\)/.test(src), 'a throw would kill the tailoring run');
t('and cannot leave an unhandled rejection',
  /this\.contactDetection = Promise\.resolve\(\)[\s\S]{0,400}\.catch\(/.test(src), 'unhandled rejection');
t('nothing in detection runs outside its own try',
  /async followupDetectContact\(\)\s*\{\s*\n\s*try \{/.test(src), 'unguarded statements before the try');
t('the send step is isolated from the tailoring run',
  /try \{\s*\n\s*await this\.autoSendFollowup\(\);\s*\n\s*\} catch/.test(src),
  'a failed note would report as a failed tailor');
t('reporting a failed send cannot itself fail the run',
  /catch \(reportError\)/.test(src), 'the error reporter can throw too');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
