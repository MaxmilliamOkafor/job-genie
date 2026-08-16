// Builds the CV the extension would produce, as a .docx, for the live
// parse check. Same generator, same audit passes, no shortcuts: the
// point is to upload what a user would actually upload.
const fs = require('fs'), path = require('path'), Module = require('module');
const DIR = path.join(__dirname, '..', '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
for (const f of ['content-quality-engine.js', 'jd-skill-extractor.js',
  'recruiter-audit.js', 'docx-generator.js']) {
  const file = path.join(DIR, f);
  const m = new Module(file, null); m.filename = file;
  m.paths = Module._nodeModulePaths(DIR);
  m._compile(fs.readFileSync(file, 'utf8'), file);
}

const RAW = [
  'Maxmilliam Okafor',
  'Dublin, IE | +353: 0874261508 | maxokafordev@gmail.com | https://linkedin.com/in/maxokafor',
  '',
  'PROFESSIONAL SUMMARY',
  'Manufacturing engineering technician with a foundation in process optimisation, '
    + 'quality assurance and documentation.',
  '',
  'PROFESSIONAL EXPERIENCE',
  'Meta (formerly Facebook Inc)',
  'Senior Software Engineer (Contract, part-time)',
  'January 2023 – Present',
  '- Re-architected the data-ingestion layer in Python and SQL on an Apache Kafka stream.',
  '- Mentored junior engineers through pairing and design reviews.',
  '',
  'Accenture',
  'Solutions Architect',
  'April 2021 – July 2022',
  '- Led the migration of legacy client applications to Kubernetes on Azure, with iso 9001.',
  '- Implemented full-stack observability with the ELK Stack, Prometheus and Grafana.',
  '',
  'Citigroup',
  'Data Analyst',
  'August 2017 – March 2021',
  '- Re-engineered ETL workflows in SQL and Apache Airflow with parallelised, monitored jobs.',
  '',
  'TECHNICAL SKILLS',
  'Python, SQL, Kubernetes, Docker, Terraform, Apache Kafka, Airflow',
  '',
  'CERTIFICATIONS',
  '- AWS Certified Solutions Architect',
  '',
  'EDUCATION',
  'Master of Science in Artificial Intelligence, Imperial College London',
  'Bachelor of Science in Computer Science, University of Derby',
].join('\n');

// Every renderer-level guarantee runs, exactly as it does in the popup.
const audited = global.RecruiterAudit.runRecruiterAudit({
  cvText: RAW, jdText: 'manufacturing engineer quality standards',
  jdTitle: 'Manufacturing Engineer', jobKeywords: ['quality standards', 'iso 9001'],
});
const built = global.DocxGenerator.fromCvText(audited.cvText, { name: 'Maxmilliam Okafor' });
if (!built || !built.success) {
  console.error('docx generation failed:', built && built.error);
  process.exit(1);
}
const out = path.join(process.cwd(), 'cv.docx');
fs.writeFileSync(out, Buffer.from(built.base64, 'base64'));
fs.writeFileSync(path.join(process.cwd(), 'cv-source.txt'), audited.cvText);
console.log('wrote', out, fs.statSync(out).size, 'bytes');
console.log('--- audit fixes applied ---');
(audited.report.fixes || []).forEach((f) => console.log('  ' + f));
