// The test email has drifted from the real one twice: once with an
// explanatory preamble and a [TEST] subject prefix, once by omitting the
// attachments. Both times the test stopped showing what a recruiter would
// actually receive, which is the only thing it is for. This locks the two
// paths together structurally.
let PASS=0,FAIL=0; const t=(n,c,x)=>{c?PASS++:FAIL++;console.log((c?'  PASS  ':'  FAIL  ')+n+(c?'':'\n           >> '+x));};
// Resolved from __dirname, not an absolute path. This read a hardcoded
// /home/user/... path, so it passed on the machine it was written on and
// ENOENT'd everywhere else -- including CI, which was the only thing
// telling the truth about it.
const path = require('path');
const src = require('fs').readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');
const fnMatch=/^  async followupSend\(\{ test \}\) \{[\s\S]*?\n  \}/m.exec(src);
if(!fnMatch){console.log('could not locate followupSend');process.exit(1);}
const fn=fnMatch[0];

// Isolate the test-only branch.
const i=fn.indexOf('if (test) {');
// Strip comments: the explanatory comment legitimately NAMES the old
// mistakes ("[TEST] subject prefix"), and matching that text would flag
// the documentation rather than the code.
const stripComments=(x)=>x.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
const testBranch=stripComments(fn.slice(i, fn.indexOf('\n      }', i)));

t('test branch exists', i>0);
t('subject/body are computed BEFORE the branch',
  fn.indexOf('const subject =')<i && fn.indexOf('const body =')<i,
  'subject at '+fn.indexOf('const subject =')+', body at '+fn.indexOf('const body =')+', branch at '+i);
t('test sends the shared subject, not its own', /\bsubject,/.test(testBranch) && !/subject:\s*['"`]/.test(testBranch), testBranch);
t('test sends the shared body, not its own', /\bbody,/.test(testBranch) && !/body:\s*['"`]/.test(testBranch), testBranch);
t('test does NOT re-render its own tokens', !/renderBlock|buildTokens/.test(testBranch), testBranch);
t('test attaches the documents', /attachments:\s*testFiles/.test(testBranch), testBranch);
t('no [TEST] subject prefix', !/\[TEST\]/.test(testBranch), testBranch);
t('no explanatory preamble prepended', !/A recruiter would receive|-{10,}/.test(testBranch), testBranch);
t('only the recipient differs', /to:\s*ctx\.myEmail/.test(testBranch), testBranch);

console.log('\n'+PASS+' passed, '+FAIL+' failed');
process.exit(FAIL?1:0);
