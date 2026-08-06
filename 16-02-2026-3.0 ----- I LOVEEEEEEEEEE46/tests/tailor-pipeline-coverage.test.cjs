// The chain the user actually cares about: read the JD -> extract
// keywords -> tailor -> generate DOCX -> attach both files. Steps that
// operate on TEXT are platform-independent by construction; the two that
// touch the PAGE are not, and those are the ones worth asserting.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const fs=require('fs'),path=require('path');
const DIR=path.join(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(DIR,f),'utf8');
const popupJs=read('popup.js'), contentJs=read('content.js');
const manifest=JSON.parse(read('manifest.json'));

// ---- 1. reading the JD is platform-aware AND has a universal source ---
t('the description comes from the shared platform map',
  /AP\.selectorsFor\(platformKey, 'description'\)/.test(contentJs), 'per-platform selectors would be lost');
t('and from JobPosting JSON-LD, which works anywhere',
  /AP\.fromJobPostingLd\(document\)/.test(contentJs), 'an unlisted platform would have no source');
t('the fuller of the two wins',
  /ldDesc\.length >= cssDesc\.length \? ldDesc : cssDesc/.test(contentJs), 'a summary could replace the posting');

// ---- 2. keyword extraction works from text, so it is platform-free ----
// Its only dependency is a description, which is why a truncated one
// surfaced as "could not extract keywords" on every platform equally.
t('keyword extraction reads the description, not the page',
  /extractKeywordsOptimized\(this\.currentJob\.description\)/.test(popupJs), 'would be platform-coupled');
t('the AI path falls back to local extraction on an EMPTY result',
  /Falling back to local keyword extraction/.test(popupJs), 'a rate limit would fail the run');
t('an empty result is never cached against the job URL',
  /if \(jobUrl && keywords\.all && keywords\.all\.length\)/.test(read('popup.js')), 'one failure would stick');

// ---- 3. tailoring and generation are text in, text out ---------------
for (const [what, re] of [
  ['tailoring consumes the JD text', /jdText:\s*this\.currentJob\.description/],
  ['the CV is generated from the tailored text', /buildDocxArtifact/],
  ['both documents are produced before any send', /ats_lastGeneratedDocuments/],
]) t(what + ' (so it is platform-independent)', re.test(popupJs), 'not found');

// ---- 4. ATTACHING touches the page, so it must reach every frame -----
// iCIMS renders the application inside icims_formFrame, and Greenhouse,
// SmartRecruiters and Workable widgets are routinely embedded in a
// company's own careers page. Top-frame-only reports "no upload field".
const mainBlock = manifest.content_scripts.find((cs) => (cs.js || []).includes('content.js'));
t('content.js runs in every frame', mainBlock && mainBlock.all_frames === true,
  'the upload input is often inside an iframe');
t('the attach request is delivered per frame',
  /attachInAnyFrame/.test(popupJs), 'one frame would answer for all of them');
// sendMessage without a frameId reaches every frame but returns only the
// FIRST reply, so a frame with no upload field would mask a frame with one.
t('a frame that has no upload field cannot mask one that does',
  /if \(r && r\.success\) return r;/.test(popupJs), 'first answer would win');
t('frame IDs are discovered without a new permission',
  /allFrames: true[\s\S]{0,200}frameId/.test(popupJs), 'would need webNavigation');
t('it still works when frame discovery fails',
  /if \(!frameIds\.length\) return \(await ask\(undefined\)\)/.test(popupJs), 'no top-frame fallback');

// ---- 5. the attach itself is generic, not per-platform ---------------
t('any file input is considered, on any ATS',
  /querySelectorAll\('input\[type="file"\]'\)/.test(contentJs), 'would need a rule per platform');
t('CV and cover letter are told apart by their labels, not the hostname',
  /function isCVField/.test(contentJs) && /labels\?\.\[0\]\?\.textContent/.test(contentJs),
  'a per-platform rule would not generalise');
t('a cover letter typed into a textarea also counts',
  /textareas[\s\S]{0,200}\/cover\/i/.test(contentJs), 'sites without a cover upload would fail');

// ---- 6. DOCX is what gets attached, on every platform ----------------
t('DOCX is preferred over PDF for parseability',
  /docx,\s*\/\/ preferred: DOCX base64/.test(popupJs), 'PDF parses worse in most ATS');
t('PDF remains a fallback rather than being dropped',
  /pdf: doc,\s*\/\/ fallback only/.test(popupJs));

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
