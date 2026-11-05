import { acceptRewrite, preserveProfileBullet, unstitchBullet, fixParallelPast, removeUnrecordedBulletTools, moveDomainSkills, normaliseHeaderPhones, toolChronologyNotes, polishTailoredDocuments } from './guards.ts';
import { copiesRun, COPY_RUN, composeResult, profileBullets, profileTextOf, pickResultLines, rankLines, checkAgainstBullet, letterBody, sentenceSubjects, checkResult, slotPrompt } from './letterSlots.ts';
import { pickOutcomes, summaryRequirements } from '../_shared/summaryShape.ts';
import { classifyTerm } from '../_shared/evidence.ts';
import { excludedKeyword, filterJobKeywords, filterJobKeywordLists } from '../_shared/keywordChecks.ts';
import { termAppearsIn } from '../_shared/coverage.ts';
function equal(actual: unknown, expected: unknown) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function ok(value: unknown) { if (!value) throw new Error('Expected a true condition'); }
const test = Deno.test;
const campaign = 'Rebuilt the internal campaign diagnostics tool in React, TypeScript and GraphQL. The old tool was slow enough that sales engineers raised tickets instead of using it and the rewrite cleared most of that queue.';
const story = 'At Meta, sales engineers raised tickets because the campaign diagnostics tool was too slow. I rebuilt it with GraphQL, React and TypeScript, clearing most of the queue.';
test('1: copied result is rejected; fresh grounded story is not copied', () => {
 equal(COPY_RUN, 7); ok(copiesRun('At Meta, I ' + campaign.toLowerCase(), [campaign])); equal(copiesRun(story, [campaign]), false);
 const b = {n:1, company:'Meta', text:campaign}; equal(checkAgainstBullet(story,b,['React','TypeScript','GraphQL']), []);
 const requestedStory='At Meta, sales engineers had stopped using our campaign diagnostics tool and raised tickets instead, because it was too slow. I rebuilt it in React, TypeScript and GraphQL, and most of that queue went away.';
 equal(copiesRun(requestedStory,[campaign]),false); equal(checkAgainstBullet(requestedStory,b,['React','TypeScript','GraphQL']),[]);
});
test('2: responsibility ranking, two distinct employers and one figure', () => {
 const bullets = profileBullets([{company:'Meta',bullets:['Scaled systems for 900000 requests daily']},{company:'Accenture',bullets:['Led client pre-sales workshops and delivery handovers with stakeholders','Managed client delivery workshops']},{company:'Citi',bullets:['Led client pre-sales workshops']}]);
 const ranked = rankLines(bullets,['client','pre-sales','workshops'], 'client-facing delivery workshops', '', 'Senior Solutions Consultant');
 equal(ranked[0].company, 'Accenture'); equal(pickResultLines(ranked,new Set(),new Map(),3,()=>1).map(b=>b.company), ['Accenture','Citi']);
 ok(checkAgainstBullet('At Meta, I scaled 400 requests in two hours',{n:1,company:'Meta',text:'Scaled 400 requests in two hours'},[]).includes('uses more than one figure'));
 equal(checkAgainstBullet('At Meta, I scaled 400 requests',{n:1,company:'Meta',text:'Scaled 400 requests'},[]),[]);
});
test('3: result attribution uses employer, not held title', () => {
 equal(composeResult('At Solutions Architect, I built services','Accenture'), 'At Accenture, I built services.');
 equal(profileBullets([{company:'Accenture',title:'Data Analyst',bullets:['Built useful services for clients']}])[0].company,'Accenture');
 equal(composeResult('I built services','Accenture'),'At Accenture, I built services.');
});
const parts = {name:'Sam',contact:'',greeting:'Dear Hiring Team,',story:'',role:'Consultant',company:'Elite Technology',results:[],rightToWork:'',notice:'',signOff:'Kind regards,'};
test('4: no why means no company paragraph, even for taglines', () => {
 for (const fact of ['TribalScale is a digital innovation firm that helps organizations adapt and thrive in a rapidly changing world','Elite Technology is the trusted automation platform for law firm operations across most of the world']) {
  equal(letterBody({...parts,companyFact:fact}).length,2);
 }
 const body = letterBody({...parts,companyFact:'Elite Technology builds client reporting systems.',why:'My reporting rebuild removed the manual work for clients.'}); ok(body.join(' ').includes('My reporting rebuild'));
});
test('5: closing omits role; ordinary opening names it once', () => {
 const body=letterBody(parts).join(' '); ok(body.endsWith('I am available for a call whenever suits you.')); equal(body.match(/Consultant/g)?.length,1);
 equal(letterBody({...parts,role:''}).at(-1),'I am available for a call whenever suits you.');
});
test('6: action fragments gain a subject; existing subjects stay', () => {
 equal(sentenceSubjects('Mentored two junior engineers.'),'I mentored two junior engineers.'); equal(sentenceSubjects('I mentored two junior engineers.'),'I mentored two junior engineers.');
});
test('7: keyword-built bring lines are rejected, evidenced tools stay', () => {
 const bullet={n:1,company:'Meta',text:'Built web services with React for clients'};
 const ctx={experience:[],bullets:[bullet],cvText:'',description:'Go-Live',tools:['Go','React'],profileText:bullet.text,company:'Acme',story:''};
 ok(checkResult('At Meta, I would bring Go to clients.',bullet,ctx).some(x=>x.includes('what-I-would-bring')));
 equal(checkResult('At Meta, I bring React to web services for clients.',bullet,ctx).some(x=>x.includes('what-I-would-bring')),false);
});
test('8: restore truncated trailing participle bullets verbatim', () => {
 const examples=[['Replaced four conflicting sources.','Improved controls by rebuilding the credit risk reporting suite in SQL and Python, replacing four conflicting sources.'],["Reported team's deadline.","Built the credit suite before the reporting team's deadline."],['Included a TensorFlow.js avatar for screening.','Developed the clinician dashboard for cognitive screening, including a TensorFlow.js avatar for screening.']];
 for(const [cut,source] of examples) equal(preserveProfileBullet(cut,[source]),source);
 const source='Built services with Python for clients.'; equal(preserveProfileBullet(source,[source]),source);
});
test('9: remove posting duty grafts and empty objects, not real caching', () => {
 const source='Architected reliable client services in Python and SQL for regulated banks.';
 for (const added of ['Delivered assignments within scope according to budget and schedule by '+source.toLowerCase(), 'Showed outstanding organizational and time management skills by '+source.toLowerCase()]) equal(preserveProfileBullet(added,[source],added),source);
 equal(unstitchBullet('Integrated AI tools by building X'),'Built X'); equal(unstitchBullet('Leveraged modern technologies by migrating X'),'Migrated X');
 equal(unstitchBullet('Worked with cross-functional teams to design, implement, test and support solutions, closing X'),'Closed X');
 equal(unstitchBullet('Implemented caching by moving reads to Redis'),'Implemented caching by moving reads to Redis');
});
test('10: parallel past verb agrees, nested participles stay', () => {
 equal(fixParallelPast('Replaced a 40-tab Excel pack with Power BI and Tableau dashboards and ending the manual rebuild'),'Replaced a 40-tab Excel pack with Power BI and Tableau dashboards and ended the manual rebuild');
 equal(fixParallelPast('Led a team building the platform and running its on-call'),'Led a team building the platform and running its on-call');
});
test('11: pointless same-length paraphrases restore source; shorter rewrites stay', () => {
 const source='Migrated services to AWS, delivering all 47 services in 11 months and cutting annual infrastructure cost';
 const rewrite='Migrated services to 47 AWS microservices on EKS, all delivered within 11 months and cut annual infrastructure cost';
 equal(preserveProfileBullet(rewrite,[source]),source); equal(preserveProfileBullet('Migrated 47 services in 11 months',[source]),'Migrated 47 services in 11 months');
});
test('12: list tools require profile evidence, including lower-case-first names', () => {
 equal(removeUnrecordedBulletTools('Built services (Python, Node.js, iOS and C++).','Python Node.js'),'Built services (Python and Node.js).');
 equal(removeUnrecordedBulletTools('Rebuilt web tools in React, TypeScript, React Native and GraphQL.','React TypeScript GraphQL'),'Rebuilt web tools in React, TypeScript and GraphQL.');
 const good='Built web tools (iOS, macOS and jQuery).'; equal(removeUnrecordedBulletTools(good,'iOS macOS jQuery'),good);
});
test('13: number words survive length rewrites', () => {
 const original='Reduced runs from six hours to under one with Python after three late submissions across four teams.';
 equal(acceptRewrite(original,'Reduced the overnight run with Python and SQL after late submissions across teams.',[]),false);
 equal(acceptRewrite(original,original,[]),true);
});
test('14: domain phrases move out of tool lines, not duplicated elsewhere', () => {
 const cv='TECHNICAL SKILLS\nProgramming: Python, Front End, Back End, Full Stack\nFrameworks: React, Web Development\nData & ML: SQL, Software Development';
 const out=moveDomainSkills(cv); ok(out.includes('Programming: Python')); ok(out.includes('Domain: Front End, Back End, Full Stack, Web Development, Software Development'));
 const good='TECHNICAL SKILLS\nProgramming: Python\nDomain: Full Stack'; equal(moveDomainSkills(good),good);
});
test('15: outcomes rank count, role fit, recency, then figures, including no digit', () => {
 const lines=['Replaced a 40-tab Excel pack','Trained 24 analysts','Led pre-sales workshops for client delivery and handovers'];
 const roles=[{title:'Data Analyst',bullets:lines.slice(0,2)},{title:'Solutions Consultant',bullets:[lines[2]]}];
 equal(pickOutcomes(lines,['pre-sales','client delivery','handovers'],roles,'Senior Solutions Consultant')[0],lines[2]);
 equal(pickOutcomes(['Reduced latency by 30%'],[]),['Reduced latency by 30%']);
});
test('16: trunk zeros removed in both headers, Italy keeps zero', () => {
 equal(normaliseHeaderPhones('Sam\n+353 087 426 1508\nSUMMARY'), 'Sam\n+353 87 426 1508\nSUMMARY');
 equal(normaliseHeaderPhones('Sam\n+44 (0)20 7946 0958\nDear Hiring Team,'), 'Sam\n+44 20 7946 0958\nDear Hiring Team,');
 equal(normaliseHeaderPhones('Sam\n+39 06 123456\nSUMMARY'), 'Sam\n+39 06 123456\nSUMMARY');
 const good='Sam\n+353 87 426 1508\nSUMMARY\nRecorded +353 087 426 1508'; equal(normaliseHeaderPhones(good),good);
});
test('17: geography and plural people phrases are not job keywords', () => {
 for(const word of ['Ontario Provinces','Quebec','California','Ireland','EMEA','UTC','Ontario','engineering managers','stakeholders','clients']) equal(excludedKeyword(word),true);
 for(const word of ['Project Management','Consulting','Python']) equal(excludedKeyword(word),false);
});
test('18: Go-Live and go-to-market are not Go; real language mentions are', () => {
 for(const text of ['Go-Live support','go-to-market','Go Live support']) {equal(termAppearsIn(text,'Go'),false); equal(filterJobKeywords(['Go'],text),[]);}
 for(const text of ['Go-based tooling','in Go']) equal(termAppearsIn(text,'Go'),true);
});
test('19: shared evidence recognises capability stems, never related tools', () => {
 for(const [text,term] of [['Data Analyst','Data Analysis'],['consultants','Consulting'],['communicating','Communication']]) equal(classifyTerm(term,[{label:'Role',text,kind:'achievement'}]).tier,'demonstrated');
 equal(classifyTerm('Java',[{label:'Role',text:'JavaScript',kind:'record'}]).tier,'unsupported');
 equal(classifyTerm('Go',[{label:'Role',text:'Go-Live support',kind:'achievement'}]).tier,'unsupported');
});
test('20: flag impossible case-sensitive tool chronology without rewriting', () => {
 const role={company:'SolimHealth',endDate:'12-2022',bullets:['Built FLUX Kontext tools']};
 equal(toolChronologyNotes([role]),['FLUX Kontext first came out in 2025, but your SolimHealth role ended in 2022. Correct it in your profile.']);
 equal(toolChronologyNotes([{...role,endDate:'12-2025'}]),[]); equal(toolChronologyNotes([{...role,bullets:['A llama and a claude story']}]),[]);
 equal(role.bullets,['Built FLUX Kontext tools']);
});
test('existing six cleanups remain and output contains no long dashes', () => {
 const cv='Sam\nEngineer UnsupportedTool\nPROFESSIONAL EXPERIENCE\nEngineer | Acme\n• Built systems in Python.\nTECHNICAL SKILLS\nProgramming: Python';
 const letter='Sam\nhttps://example.com\nexample.com/\nDear Hiring Team,\nI built solutions of healthcare.';
 const out=polishTailoredDocuments(cv,letter,'Python Engineer'); equal(out.cv.includes('UnsupportedTool'),false); equal(out.letter.includes('solutions for healthcare'),true); equal(/[\u2013\u2014]/.test(out.cv+out.letter),false);
});

test('live regression: unsupported contractual result is rejected', () => {
 const b={n:1,company:'Accenture',text:'Led five pre-sales bids, authored architecture sections and presented to CTOs.'};
 ok(checkAgainstBullet('At Accenture, I led five bids. I secured contracts and strengthened client relationships.',b,[]).length > 0);
});

test('live regression: invented problem and subjectless result are never accepted', () => {
 const b={n:1,company:'Meta',text:'Increased ad revenue with ranking model features derived from advertiser bid history, a gain that held across a four-week live test.'};
 ok(checkAgainstBullet('At Meta, ad revenue was stagnating due to outdated ranking models.',b,[]).length > 0);
 equal(composeResult('ad revenue was slow','Meta'),'At Meta, ad revenue was slow.');
});

test('all keyword categories are filtered before prompts and scores', () => {
 const lists = {hardSkills:['Python','Ontario'],tools:['Go','React'],softSkills:['Communication','stakeholders'],titles:['Consulting','engineering managers'],certifications:['AWS','UTC'],responsibilities:['Project Management','clients'],allKeywords:['Python','Go','Ireland']};
 equal(filterJobKeywordLists(lists,'Go-Live support'),{hardSkills:['Python'],tools:['React'],softSkills:['Communication'],titles:['Consulting'],certifications:['AWS'],responsibilities:['Project Management'],allKeywords:['Python']});
 const good={tools:['Go','React'],hardSkills:['Python']}; equal(filterJobKeywordLists(good,'Services written in Go'),good);
});
test('summary counts complete requirements before role fit or large figures', () => {
 const client='Led pre-sales client workshops and delivery handovers';
 const stack='Built Python and SQL tools for 900000 daily requests';
 equal(pickOutcomes([client,stack],['Python','SQL','client workshops'],[{title:'Solutions Consultant',bullets:[client]},{title:'Software Engineer',bullets:[stack]}],'Senior Solutions Consultant')[0],stack);
 equal(pickOutcomes([client,stack],['pre-sales','client workshops','delivery handovers'],[{title:'Solutions Consultant',bullets:[client]},{title:'Software Engineer',bullets:[stack]}],'Senior Solutions Consultant')[0],client);
});
test('summary ties prefer closest held role then most recent role before figure', () => {
 const older='Led client workshops for 9000 users';
 const recent='Led client workshops for 4 users';
 const unrelated='Led client workshops for 99000 users';
 const roles=[{title:'Solutions Consultant',bullets:[recent]},{title:'Data Analyst',bullets:[unrelated]},{title:'Solutions Consultant',bullets:[older]}];
 equal(pickOutcomes([older,unrelated,recent],['client workshops'],roles,'Solutions Consultant')[0],recent);
});
test('summary includes posting responsibilities without changing ATS terms', () => {
 const terms=['SQL','Power BI'];
 equal(summaryRequirements(terms,'Client workshops, pre-sales delivery and handovers'),['SQL','Power BI','client','pre-sales','workshop','handover','delivery']);
 equal(terms,['SQL','Power BI']); equal(summaryRequirements(terms,'SQL and Power BI'),terms);
});
test('number-word loss is rejected even when all rewrite words were in source', () => {
 const source='Reduced runs from six hours to under one with Python after three late submissions across four teams and SQL reporting.';
 const shorter='Reduced runs with Python after late submissions across teams and SQL reporting.';
 equal(acceptRewrite(source,shorter,[]),false);
});
test('comma-only tool lists are scrubbed and recorded lists stay unchanged', () => {
 equal(removeUnrecordedBulletTools('Built services in Python, Node.js, iOS.','Python Node.js'),'Built services in Python and Node.js.');
 const good='Built services in Python, Node.js, iOS.'; equal(removeUnrecordedBulletTools(good,'Python Node.js iOS'),good);
});

test('posting strategy never backs a tool in candidate bullets', () => {
 const profile={professionalExperience:[{company:'Acme',bullets:['Built services using Python and Node.js']}],skills:['Python','Node.js'],atsStrategy:{requirements:['iOS']}};
 equal(removeUnrecordedBulletTools('Built services (Python, Node.js, iOS).',profileTextOf(profile)),'Built services (Python and Node.js).');
 const good='Built services (Python and Node.js).'; equal(removeUnrecordedBulletTools(good,profileTextOf(profile)),good);
});
test('every specified tool release is flagged only on an earlier completed role', () => {
 for(const [tool,year] of [['FLUX Kontext',2025],['ChatGPT',2022],['GPT-4',2023],['Claude',2023],['LangChain',2022],['Llama',2023]] as const) {
  equal(toolChronologyNotes([{company:'Acme',endDate:`12-${year-1}`,bullets:[`Built services using ${tool}`]}]),[`${tool} first came out in ${year}, but your Acme role ended in ${year-1}. Correct it in your profile.`]);
  equal(toolChronologyNotes([{company:'Acme',endDate:`12-${year}`,bullets:[`Built services using ${tool}`]}]),[]);
 }
});
