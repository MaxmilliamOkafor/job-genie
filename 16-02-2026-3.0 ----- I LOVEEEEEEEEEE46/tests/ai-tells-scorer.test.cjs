// AN INBUILT AI-TELL SCORE, COMPUTED LOCALLY.
//
// The alternative was a real classifier -- Desklib, the old OpenAI
// RoBERTa detector -- and both are Python and PyTorch. Running one from a
// Chrome extension means sending the CV to a server, which is exactly the
// exposure this extension exists to avoid. A detector that leaks the
// document it is protecting is not a trade worth making.
//
// So this takes the heuristics rather than the model. What it must do is
// point the right way: fall when the text genuinely improves, stay quiet
// on writing that is already human, and name what is wrong rather than
// just producing a number.
//
// What it is NOT is QuillBot's score. Different model, different
// training, and their own report says no detector is reliable. These
// tests pin direction, never a specific value.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
{
  const f = path.join(DIR, 'content-quality-engine.js');
  const m = new Module(f, null); m.filename = f;
  m.paths = Module._nodeModulePaths(DIR); m._compile(fs.readFileSync(f, 'utf8'), f);
}
const E = global.ContentQualityEngine;

// The cover letter that scored 100% on QuillBot, verbatim.
const REAL = 'I am writing to express my interest in the Integration Engineer position '
  + 'at Career2. With a strong foundation in software engineering and cloud technologies, '
  + 'I have successfully designed and implemented scalable solutions that enhance '
  + 'operational efficiency and user experience. My recent role at Meta involved building '
  + 'a CI/CD platform that reduced model release cycles significantly, which aligns well '
  + 'with the goals of your integration team. This experience honed my skills in '
  + 'integration engineering and cloud architecture. I am excited about the opportunity '
  + 'to work at Career2 and contribute to innovative projects that make a difference. '
  + 'I am available for an interview at your earliest convenience and look forward to '
  + 'discussing how my skills and experiences align with your needs.';

console.log('IT POINTS THE RIGHT WAY');
{
  const before = E.scoreAiTells(REAL);
  const after = E.scoreAiTells(E.sanitiseContent(REAL, { removePronouns: false }));
  t('  the untouched letter scores something', before.score > 0, JSON.stringify(before));
  t('  running it through the pipeline LOWERS the score',
    after.score < before.score, before.score + ' -> ' + after.score);
  t('  and the stock phrasing is what went',
    before.tells.some((x) => x.kind === 'stock-phrasing')
      && !after.tells.some((x) => x.kind === 'stock-phrasing'),
    JSON.stringify(after.tells));
}

console.log('\nIT NAMES WHAT IS WRONG, NOT JUST A NUMBER');
{
  const r = E.scoreAiTells('Built the ingestion layer, enabling faster queries. '
    + 'Rebuilt the batch jobs, ensuring same-day reporting. '
    + 'Refactored the API layer, allowing wider reuse. '
    + 'Tuned the cache layer, providing lower latency across the estate. '
    + 'Split the monolith apart, delivering independent deploys for each team.');
  t('  participial tails are caught by name',
    r.tells.some((x) => x.kind === 'participial-tails'), JSON.stringify(r.tells));
  t('  and counted', (r.tells.find((x) => x.kind === 'participial-tails') || {}).count >= 4,
    JSON.stringify(r.tells));
}

console.log('\nIT STAYS QUIET ON WRITING THAT IS ALREADY HUMAN');
{
  // Varied lengths, concrete nouns, active voice, no formulas.
  const human = 'I spent four years on payments at Citi. Most of it was unglamorous: '
    + 'the nightly batch took eleven hours and nobody trusted the numbers it produced. '
    + 'I rewrote it in Airflow. It now finishes before breakfast, which meant the risk '
    + 'team could finally act on the same day rather than the next one. That is the work '
    + 'I want more of. I read that your team is rebuilding its ledger and I would like to '
    + 'help. My notice is a month.';
  const r = E.scoreAiTells(human);
  t('  human prose scores low', r.score <= 25, JSON.stringify(r));
  t('  and no stock phrasing is claimed',
    !r.tells.some((x) => x.kind === 'stock-phrasing'), JSON.stringify(r.tells));
}

console.log('\nAND IT REFUSES TO JUDGE WHAT IT CANNOT');
{
  const r = E.scoreAiTells('Short bio. Two lines only.');
  t('  a short fragment returns no verdict', r.score === 0 && /too short/.test(r.note),
    JSON.stringify(r));
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
