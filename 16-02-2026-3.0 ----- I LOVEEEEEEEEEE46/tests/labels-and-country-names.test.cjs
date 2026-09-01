// TWO SMALL THINGS THAT COST REAL APPLICATIONS.
//
// 1. "Soft SKILLS: Communication, Collaboration" shipped beside
//    "Programming:" and "Cloud & DevOps:". The model half shouted a
//    label and nothing normalised it, so one line on the page read as
//    a mistake in the section a recruiter scans for competence.
//
// 2. The profile app moved its work-authorisation chips to full
//    country NAMES and added a country-names array beside the ISO
//    codes. authorisedCountries upper-cased whatever arrived and the
//    matcher compared it against ISO codes -- so "Ireland" became
//    "IRELAND", never matched "IE", and the work-authorisation answer
//    came out "No". That is a knockout answer, produced by a change
//    meant to be cosmetic. Names, codes and mixed lists all resolve to
//    the code now, and every EEA code the profile can hold has a name
//    to resolve from.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..');
global.window = global;
const load = (f) => {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
};
for (const f of ['docx-generator.js', 'content-quality-engine.js', 'recruiter-audit.js']) load(f);
load('autofill-core.js');
const RA = global.RecruiterAudit;
const AC = global.AutofillCore || global.autofillCore;

console.log('A GROUP LABEL IS TITLE CASE, WHATEVER THE MODEL SHOUTED');
{
  const cv = ['Max Okafor', 'Data Analyst', 'Dublin, IE | a@b.com', '',
    'TECHNICAL SKILLS',
    'Programming: Python, SQL',
    'Soft SKILLS: Communication, Collaboration',
    'cloud and devops: AWS, Docker',
    'DATA ENGINEERING: Airflow, Kafka',
    'CRM & analytics: Salesforce, Power BI', '',
    'EDUCATION', 'Imperial College London'].join('\n');
  const o = RA.normaliseSkillLabels(cv);
  for (const [bad, good] of [
    ['Soft SKILLS:', 'Soft Skills:'],
    ['cloud and devops:', 'Cloud and DevOps:'],
    ['DATA ENGINEERING:', 'Data Engineering:'],
    ['CRM & analytics:', 'CRM & Analytics:'],
  ]) {
    t('  "' + bad + '" -> "' + good + '"',
      o.text.indexOf(good) !== -1 && o.text.indexOf(bad) === -1,
      o.text.split('\n').find((l) => new RegExp(good.split(':')[0], 'i').test(l)));
  }
  t('  a correct label is untouched', o.text.indexOf('Programming: Python, SQL') !== -1,
    'a good label was churned');
  t('  the items after the colon keep their casing',
    /Communication, Collaboration/.test(o.text) && /AWS, Docker/.test(o.text),
    'skill items were lower-cased');
  t('  and acronyms stay upper', /CRM & Analytics/.test(o.text) && /DevOps/.test(o.text),
    o.text.split('\n').filter((l) => /CRM|DevOps/.test(l)).join(' / '));
}
{
  // Only inside the skills section: a bullet or a project link line
  // elsewhere carries colons too.
  const cv = ['Max Okafor', '', 'PROFESSIONAL EXPERIENCE', 'Meta', 'Software Engineer',
    'January 2023 - Present', '- Owned CI/CD: built the release pipeline.', '',
    'PROJECTS', 'SignalDesk', 'Live demo: https://example.com', '',
    'TECHNICAL SKILLS', 'Soft SKILLS: Communication'].join('\n');
  const o = RA.normaliseSkillLabels(cv);
  t('  a bullet outside the section is untouched',
    o.text.indexOf('- Owned CI/CD: built the release pipeline.') !== -1, 'a bullet was rewritten');
  t('  a project link line is untouched',
    o.text.indexOf('Live demo: https://example.com') !== -1, 'a link line was rewritten');
  t('  and the skills label is still fixed', o.text.indexOf('Soft Skills:') !== -1, 'not fixed');
}

console.log('\nA COUNTRY NAME AND ITS CODE ARE THE SAME CLAIM');
{
  t('  autofill-core loaded', !!AC && typeof AC.authorisedForQuestion === 'function',
    Object.keys(AC || {}).slice(0, 8).join(','));
}
if (AC && AC.authorisedForQuestion) {
  const Q = 'Are you legally authorised to work in Ireland without sponsorship?';
  for (const [label, list] of [
    ['ISO codes', ['IE', 'GB', 'US']],
    ['full names', ['Ireland', 'United Kingdom', 'United States']],
    ['mixed', ['Ireland', 'GB', 'us']],
    ['names array key', null],
  ]) {
    const p = list
      ? { work_authorized_countries: list }
      : { work_authorized_country_names: ['Ireland', 'Germany'] };
    t('  "Yes" for Ireland from ' + label,
      AC.authorisedForQuestion(Q, p) === 'Yes', AC.authorisedForQuestion(Q, p));
  }
  t('  and "No" where the list genuinely excludes the country',
    AC.authorisedForQuestion('Are you authorised to work in Canada?',
      { work_authorized_countries: ['Ireland', 'Germany'] }) === 'No',
    AC.authorisedForQuestion('Are you authorised to work in Canada?',
      { work_authorized_countries: ['Ireland', 'Germany'] }));

  console.log('\nAND EVERY EEA COUNTRY THE PROFILE CAN HOLD RESOLVES');
  for (const [name, q] of [
    ['Croatia', 'Are you authorised to work in Croatia?'],
    ['Czechia', 'Are you authorised to work in Czechia?'],
    ['Luxembourg', 'Are you authorised to work in Luxembourg?'],
    ['Romania', 'Are you authorised to work in Romania?'],
  ]) {
    t('  ' + name + ' by name', AC.authorisedForQuestion(q, { work_authorized_countries: [name] }) === 'Yes',
      AC.authorisedForQuestion(q, { work_authorized_countries: [name] }));
  }
  for (const [alias, q] of [
    ['Czech Republic', 'Are you authorised to work in Czechia?'],
    ['USA', 'Are you authorised to work in the United States?'],
    ['Republic of Ireland', 'Are you legally authorised to work in Ireland?'],
  ]) {
    t('  the alias "' + alias + '" resolves',
      AC.authorisedForQuestion(q, { work_authorized_countries: [alias] }) === 'Yes',
      AC.authorisedForQuestion(q, { work_authorized_countries: [alias] }));
  }
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
