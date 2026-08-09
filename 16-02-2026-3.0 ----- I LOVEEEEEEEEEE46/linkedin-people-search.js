// linkedin-people-search.js — FIND the person, instead of waiting to be handed one.
//
// The contact lookup could only resolve a LinkedIn profile that something
// else had already produced: a hiring-team card, a profile left open in a
// tab, one browsed earlier. On a Workday or Greenhouse posting none of
// those exist, so the answer was "there is nobody to look up" -- which is
// wrong. The people are on LinkedIn; nothing was going to look for them.
//
// For a software engineering role at Salesforce in Dublin, the people who
// can move that application are findable by name and title:
//
//   the recruiter who owns the req   Senior Technical Recruiter
//   the talent lead above them       Head of Talent Acquisition, EMEA
//   the hiring manager               Engineering Manager, Head of Engineering
//   a senior peer who can refer      Senior Software Engineer, Staff Engineer
//
// This builds that target list for any role, and the LinkedIn people
// searches that find them, scoped to the employer and the place. It reads
// the results the user's own browser renders -- it never logs in, never
// posts, and never opens a connection. The handles it harvests are what
// the profile -> verified email step already knows how to consume.
(function (global) {
  'use strict';

  const _clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  // ---- what field is this role in? --------------------------------------
  // Ordered most specific first: "machine learning engineer" is ML, not
  // generic engineering, and "engineering manager" must not be read as a
  // vacancy for a manager when it appears in a PERSON's title.
  // Unambiguous ROLE SHAPES, checked before anything else. A technology
  // named in a manager's title is context, not their discipline: an "AI
  // Product Manager" reports to the Head of Product, not the Head of ML,
  // and a "Senior Product Designer" is a designer -- the bare word
  // "product" must not claim either of them.
  const ROLE_SHAPES = [
    ['design',   /\bdesigner\b|product design|user experience design|interaction design/],
    ['product',  /product manager|product owner|head of product|product lead/],
    ['delivery', /project manager|programme manager|program manager|delivery manager|scrum master|agile coach|\bpmo\b/],
  ];

  const FIELDS = [
    // Physical security is not information security. Checked first so
    // "Security Guard" cannot be routed to a CISO.
    ['operations',    /security guard|security officer|door supervisor|concierge/],
    ['ml',            /machine learning|\bml\b|\bmlops\b|deep learning|\bnlp\b|computer vision|\bai\b|artificial intelligence/],
    ['data-science',  /data scien|statistic|quantitative|econometric/],
    ['data-eng',      /data engineer|etl\b|data platform|data warehouse|databricks|\bspark\b/],
    ['analytics',     /analytics|business intelligence|\bbi\b|data analyst|business analyst|tableau|power bi|looker/],
    ['security',      /security|infosec|appsec|cyber|penetration test|pentest|soc analyst|cryptograph/],
    // (?<!design ) keeps a "Design Systems Engineer" -- a frontend role --
    // out of infrastructure.
    ['devops',        /devops|devsecops|\bsre\b|site reliability|platform engineer|infrastructure|kubernetes|terraform|cloud engineer|(?<!design )systems engineer/],
    ['cloud',         /\baws\b|\bazure\b|\bgcp\b|cloud architect|solutions architect/],
    ['qa',            /\bqa\b|quality assurance|test engineer|automation test|\bsdet\b|tester/],
    ['mobile',        /\bios\b|android|mobile (developer|engineer)|flutter|react native|swift|kotlin/],
    ['frontend',      /front.?end|\bui engineer|react|angular|vue\b|javascript developer|web developer/],
    ['backend',       /back.?end|\bapi\b engineer|microservice|\bjava\b|\bgolang\b|\bgo\b developer|\bpython\b developer|\bnode\b|\.net|\bc#\b|\bruby\b|\bphp\b|\bscala\b|\brust\b/],
    ['embedded',      /embedded|firmware|hardware engineer|\bfpga\b|\brtos\b|electronic engineer/],
    ['games',         /game (developer|engineer|programmer)|unreal|unity developer/],
    ['dba',           /database administrator|\bdba\b|sql server|postgres|oracle dba/],
    ['it-support',    /help ?desk|service desk|\bit support|desktop support|system administrator|sysadmin|network engineer|\bit technician/],
    ['erp',           /dynamics 365|\bsap\b|salesforce (developer|consultant|administrator)|servicenow|workday (consultant|integration)|netsuite|\berp\b/],
    ['solutions',     /solutions engineer|sales engineer|presales|pre.?sales|technical account manager|customer engineer/],
    ['tech-writing',  /technical writer|documentation engineer|content engineer/],
    ['product',       /product manager|product owner|\bproduct\b/],
    ['design',        /\bux\b|\bui\b|product design|user experience|interaction design|\bdesigner\b/],
    ['delivery',      /project manager|programme manager|program manager|delivery manager|scrum master|agile coach|\bpmo\b/],
    ['engineering',   /software engineer|developer|programmer|engineer|software/],   // generic, last of the tech nets
    ['marketing',     /market|brand|content strategist|\bseo\b|communications/],
    ['sales',         /sales|account exec|business development|partnerships|customer success/],
    ['finance',       /financ(e|ial)|account(ant|ing)|audit|\btax\b|treasury|controller/],
    ['legal',         /legal|counsel|solicitor|paralegal|compliance|data protection|\bgdpr\b/],
    ['healthcare',    /nurse|nursing|clinical|physician|doctor|healthcare|medical|pharmac/],
    ['operations',    /operations|logistics|supply chain|warehouse|procurement|facilities/],
    ['hr',            /human resources|people operations|\bhr\b/],
  ];

  function fieldOf(roleTitle) {
    const t = String(roleTitle || '').toLowerCase();
    if (!t) return '';
    for (const [name, re] of ROLE_SHAPES) if (re.test(t)) return name;
    for (const [name, re] of FIELDS) if (re.test(t)) return name;
    return '';
  }

  // The coarse bucket the scorer in contact-enrichment.js works in. Kept
  // as an explicit map so the two vocabularies cannot drift apart.
  const FIELD_TO_DISCIPLINE = {
    ml: 'data', 'data-science': 'data', 'data-eng': 'data', analytics: 'data',
    security: 'engineering', devops: 'engineering', cloud: 'engineering',
    qa: 'engineering', mobile: 'engineering', frontend: 'engineering',
    backend: 'engineering', embedded: 'engineering', games: 'engineering',
    dba: 'engineering', 'it-support': 'engineering', erp: 'engineering',
    'tech-writing': 'engineering', engineering: 'engineering',
    solutions: 'sales',
    product: 'product', design: 'design', delivery: 'delivery',
    marketing: 'marketing', sales: 'sales', finance: 'finance',
    legal: 'legal', healthcare: 'healthcare', operations: 'operations', hr: 'hr',
  };
  const disciplineOf = (roleTitle) => FIELD_TO_DISCIPLINE[fieldOf(roleTitle)] || '';

  // ---- who to look for --------------------------------------------------
  // Per field: the people who actually move an application. Peers matter --
  // a senior engineer on the team can refer you, and is often far easier to
  // reach than the hiring manager.
  const T = (recruiters, managers, peers) => ({ recruiters, managers, peers });
  const TECH_RECRUITERS = ['Technical Recruiter', 'Senior Technical Recruiter',
    'Engineering Recruiter', 'Technical Talent Partner', 'Tech Talent Acquisition'];
  // Field-specific titles lead. The list is truncated when it becomes a
  // provider query, so a specialist title appended at the end -- exactly
  // the one worth asking for -- would be the first thing cut.
  const TR = (...specific) => specific.concat(TECH_RECRUITERS);

  const TARGETS = {
    engineering: T(TECH_RECRUITERS,
      ['Engineering Manager', 'Senior Engineering Manager', 'Head of Engineering',
       'Director of Engineering', 'VP Engineering', 'CTO', 'Head of Software Engineering'],
      ['Senior Software Engineer', 'Staff Software Engineer', 'Principal Engineer',
       'Tech Lead', 'Engineering Lead', 'Software Architect']),
    backend: T(TECH_RECRUITERS,
      ['Engineering Manager', 'Head of Engineering', 'Head of Backend', 'VP Engineering', 'CTO'],
      ['Senior Backend Engineer', 'Staff Engineer', 'Principal Engineer', 'Tech Lead', 'Software Architect']),
    frontend: T(TECH_RECRUITERS,
      ['Engineering Manager', 'Head of Frontend', 'Head of Engineering', 'VP Engineering'],
      ['Senior Frontend Engineer', 'Staff Frontend Engineer', 'Tech Lead', 'Principal Engineer']),
    mobile: T(TECH_RECRUITERS,
      ['Mobile Engineering Manager', 'Head of Mobile', 'Head of Engineering', 'VP Engineering'],
      ['Senior iOS Engineer', 'Senior Android Engineer', 'Staff Mobile Engineer', 'Mobile Tech Lead']),
    devops: T(TR('Infrastructure Recruiter'),
      ['Head of Platform', 'Head of Infrastructure', 'SRE Manager', 'DevOps Manager',
       'Head of Engineering', 'VP Engineering', 'CTO'],
      ['Senior DevOps Engineer', 'Senior Site Reliability Engineer', 'Staff Platform Engineer',
       'Principal Infrastructure Engineer', 'Platform Tech Lead']),
    cloud: T(TECH_RECRUITERS,
      ['Head of Cloud', 'Head of Architecture', 'Head of Infrastructure', 'CTO'],
      ['Cloud Architect', 'Senior Cloud Engineer', 'Principal Architect', 'Solutions Architect']),
    security: T(TR('Security Recruiter', 'Cyber Security Recruiter'),
      ['Head of Security', 'CISO', 'Security Engineering Manager', 'Head of Information Security'],
      ['Senior Security Engineer', 'Principal Security Engineer', 'Security Architect',
       'Senior Penetration Tester']),
    qa: T(TECH_RECRUITERS,
      ['QA Manager', 'Head of Quality', 'Head of QA', 'Engineering Manager', 'Head of Engineering'],
      ['Senior QA Engineer', 'Lead Test Engineer', 'SDET', 'Senior Automation Engineer']),
    ml: T(TR('Data Recruiter', 'AI Recruiter'),
      ['Head of Machine Learning', 'Head of AI', 'Head of Data Science', 'Director of Data', 'CTO'],
      ['Senior Machine Learning Engineer', 'Staff ML Engineer', 'Principal Data Scientist',
       'Research Engineer']),
    'data-science': T(TR('Data Recruiter'),
      ['Head of Data Science', 'Head of Data', 'Director of Analytics', 'Chief Data Officer'],
      ['Senior Data Scientist', 'Principal Data Scientist', 'Lead Data Scientist']),
    'data-eng': T(TR('Data Recruiter'),
      ['Head of Data Engineering', 'Head of Data Platform', 'Head of Data', 'Director of Data'],
      ['Senior Data Engineer', 'Staff Data Engineer', 'Principal Data Engineer', 'Analytics Engineer']),
    analytics: T(TR('Data Recruiter'),
      ['Head of Analytics', 'Head of Business Intelligence', 'Head of Data', 'Analytics Manager'],
      ['Senior Data Analyst', 'Lead BI Developer', 'Analytics Manager', 'Senior BI Analyst']),
    embedded: T(TR('Hardware Recruiter'),
      ['Head of Hardware', 'Embedded Engineering Manager', 'Head of Engineering', 'CTO'],
      ['Senior Embedded Engineer', 'Principal Firmware Engineer', 'Hardware Tech Lead']),
    games: T(TR('Games Recruiter'),
      ['Studio Director', 'Technical Director', 'Head of Engineering', 'Lead Programmer'],
      ['Senior Game Programmer', 'Senior Gameplay Engineer', 'Principal Engine Programmer']),
    dba: T(TECH_RECRUITERS,
      ['Head of Data', 'Database Manager', 'Head of Infrastructure', 'Head of Engineering'],
      ['Senior Database Administrator', 'Lead DBA', 'Principal Database Engineer']),
    'it-support': T(['IT Recruiter', 'Technical Recruiter'],
      ['IT Manager', 'Head of IT', 'Service Desk Manager', 'Head of Technology', 'IT Director'],
      ['Senior IT Support Engineer', 'Senior Systems Administrator', 'Senior Network Engineer']),
    erp: T(TR('ERP Recruiter'),
      ['Head of Business Applications', 'ERP Manager', 'Head of IT', 'Practice Lead', 'Delivery Director'],
      ['Senior Dynamics 365 Consultant', 'Senior SAP Consultant', 'Solution Architect',
       'Senior Salesforce Consultant', 'Principal Consultant']),
    solutions: T(TR('Sales Recruiter'),
      ['Head of Solutions Engineering', 'Head of Presales', 'Sales Engineering Manager', 'VP Sales'],
      ['Senior Solutions Engineer', 'Principal Solutions Architect', 'Senior Sales Engineer']),
    'tech-writing': T(TECH_RECRUITERS,
      ['Head of Documentation', 'Content Manager', 'Head of Engineering'],
      ['Senior Technical Writer', 'Lead Technical Writer', 'Documentation Lead']),
    product: T(['Product Recruiter', 'Technical Recruiter'],
      ['Head of Product', 'Director of Product', 'VP Product', 'Chief Product Officer', 'Group Product Manager'],
      ['Senior Product Manager', 'Principal Product Manager', 'Lead Product Owner']),
    design: T(['Design Recruiter', 'Technical Recruiter'],
      ['Head of Design', 'Design Director', 'UX Manager', 'Head of Product Design'],
      ['Senior Product Designer', 'Senior UX Designer', 'Lead Designer', 'Principal Designer']),
    delivery: T(TR('Corporate Recruiter'),
      ['Head of Delivery', 'Programme Director', 'PMO Manager', 'Delivery Director', 'Head of Engineering'],
      ['Senior Project Manager', 'Senior Delivery Manager', 'Lead Scrum Master', 'Programme Manager']),
    marketing: T(['Marketing Recruiter', 'Commercial Recruiter'],
      ['Head of Marketing', 'Marketing Director', 'CMO', 'Head of Growth'],
      ['Senior Marketing Manager', 'Lead Content Strategist', 'Senior Brand Manager']),
    sales: T(['Sales Recruiter', 'Commercial Recruiter', 'GTM Recruiter'],
      ['Sales Director', 'Head of Sales', 'VP Sales', 'Chief Revenue Officer', 'Regional Sales Manager'],
      ['Senior Account Executive', 'Enterprise Account Executive', 'Senior Sales Manager']),
    finance: T(['Finance Recruiter', 'Corporate Recruiter'],
      ['Finance Director', 'Head of Finance', 'CFO', 'Financial Controller'],
      ['Senior Financial Accountant', 'Senior Finance Manager', 'Senior Financial Analyst']),
    legal: T(['Legal Recruiter', 'Corporate Recruiter'],
      ['Head of Legal', 'General Counsel', 'Legal Director', 'Head of Compliance'],
      ['Senior Legal Counsel', 'Senior Associate', 'Senior Compliance Manager']),
    healthcare: T(['Clinical Recruiter', 'Healthcare Recruiter'],
      ['Clinical Manager', 'Head of Nursing', 'Medical Director', 'Director of Nursing'],
      ['Clinical Nurse Manager', 'Senior Staff Nurse', 'Senior Clinical Specialist']),
    operations: T(['Operations Recruiter', 'Corporate Recruiter'],
      ['Head of Operations', 'Operations Manager', 'Operations Director', 'Head of Supply Chain'],
      ['Senior Operations Manager', 'Supply Chain Manager', 'Senior Logistics Manager']),
    hr: T(['Talent Acquisition Manager', 'Corporate Recruiter'],
      ['Head of People', 'HR Director', 'Chief People Officer', 'Head of HR'],
      ['Senior HR Business Partner', 'Senior People Partner']),
  };

  // Always worth trying, whatever the field: the talent function itself.
  const GENERIC_TALENT = ['Talent Acquisition Partner', 'Talent Acquisition Specialist',
    'Recruiter', 'Head of Talent Acquisition', 'Talent Acquisition Manager',
    'Recruiting Manager', 'Head of Talent'];

  /**
   * Everyone worth finding for one role, in the order worth trying.
   * Returns [{ tier, why, titles }].
   */
  function targetTitles(roleTitle) {
    const field = fieldOf(roleTitle);
    const t = TARGETS[field] || TARGETS.engineering;
    const out = [];
    if (t.recruiters && t.recruiters.length) {
      out.push({ tier: 'recruiter', titles: t.recruiters.slice(),
        why: 'the recruiter who owns this kind of requisition' });
    }
    if (t.managers && t.managers.length) {
      out.push({ tier: 'hiring-manager', titles: t.managers.slice(),
        why: 'the manager the role reports into -- the actual decision maker' });
    }
    out.push({ tier: 'talent', titles: GENERIC_TALENT.slice(),
      why: 'the talent team generally, when no specialist is listed' });
    if (t.peers && t.peers.length) {
      out.push({ tier: 'peer', titles: t.peers.slice(),
        why: 'a senior person doing this job, who can refer you internally' });
    }
    return out;
  }

  /** Every target title for a role, flattened, deduplicated, in order. */
  function allTargetTitles(roleTitle) {
    const seen = new Set();
    const out = [];
    for (const group of targetTitles(roleTitle)) {
      for (const title of group.titles) {
        const k = title.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(title);
      }
    }
    return out;
  }

  // ---- the searches that find them --------------------------------------
  // Keyword search, deliberately. The structured filters (currentCompany,
  // geoUrn) key off LinkedIn's own numeric ids, which are not derivable
  // from a company name without an API call this extension does not make.
  // Quoted phrases keep "Head of Engineering" from matching any engineer.
  const PEOPLE_SEARCH = 'https://www.linkedin.com/search/results/people/';

  function _keywords(company, titles, location) {
    const parts = [];
    if (company) parts.push('"' + _clean(company).replace(/"/g, '') + '"');
    const quoted = (titles || []).slice(0, 4).map((t) => '"' + _clean(t).replace(/"/g, '') + '"');
    if (quoted.length) parts.push('(' + quoted.join(' OR ') + ')');
    if (location) {
      const city = _clean(String(location).split(/[,/]/)[0])
        .replace(/^(remote|hybrid|onsite)\s*[-–]?\s*/i, '').trim();
      if (city) parts.push('"' + city.replace(/"/g, '') + '"');
    }
    return parts.join(' ');
  }

  /**
   * One LinkedIn people search per tier, scoped to the employer and place.
   * ctx: { company, title, location }
   * Returns [{ tier, why, titles, keywords, url }] -- empty without a
   * company, because an unscoped people search returns strangers.
   */
  function searchUrls(ctx) {
    const company = _clean(ctx && ctx.company);
    if (!company) return [];
    const location = _clean(ctx && ctx.location);
    const out = [];
    for (const group of targetTitles(ctx && ctx.title)) {
      const keywords = _keywords(company, group.titles, location);
      out.push(Object.assign({}, group, {
        keywords,
        url: PEOPLE_SEARCH + '?keywords=' + encodeURIComponent(keywords) + '&origin=GLOBAL_SEARCH_HEADER',
      }));
    }
    return out;
  }

  // ---- reading the results page -----------------------------------------
  // The user's own browser renders the search they opened; this reads what
  // is on screen. No request is made, nothing is clicked, nobody is
  // contacted. The handle is what the profile -> email step consumes.
  function _slug(href) {
    const m = String(href || '').match(/\/in\/([^/?#]+)/);
    if (!m) return '';
    const slug = _clean(decodeURIComponent(m[1]));
    // LinkedIn's opaque URN is not a public handle and resolves to nobody.
    return /^ACo[A-Za-z0-9_-]+$/.test(slug) ? '' : slug;
  }

  function harvestPeopleResults(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const out = [];
    if (!d || !d.querySelectorAll) return out;
    const seen = new Set();
    try {
      for (const a of d.querySelectorAll('a[href*="/in/"]')) {
        const slug = _slug(a.getAttribute('href'));
        if (!slug || seen.has(slug)) continue;

        // The card holding this link: walk up far enough to reach the
        // container that also carries the headline and location lines.
        let card = a;
        for (let i = 0; i < 6 && card && card.parentElement; i++) {
          card = card.parentElement;
          if (/entity-result|reusable-search|search-result/.test(card.className || '')) break;
        }
        const text = _clean((card && card.textContent) || '');
        const name = _clean(a.textContent).split('\n')[0].slice(0, 60);
        // A person's name, not "3rd" or "Message" or a company link.
        if (!/^[A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+){1,3}$/.test(name)) continue;

        seen.add(slug);
        const entry = { name, profile: slug, source: 'people-search' };
        // The headline follows the name on the card; take the line after it.
        const after = text.slice(text.indexOf(name) + name.length);
        const line = _clean(after.replace(/^[^A-Za-z]*(?:\d(?:st|nd|rd|th)\s*(?:degree)?\s*connection)?/i, ''));
        if (line) entry.title = line.split('  ')[0].slice(0, 120);
        out.push(entry);
      }
    } catch (e) { /* a results page shape we do not know: return what we have */ }
    return out;
  }

  global.LinkedInPeopleSearch = {
    fieldOf, disciplineOf, targetTitles, allTargetTitles, searchUrls, harvestPeopleResults,
    FIELDS, TARGETS, GENERIC_TALENT, FIELD_TO_DISCIPLINE,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LinkedInPeopleSearch;
})(typeof window !== 'undefined' ? window : globalThis);
