let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const src=require('fs').readFileSync(require('path').join(__dirname,'..','popup.js'),'utf8');

// --- ordering: documents must exist before the note is sent
const iDocx=src.indexOf('this.buildDocxArtifact();');
const iStore=src.indexOf('ats_lastGeneratedDocuments: this.generatedDocuments');
const iSend=src.indexOf('await this.autoSendFollowup();');
t('DOCX artifacts built before send', iDocx>0 && iDocx<iSend, 'docx@'+iDocx+' send@'+iSend);
t('documents persisted before send', iStore>0 && iStore<iSend, 'store@'+iStore+' send@'+iSend);
t('send is called exactly once in the flow', (src.match(/await this\.autoSendFollowup\(\);/g)||[]).length===1);

// --- the method's guards
const m=/^  async autoSendFollowup\(\) \{[\s\S]*?\n  \}/m.exec(src);
t('method exists', !!m);
const fn=m[0];
t('gated on the followup_enabled toggle', /followup_enabled/.test(fn) && /!== true\) return/.test(fn), fn);
t('requires a found recipient', /if \(!ctx\.email\)/.test(fn));
t('requires documents to attach', /followupAttachments\(\)/.test(fn) && /!files\.length/.test(fn), fn);
t('routes through followupSend, so anti-spam policy applies', /this\.followupSend\(\{ test: false \}\)/.test(fn));
t('failures never break the tailoring run', /catch \(e\)/.test(fn) && /console\.warn/.test(fn));
t('does not send a test email', !/test: true/.test(fn));

// --- the dead queue must be gone
t('no reference to untracked ats_submitted_jobs', !/ats_submitted_jobs/.test(src));
t('no orphaned pending-send queue', !/followup_pending_send/.test(src));

// --- detection is async now, so the auto-send must wait for it
// Contact detection injects into the job tab and may consult a lookup
// provider. If the send does not await it, a slow page produces "no
// address" and the note is silently never sent.
t('contact detection is tracked as a promise',
  /this\.contactDetection\s*=\s*this\.followupDetectContact\(\)/.test(src), 'fire and forget');
t('the auto-send waits for contact detection',
  /async autoSendFollowup\(\)[\s\S]{0,900}await this\.contactDetection/.test(src),
  'would decide "no address" mid-detection');
t('waiting for detection cannot fail the send',
  /try\s*\{\s*await this\.contactDetection;\s*\}\s*catch/.test(src), 'a detection error would abort the note');

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
