// "Could not extract keywords from job description", intermittently, and
// reliably when the same role is tailored more than once.
//
// Two independent causes, both of which make a transient backend problem
// look like a broken job posting.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
const src=require('fs').readFileSync(require('path').join(__dirname,'..','popup.js'),'utf8');

// ---- 1. the fallback was conditioned on the wrong thing ---------------
// performAIKeywordExtraction returns { all: [] } on a 200 that carried no
// keywords -- rate limited, out of quota, or no usable JSON from the
// model. That is a SUCCESS as far as try/catch is concerned, so the local
// fallback in the catch block never ran.
const step1=(/const sessionValid = await this\.refreshSessionIfNeeded\(\);[\s\S]*?Store keywords immediately/m.exec(src)||[''])[0];
t('step 1 was found', step1.length>200, String(step1.length));
t('the local fallback runs when the AI returns nothing, not only when it throws',
  /keywords\.all\.length === 0[\s\S]{0,400}extractKeywordsOptimized/.test(step1)
  || /!keywords \|\| !Array\.isArray\(keywords\.all\) \|\| keywords\.all\.length === 0[\s\S]{0,500}extractKeywordsOptimized/.test(step1),
  'an empty AI result would bypass local extraction entirely');
t('the fallback is outside the catch block',
  step1.indexOf('catch (aiError)') < step1.indexOf('Falling back to local keyword extraction'),
  'still only reachable via an exception');
t('a failing local extraction cannot mask the real error',
  /catch \(localError\)/.test(step1), 'a throw here would replace the useful message');

// The error a user actually sees has to point at the real cause.
t('the failure names the AI service when that is what failed',
  /AI service: /.test(step1), 'user would blame the job page');
t('and says local extraction was tried too',
  /Local extraction found none either/.test(step1), 'looks like the fallback never ran');

// ---- 2. an empty result must be retried, not returned as an answer ----
const ai=(/  async performAIKeywordExtraction\(\)[\s\S]*?\n  \}/m.exec(src)||[''])[0];
t('AI extraction was found', ai.length>500);
t('an empty response is retried while attempts remain',
  /!keywords\.all\.length && attempt < MAX_RETRIES/.test(ai), 'a transient empty became a hard failure');
t('but it still returns on the last attempt, so the caller can fall back',
  /attempt < MAX_RETRIES\)\s*\{[\s\S]{0,200}\}\s*return keywords;/.test(ai), 'would throw past the fallback');

// ---- 3. an empty result must never be cached --------------------------
// The local extractor caches by job URL. Caching an empty result means one
// bad run replays for the whole cache window -- which is exactly why it
// failed consistently on a role that had been tried before.
const local=(/  extractKeywordsOptimized\(jobDescription\)[\s\S]*?\n  \}/m.exec(src)||[''])[0];
t('local extraction was found', local.length>200);
t('only non-empty results are cached',
  /if \(jobUrl && keywords\.all && keywords\.all\.length\)/.test(local),
  'one failure would poison the posting');
t('an earlier empty entry is dropped rather than left to be replayed',
  /keywordCache\.delete\(jobUrl\)/.test(local), 'a poisoned entry would survive');
t('the short-description guard still returns empty without caching',
  /jobDescription\.length < 50[\s\S]{0,120}return \{ all: \[\]/.test(local));

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
