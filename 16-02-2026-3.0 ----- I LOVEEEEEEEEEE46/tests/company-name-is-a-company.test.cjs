// A SCRAPED COMPANY NAME IS NOT AUTOMATICALLY A COMPANY NAME.
//
// A generated cover letter went out addressed to "Career2":
//
//   "I am writing to express my interest in the Integration Engineer
//    position at Career2."
//
// That is site chrome -- a careers-portal label with a digit on it --
// scraped from the page and used as the employer. A recruiter reading
// their own portal's name where their company should be knows exactly
// what happened.
//
// The checks that existed were exact matches against generic words, so
// "company" and "employer" were caught while "Career2", "Careers",
// "Apply" and "Workday" all passed. The shape gives them away, not the
// exact string.
//
// The other direction matters just as much: real employers are called
// Career Group Companies, Jobs Ireland, Lever Brothers, Home Depot and
// Apply Digital. Addressing a letter to "the hiring organization" when
// the company was real is its own failure, so the junk word has to be
// the WHOLE name to count.
let PASS = 0, FAIL = 0;
const t = (n, c, x) => { c ? PASS++ : FAIL++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c ? '' : '\n           >> ' + x)); };

const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'cover-letter-generator.js'), 'utf8');

// The guard is module-private on purpose; lift it out and exercise it.
const block = SRC.match(/const _JUNK_COMPANY = new RegExp\([\s\S]*?'i'\);[\s\S]*?^  \}/m);
t('the guard is present in the generator', !!block, 'no _JUNK_COMPANY found');
if (!block) { console.log('\n' + PASS + ' passed, ' + FAIL + ' failed'); process.exit(1); }
eval(block[0]);

console.log('\nPORTAL CHROME IS NOT AN EMPLOYER');
for (const junk of ['Career2', 'Careers', 'career', 'Jobs', 'jobs2', 'Apply',
  'Application', 'Portal', 'Home', 'Search', 'login', 'Register', 'Vacancies',
  'Openings', 'Recruiting', 'Hiring']) {
  t('  "' + junk + '" is rejected', _isJunkCompany(junk) === true, 'let through');
}

console.log('\nNOR IS THE ATS VENDOR HOSTING THE PAGE');
// Workday hosts the posting; you would not be working for Workday, and
// addressing the letter to them is worse than addressing nobody.
for (const vendor of ['Workday', 'myworkdayjobs', 'Taleo', 'Greenhouse',
  'Lever', 'iCIMS', 'SuccessFactors', 'BrassRing', 'SmartRecruiters',
  'Jobvite', 'Workable', 'Ashby']) {
  t('  "' + vendor + '" is rejected', _isJunkCompany(vendor) === true, 'let through');
}

console.log('\nAND NEITHER IS A STRING WITH NO NAME IN IT');
for (const bad of ['', '   ', '2026', '---', '###']) {
  t('  ' + JSON.stringify(bad) + ' is rejected', _isJunkCompany(bad) === true, 'let through');
}

console.log('\nBUT REAL EMPLOYERS ARE LEFT ALONE');
// Every one of these contains a word from the reject list. Requiring the
// junk word to be the WHOLE name is what separates them.
for (const real of ['Meta', 'Citigroup', 'Accenture', 'SolimHealth',
  'Career Group Companies', 'Jobs Ireland', 'Lever Brothers Ltd',
  'Home Depot', 'Apply Digital', 'Workday Financial Advisors Ltd',
  'Portal Ventures', 'Search Party Recruitment']) {
  t('  "' + real + '" survives', _isJunkCompany(real) === false,
    'a real employer was discarded, which is its own failure');
}

console.log('\n' + PASS + ' passed, ' + FAIL + ' failed');
process.exit(FAIL ? 1 : 0);
