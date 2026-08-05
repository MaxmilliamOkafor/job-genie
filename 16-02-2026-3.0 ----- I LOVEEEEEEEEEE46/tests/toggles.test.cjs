// Every toggle must do four things: persist on change, restore on load, be
// honoured by the feature it names, and not be a decoration. followup_enabled
// was written and restored for weeks while nothing read it, so the fourth
// check is the one that matters.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'  >> '+x));};
const fs=require('fs'), path=require('path');
const DIR=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(DIR,'popup.js'),'utf8');
const html=fs.readFileSync(path.join(DIR,'popup.html'),'utf8');
const others=fs.readdirSync(DIR).filter(f=>f.endsWith('.js')&&f!=='popup.js')
  .map(f=>[f,fs.readFileSync(path.join(DIR,f),'utf8')]);

// id -> [storage key, who must honour it]
const SPEC=[
  ['autofillEnabledToggle','autofill_enabled','autofill-controller.js'],
  ['linkedinAutofillToggle','linkedin_autofill_enabled','linkedin-autofill.js'],
  ['linkedinAutoAdvanceToggle','linkedin_autoadvance_enabled','linkedin-autofill.js'],
  ['linkedinAutoSubmitToggle','linkedin_autosubmit_enabled','linkedin-autofill.js'],
  ['followupEnabledToggle','followup_enabled',null],
  ['followupAttachToggle','followup_attach_enabled',null],
  ['workdayAutoToggle','workday_auto_enabled','background.js'],
];
for(const [id,key,owner] of SPEC){
  t(id+': present in popup.html', html.includes('id="'+id+'"'));
  const h1="getElementById('"+id+"')?.addEventListener('change'";
  const h2="getElementById('"+id+"').addEventListener('change'";
  t(id+': has a change handler', js.includes(h1)||js.includes(h2), 'no handler');
  t(id+': writes '+key, js.includes(key), 'key never written');
  t(id+': restored on load', js.includes('result.'+key), 'never restored');
  if(owner){
    const src=(others.find(o=>o[0]===owner)||[])[1]||'';
    t(id+': honoured by '+owner, src.includes(key), owner+' never reads '+key);
  }
}
// followup_enabled must be READ, not just stored -- the original bug.
t('followup_enabled is acted on, not decorative', js.includes('cfg.followup_enabled !== true)'), 'nothing reads it');
t('followup_attach_enabled is acted on', js.includes('followup_attach_enabled'));
// auto-submit must depend on auto-advance
t('auto-submit requires auto-advance', js.includes('Turn on Auto-advance first'));
t('turning auto-advance off clears auto-submit', js.includes('patch.linkedin_autosubmit_enabled = false'));
console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
