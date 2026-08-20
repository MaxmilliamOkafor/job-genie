/**
 * Job Genie - One description of every ATS the extension supports
 *
 * WHY THIS EXISTS
 *   Platform knowledge was spread across three files and disagreed with
 *   itself. content.js knew how to read a job on four platforms and fell
 *   back to og:title guessing on the other thirty-two; jd-contact-sources
 *   had its own container list; jd-contact-extractor knew four URL shapes
 *   for requisition IDs. A platform could therefore be "supported" -- its
 *   scripts loading, its host permitted -- while the tailor read a
 *   truncated description, which is what turns into "could not extract
 *   keywords" and takes the whole pipeline down with it.
 *
 *   One entry per platform, consumed by all three. Adding an ATS is adding
 *   an entry.
 *
 * WHAT AN ENTRY MEANS
 *   host        substrings that identify the platform from the hostname
 *   title/company/location/description
 *               ordered selectors, most specific first. Every list ends up
 *               merged with generic fallbacks by the caller, so a missing
 *               entry degrades rather than fails.
 *   jobId       URL pattern capturing the requisition ID, when the URL
 *               carries one
 *   apply       selectors for the apply/submit control, for autofill
 *   descriptionParts
 *               ALL of these, concatenated in order, when the platform
 *               splits the posting across several nodes. `description`
 *               above takes the FIRST selector that matches, which is
 *               right when one node holds the posting and wrong when it
 *               holds only the opening paragraph. A live audit found
 *               three platforms doing the latter: Workable keeps its
 *               requirements in [data-ui="job-requirements"] and its
 *               benefits elsewhere, SmartRecruiters splits into four
 *               ids, Lever into two. Reading only the first node means
 *               tailoring against the overview and never seeing what
 *               the employer actually asked for -- the exact truncation
 *               this file was written to stop, arriving by a different
 *               route.
 *   weightedParts
 *               { label: selector } for the parts worth more than the
 *               rest when tailoring. Qualifications sections are what a
 *               CV is scored against; benefits copy is noise.
 *   autofill    what the platform does with an uploaded CV. A live audit
 *               of ten of them found that only THREE parse it into the
 *               form at all, which is the difference between two jobs
 *               this extension can do:
 *
 *                 full / partial  the parse is visible in the DOM, so it
 *                                 can be read back and CHECKED against
 *                                 the profile -- a reversed name, a
 *                                 dropped country code, an empty
 *                                 portfolio field
 *                 none            the file attaches and every field
 *                                 stays blank; there is nothing to
 *                                 verify and the job is form-filling
 *                 gated           the upload sits behind a sign-in or a
 *                                 consent step, so say so rather than
 *                                 appearing to hang
 *                 exists-untested it advertises autofill and nobody has
 *                                 watched it work. Not the same as
 *                                 working.
 *
 *               phoneCountryDefault records a selector that defaults to
 *               the wrong country -- Teamtailor to +46, Recruitee to
 *               +61 -- which on a no-autofill platform the user
 *               otherwise corrects by hand on every application.
 *
 *   window.ATSPlatforms
 */
(function (global) {
  'use strict';

  // Excluded at the user's request and deliberately absent: Lever, Ashby,
  // Rippling, Indeed, Glassdoor, Wellfound and Otta. Absence here is what
  // excludes them -- detection, the recognition gate, contact harvesting
  // and requisition-ID parsing all read this map, so removing an entry
  // removes the platform everywhere at once.
  const PLATFORMS = {
    greenhouse: {
      label: 'Greenhouse',
      host: ['greenhouse.io'],
      title: ['h1.app-title', 'h1.posting-headline', '[data-test="posting-title"]', '.job__title h1', 'h1'],
      company: ['#company-name', '.company-name', '.posting-categories strong', '[class*="company"]'],
      location: ['.location', '.posting-categories .location', '.job__location'],
      // .job__description.body first, verified live 2026-08-20 on
      // job-boards.greenhouse.io. #content led this list and does not
      // exist on the current board at all, so every Greenhouse posting
      // was read by the second or third selector -- and .posting matches
      // the whole page including the application form, about 15k
      // characters of field labels the tailor then treats as the
      // posting. Kept last as a fallback for older boards.
      description: ['.job__description.body', '.job__description', '.posting-description',
        '#content', '.posting', '#app_body'],
      jobId: /greenhouse\.io\/[^/]+\/jobs\/(\d{5,})/i,
      apply: ['#apply_button', '[data-mapped="apply"]', 'button[type="submit"]'],
      // Verified live 2026-08-20: the file attaches and all eight
      // fields stay blank. Parsing happens server-side, where only
      // the recruiter sees it, so there is nothing here to read back.
      autofill: { mode: 'none', verified: true },
    },
    workday: {
      label: 'Workday',
      // myworkdaysite.com is Workday's OTHER tenant domain. Covering
      // only myworkdayjobs.com left half of Workday unsupported while
      // the platform read as done.
      host: ['workday.com', 'myworkdayjobs.com', 'myworkdaysite.com'],
      title: ['h1[data-automation-id="jobPostingHeader"]', '[data-automation-id="jobPostingHeader"]', 'h1'],
      company: ['[data-automation-id="jobPostingCompany"]', '[data-automation-id="company"]'],
      location: ['[data-automation-id="locations"]', '[data-automation-id="jobPostingLocation"]'],
      description: ['[data-automation-id="jobPostingDescription"]', '[data-automation-id="job-posting-details"]'],
      jobId: /myworkdayjobs?\.com\/.*?[_-](R-?\d{4,})/i,
      apply: ['[data-automation-id="adventureButton"]', '[data-automation-id="applyButton"]'],
      // Verified live 2026-08-20: step 1 of the wizard is Create
      // Account, and 'Autofill with Resume' is step 2, so it cannot
      // be reached anonymously. Whether the parse then happens is
      // per-tenant -- see includeResumeParsing in API_BUILDERS.
      autofill: { mode: 'gated', verified: true, gate: 'account-creation' },
    },
    smartrecruiters: {
      label: 'SmartRecruiters',
      host: ['smartrecruiters.com'],
      title: ['h1[data-test="job-title"]', '.job-title', 'h1'],
      company: ['[data-test="job-company-name"]', '.company-name'],
      location: ['[data-test="job-location"]', '.job-location', '[itemprop="jobLocation"]'],
      description: ['[data-test="job-description"]', '#st-jobDescription', '.job-sections', '.jobad-main'],
      // Pre-split into four stable ids. #st-qualifications is the part
      // a CV is actually scored against.
      descriptionParts: ['#st-companyDescription', '#st-jobDescription', '#st-qualifications',
        '#st-additionalInformation'],
      weightedParts: { qualifications: '#st-qualifications' },
      jobId: /smartrecruiters\.com\/[^/]+\/(\d{6,})/i,
      apply: ['#st-applyButton', 'button[data-test="apply-button"]'],
      // The Easy Apply dropzone advertises autocomplete, but the
      // file input lives inside a <spl-dropzone> shadow root whose Lit
      // component ignores synthetic events -- so the audit could not
      // drive it from the page. A content script CAN reach a shadow
      // root via element.shadowRoot, so this is ours to try. Until
      // someone watches it work, it is untested rather than working.
      autofill: { mode: 'exists-untested', verified: false,
        note: 'file input is inside a spl-dropzone shadow root' },
    },
    workable: {
      label: 'Workable',
      host: ['workable.com'],
      title: ['[data-ui="job-title"]', 'h1'],
      company: ['[data-ui="company-name"]', '[data-ui="company"]'],
      location: ['[data-ui="job-location"]', '[data-ui="location"]'],
      description: ['[data-ui="job-description"]', '[data-ui="overview"]', '.section--text'],
      // Verified live 2026-08-20: the posting is three nodes. Reading
      // only job-description tailors against the overview and never
      // sees a single requirement.
      descriptionParts: ['[data-ui="job-description"]', '[data-ui="job-requirements"]',
        '[data-ui="job-benefits"]'],
      weightedParts: { qualifications: '[data-ui="job-requirements"]' },
      jobId: /workable\.com\/[^/]+\/j\/([A-Z0-9]{6,})/i,
      apply: ['[data-ui="apply-button"]', 'button[type="submit"]'],
      // Verified live 2026-08-20, and the strongest parser tested:
      // all four jobs with date ranges, both degrees with school and
      // field of study. The trigger matters -- dropping a file into
      // the Resume field alone does NOT start the parse.
      autofill: { mode: 'full', verified: true,
        trigger: 'Import resume from > My computer',
        fields: ['firstName', 'lastName', 'email', 'headline', 'phone',
          'address', 'educationRecords', 'experienceRecords'] },
    },
    icims: {
      label: 'iCIMS',
      host: ['icims.com', 'icims.eu'],
      title: ['.iCIMS_Header', 'h1.iCIMS_Header', '[class*="jobtitle"]', 'h1'],
      company: ['.iCIMS_Logo img', '[class*="company"]'],
      location: ['.iCIMS_JobHeaderTag', '[class*="location"]'],
      description: ['.iCIMS_JobContent', '.iCIMS_InfoMsg_Job', '.iCIMS_Expandable_Container'],
      jobId: /icims\.com\/jobs\/(\d{4,})/i,
      apply: ['.iCIMS_ApplyOnlineButton', 'a[title*="Apply"]'],
      // Verified live 2026-08-20: the upload sits behind an 'Enter
      // Your Information' step needing an email and a GDPR consent
      // tick before the resume screen exists.
      autofill: { mode: 'gated', verified: true, gate: 'email-and-consent' },
    },
    taleo: {
      label: 'Taleo',
      host: ['taleo.net'],
      title: ['.titlepage', '#requisitionDescriptionInterface\\.reqTitleLinkAction', 'h1'],
      company: ['.brandingHeader img', '[class*="company"]'],
      location: ['[id*="reqBasicLocation"]', '[class*="location"]'],
      description: ['#requisitionDescriptionInterface', '.joblayouttoken', '.mastercontentpanel'],
      jobId: /taleo\.net\/.*?[?&]job=(\d+)/i,
      apply: ['#requisitionDescriptionInterface\\.ID1600', 'a[id*="apply"]'],
    },
    teamtailor: {
      label: 'Teamtailor',
      host: ['teamtailor.com'],
      title: ['h1', '.block-hero h1'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.block-hero [class*="meta"]'],
      description: ['[data-controller*="job"]', '.block-body', '#job-description'],
      jobId: /teamtailor\.com\/jobs\/(\d{4,})/i,
      apply: ['a[href*="/applications/new"]', 'button[type="submit"]'],
      // Verified live 2026-08-20: the file reaches S3 and every field
      // stays blank. The phone country selector defaults to Sweden.
      autofill: { mode: 'none', verified: true, phoneCountryDefault: '+46' },
    },
    bamboohr: {
      label: 'BambooHR',
      host: ['bamboohr.com'],
      title: ['h1', '.PositionTitle', '[class*="jobTitle"]'],
      company: ['[class*="companyName"]', 'header img'],
      location: ['[class*="location"]', '.PositionLocation'],
      description: ['#jobDescriptionText', '.jss-job-description', '[class*="description"]'],
      jobId: /bamboohr\.com\/(?:careers|jobs)\/(\d+)/i,
      apply: ['button[type="submit"]', 'a[href*="apply"]'],
    },
    recruitee: {
      label: 'Recruitee',
      host: ['recruitee.com'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['.job-description', '#job-description', '[class*="description"]'],
      jobId: /recruitee\.com\/o\/([a-z0-9-]+)/i,
      apply: ['a[href*="/apply"]', 'button[type="submit"]'],
      // Verified live 2026-08-20: nothing populates. The phone country
      // selector defaults to Australia.
      autofill: { mode: 'none', verified: true, phoneCountryDefault: '+61' },
    },
    jazzhr: {
      label: 'JazzHR',
      host: ['jazzhr.com', 'applytojob.com', 'theresumator.com'],
      title: ['h1', '.job-title', '#job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['#job-description', '.description', '[class*="description"]'],
      jobId: /applytojob\.com\/apply\/([A-Za-z0-9]+)/i,
      apply: ['button[type="submit"]', 'a[href*="apply"]'],
    },
    jobvite: {
      label: 'Jobvite',
      host: ['jobvite.com'],
      title: ['.jv-header', 'h1', '.jv-job-detail-title'],
      company: ['[class*="company"]', '.jv-logo img'],
      location: ['.jv-job-detail-meta', '[class*="location"]'],
      description: ['.jv-job-detail-description', '[class*="description"]'],
      jobId: /jobvite\.com\/.*?\/job\/([A-Za-z0-9]{6,})/i,
      apply: ['.jv-button-apply', 'a[href*="apply"]'],
    },
    successfactors: {
      label: 'SAP SuccessFactors',
      host: ['successfactors.com', 'successfactors.eu', 'sapsf.com', 'sapsf.eu'],
      title: ['.jobTitle', 'h1', '[data-automation-id*="title"]'],
      company: ['[class*="company"]', '.logo img'],
      location: ['.jobLocation', '[class*="location"]'],
      description: ['.jobDescription', '.jobDisplayContentContainer', '[class*="jobDescription"]'],
      jobId: /(?:successfactors|sapsf)\.[a-z]+\/.*?[?&]jobId=(\d+)/i,
      apply: ['#applyBtn', 'a[href*="apply"]', 'button[type="submit"]'],
    },
    personio: {
      label: 'Personio',
      host: ['personio.com', 'personio.de'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['#job-description', '.job-ad', '[class*="description"]'],
      jobId: /personio\.[a-z]+\/job\/(\d+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    eightfold: {
      label: 'Eightfold',
      host: ['eightfold.ai'],
      title: ['h1', '[class*="position-title"]', '[data-test-id*="title"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '[class*="position-location"]'],
      description: ['[class*="jobDescription"]', '[class*="job-description"]', '.job-description'],
      jobId: /eightfold\.ai\/careers\?.*?[?&]pid=(\d+)/i,
      apply: ['[class*="apply"]', 'button[type="submit"]'],
    },
    avature: {
      label: 'Avature',
      host: ['avature.net'],
      title: ['h1', '.job-title', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['.job-details', '.job-description', '[class*="description"]'],
      jobId: /avature\.net\/.*?\/(?:job|careers)\/(\d+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    cornerstone: {
      label: 'Cornerstone',
      host: ['csod.com', 'cornerstoneondemand.com'],
      title: ['h1', '[data-tag="job-title"]', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[data-tag="job-location"]', '[class*="location"]'],
      description: ['[data-tag="job-description"]', '.job-description', '[class*="description"]'],
      jobId: /csod\.com\/.*?\/requisition\/(\d+)/i,
      apply: ['[data-tag="apply-button"]', 'button[type="submit"]'],
    },
    brassring: {
      label: 'IBM BrassRing',
      host: ['brassring.com', 'kenexa.com'],
      title: ['h1', '.jobtitle', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['#job-description', '.jobdescription', '[class*="description"]'],
      jobId: /brassring\.com\/.*?[?&]jobId=(\d+)/i,
      apply: ['#applyButton', 'a[href*="apply"]'],
    },
    ultipro: {
      label: 'UKG / UltiPro',
      host: ['ultipro.com', 'ukg.com'],
      title: ['h1', '[data-automation="job-title"]', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[data-automation="city-state-location"]', '[class*="location"]'],
      description: ['[data-automation="job-description"]', '.job-description', '[class*="description"]'],
      jobId: /ultipro\.com\/.*?\/JobBoard\/.*?\/OpportunityDetail\?opportunityId=([0-9a-f-]+)/i,
      apply: ['[data-automation="apply"]', 'button[type="submit"]'],
    },
    adp: {
      label: 'ADP',
      host: ['adp.com', 'myadp.com'],
      title: ['h1', '[class*="jobTitle"]', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['[class*="jobDescription"]', '.job-description', '[class*="description"]'],
      jobId: /adp\.com\/.*?\/job\/([A-Za-z0-9_-]+)/i,
      apply: ['button[type="submit"]', 'a[href*="apply"]'],
    },
    breezy: {
      label: 'Breezy HR',
      host: ['breezy.hr'],
      title: ['h1', '.position-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['.position-location', '[class*="location"]'],
      description: ['.position', '.description', '[class*="description"]'],
      jobId: /breezy\.hr\/p\/([0-9a-f]+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
      // Verified live 2026-08-20: the file attaches, nothing populates.
      autofill: { mode: 'none', verified: true },
    },
    dover: {
      label: 'Dover',
      host: ['dover.com', 'dover.io', 'app.dover.io'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]'],
      jobId: /dover\.(?:com|io)\/.*?\/([0-9a-f-]{8,})/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    pinpoint: {
      label: 'Pinpoint',
      host: ['pinpointhq.com'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '#job-description', '[class*="description"]'],
      jobId: /pinpointhq\.com\/(?:jobs|postings)\/(\d+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
      // Verified live 2026-08-20: phone and LinkedIn both stay blank.
      autofill: { mode: 'none', verified: true },
    },
    zohorecruit: {
      label: 'Zoho Recruit',
      host: ['zohorecruit.com'],
      title: ['h1', '.job-title', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['#job-description', '.job-description', '[class*="description"]'],
      jobId: /zohorecruit\.com\/.*?\/([A-Za-z0-9_]+)$/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    occupop: {
      label: 'Occupop',
      host: ['occupop.com'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]'],
      jobId: /occupop\.com\/.*?\/(\d{4,})/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    bullhorn: {
      label: 'Bullhorn',
      host: ['bullhorn.com', 'bullhornstaffing.com', 'bullhorncdn.com'],
      title: ['h1', '.job-title', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '#job-description', '[class*="description"]'],
      jobId: /bullhorn[a-z]*\.com\/.*?\/(\d{5,})/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    oracle: {
      label: 'Oracle Recruiting',
      host: ['oraclecloud.com', 'oracle.com'],
      title: ['h1', '.job-title', '[data-bind*="title"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['.job-details', '.job-description', '[class*="description"]'],
      jobId: /oraclecloud\.com\/.*?\/job\/(\d+)/i,
      apply: ['button[data-bind*="apply"]', 'a[href*="apply"]'],
    },
    dayforce: {
      label: 'Ceridian Dayforce',
      host: ['dayforcehcm.com'],
      title: ['h1', '[class*="jobTitle"]', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['[class*="jobDescription"]', '.job-description', '[class*="description"]'],
      // View AND Apply: Dayforce moves from Posting/View/<id> to
      // Posting/Apply/<id>, and matching only the first meant the
      // application page carried no requisition id to tie it back to the
      // posting it came from.
      jobId: /dayforcehcm\.com\/.*?\/Posting\/(?:View|Apply|Detail)\/(\d+)/i,
      apply: ['a[href*="Apply"]', 'button[type="submit"]'],
    },
    freshteam: {
      label: 'Freshteam',
      host: ['freshteam.com'],
      title: ['h1', '.job-title', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]', '.job-location'],
      description: ['.job-description', '#job-description', '[class*="description"]'],
      jobId: /freshteam\.com\/jobs\/([A-Za-z0-9_-]+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    gusto: {
      label: 'Gusto',
      host: ['jobs.gusto.com'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]'],
      jobId: /jobs\.gusto\.com\/postings\/([^/]+)/i,
      apply: ['a[href*="applicants/new"]', 'button[type="submit"]'],
    },
    paylocity: {
      label: 'Paylocity',
      host: ['recruiting.paylocity.com', 'paylocity.com'],
      title: ['h1', '.job-title', '[class*="jobTitle"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]', '[class*="jobDescription"]'],
      jobId: /paylocity\.com\/Recruiting\/Jobs\/[^/]+\/(\d+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    comeet: {
      label: 'Comeet',
      host: ['comeet.co', 'comeet.com'],
      title: ['h1', '.job-title', '[class*="positionName"]'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]'],
      jobId: /comeet\.co\/jobs\/[^/]+\/([A-Za-z0-9._-]+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    polymer: {
      label: 'Polymer',
      host: ['jobs.polymer.co', 'polymer.co'],
      title: ['h1', '.job-title'],
      company: ['[class*="company"]', 'header img'],
      location: ['[class*="location"]'],
      description: ['.job-description', '[class*="description"]'],
      jobId: /jobs\.polymer\.co\/[^/]+\/(\d+)/i,
      apply: ['a[href*="apply"]', 'button[type="submit"]'],
    },
    linkedin: {
      label: 'LinkedIn',
      host: ['linkedin.com'],
      title: ['.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1'],
      company: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link'],
      location: ['.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet'],
      description: ['.jobs-description__content', '.description__text', '.show-more-less-html'],
      jobId: /linkedin\.com\/jobs\/view\/(\d{6,})/i,
      apply: ['.jobs-apply-button'],
    },
  };

  // Generic fallbacks appended to every platform's list, so an ATS with a
  // thin entry, or one not listed at all, still has something to read.
  const GENERIC = {
    title: ['h1', '[class*="job-title" i]', '[class*="jobTitle"]', '[itemprop="title"]'],
    company: ['[itemprop="hiringOrganization"]', '[class*="company-name" i]', '[class*="companyName"]'],
    location: ['[itemprop="jobLocation"]', '[class*="job-location" i]', '[class*="location" i]'],
    description: [
      '[itemprop="description"]', '[id*="job-description" i]', '[class*="job-description" i]',
      '[class*="jobDescription"]', '[data-testid*="description" i]', 'main', 'article',
    ],
  };

  /**
   * The platform for a hostname, or '' when it is not a known ATS.
   *
   * Matching is on a DOMAIN-LABEL boundary, not a substring. Substring
   * matching says myworkdayjobs.com.evil.example is Workday, which is
   * exactly the shape of a phishing host -- and this answer is used to
   * decide whether to type a password into a page, so it has to be right.
   */
  function _hostMatches(hostname, frag) {
    if (!hostname || !frag) return false;
    // A path fragment (jobs.gusto.com style entries never have one, but
    // zoho.com/recruit does) is checked against the full URL by the caller.
    if (frag.indexOf('/') !== -1) return false;
    return hostname === frag || hostname.endsWith('.' + frag);
  }

  function detect(hostname, href) {
    const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
    const u = String(href || '').toLowerCase();
    for (const key of Object.keys(PLATFORMS)) {
      for (const frag of PLATFORMS[key].host) {
        if (_hostMatches(h, frag)) return key;
        // Path-bearing entries identify a platform by URL prefix instead.
        if (frag.indexOf('/') !== -1 && u.indexOf('//' + frag) !== -1) return key;
      }
    }
    return '';
  }

  /**
   * Selectors for one field, platform-specific first then generic. Always
   * returns something, so a caller never has to special-case an unknown
   * platform.
   */
  /**
   * The nodes that together make up the posting, for a platform that
   * splits it. Empty for a platform that keeps it in one node, which is
   * the caller's signal to use `description` as before.
   *
   * Returned as { selector, weight } so the caller can tell the
   * qualifications section from the benefits copy. Weight is advisory:
   * every part is still read, in order, and concatenated.
   */
  function descriptionPartsFor(platformKey) {
    const p = PLATFORMS[platformKey];
    const parts = (p && p.descriptionParts) || [];
    if (!parts.length) return [];
    const weighted = (p && p.weightedParts) || {};
    const heavy = Object.keys(weighted).reduce((acc, label) => {
      acc[weighted[label]] = label;
      return acc;
    }, {});
    return parts.map((selector) => ({
      selector,
      weight: heavy[selector] ? 2 : 1,
      label: heavy[selector] || '',
    }));
  }

  function selectorsFor(platformKey, field) {
    const p = PLATFORMS[platformKey];
    const own = (p && p[field]) || [];
    const generic = GENERIC[field] || [];
    const out = [];
    for (const s of own.concat(generic)) if (out.indexOf(s) === -1) out.push(s);
    return out;
  }

  /**
   * The posting as the EMPLOYER declared it, from schema.org JobPosting.
   *
   * Most ATS and nearly every large employer's own careers site emit this
   * so the role appears in Google Jobs. It carries the title, the full
   * description, the company and the location as structured data -- no
   * selector guessing, no truncation, and it works identically on a
   * platform nobody has written selectors for.
   *
   * This is what makes an unknown ATS, or one of the 73 employer career
   * sites, read as well as Greenhouse does.
   */
  function _stripHtml(html) {
    return String(html || '')
      // Block boundaries first, or textContent runs sentences together.
      .replace(/<\/(p|div|li|h[1-6]|tr|section|br)[^>]*>/gi, '$& ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function _walk(node, hits) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => _walk(n, hits)); return; }
    if (String(node['@type'] || '').toLowerCase().indexOf('jobposting') !== -1) hits.push(node);
    for (const k of Object.keys(node)) {
      if (node[k] && typeof node[k] === 'object') _walk(node[k], hits);
    }
  }

  function fromJobPostingLd(doc) {
    const out = { title: '', company: '', location: '', description: '', jobId: '', found: false };
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return out;
    try {
      for (const el of d.querySelectorAll('script[type="application/ld+json"]')) {
        let data;
        try { data = JSON.parse(el.textContent || ''); } catch (e) { continue; }
        const hits = [];
        _walk(data, hits);
        for (const p of hits) {
          out.found = true;
          if (!out.title) out.title = _stripHtml(p.title);
          if (!out.description) out.description = _stripHtml(p.description);
          if (!out.company) {
            const ho = p.hiringOrganization;
            out.company = _stripHtml(typeof ho === 'string' ? ho : (ho && ho.name));
          }
          if (!out.location) {
            const jl = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
            const addr = jl && (jl.address || jl);
            if (addr) {
              out.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .map((x) => _stripHtml(typeof x === 'string' ? x : (x && x.name)))
                .filter(Boolean).join(', ');
            }
            // Remote roles declare it here instead of in an address.
            if (!out.location && p.jobLocationType) out.location = 'Remote';
          }
          if (!out.jobId) {
            const id = p.identifier;
            out.jobId = _stripHtml(typeof id === 'string' ? id : (id && id.value));
          }
          if (out.title && out.description && out.company) return out;
        }
      }
    } catch (e) {}
    return out;
  }

  /** Every description container across all platforms, for page harvesting. */
  function allDescriptionSelectors() {
    const out = [];
    for (const key of Object.keys(PLATFORMS)) {
      for (const s of PLATFORMS[key].description || []) if (out.indexOf(s) === -1) out.push(s);
    }
    for (const s of GENERIC.description) if (out.indexOf(s) === -1) out.push(s);
    return out;
  }

  /**
   * THE POSTING AS THE PLATFORM'S OWN API RETURNS IT.
   *
   * A selector describes where the text sits in today's markup, and
   * markup is redesigned. These endpoints are unauthenticated, return
   * the posting as data, and do not move: Greenhouse's board API and
   * Workday's CXS endpoint were both verified live on 2026-08-20.
   *
   * Only the two that were actually verified are here. Lever's API is
   * real but Lever is deliberately absent from this map; Recruitee's
   * single-offer shape was never confirmed, and guessing at it would put
   * an invented endpoint in a file whose whole point is that its entries
   * are true. Both fall through to JSON-LD, which is verified for them.
   *
   * Returns { url, map } where map names the JSON paths, or null.
   */
  const API_BUILDERS = {
    greenhouse(u) {
      // job-boards.greenhouse.io/{boardToken}/jobs/{jobId}
      const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d{4,})/);
      if (!m) return null;
      return {
        url: 'https://boards-api.greenhouse.io/v1/boards/' + m[1] + '/jobs/' + m[2] + '?content=true',
        map: { title: 'title', descriptionHtml: 'content', location: 'location.name',
          company: 'company_name', jobId: 'requisition_id' },
      };
    },
    workday(u) {
      // {tenant}.wd{N}.myworkdayjobs.com/{lang}/{site}/job/{...}
      //   -> /wday/cxs/{tenant}/{site}/job/{...}
      const tenant = u.hostname.split('.')[0];
      if (!tenant) return null;
      const seg = u.pathname.split('/').filter(Boolean);
      // The language segment is optional and looks like en-US or en_GB.
      if (seg.length && /^[a-z]{2}([-_][A-Za-z]{2})?$/.test(seg[0])) seg.shift();
      if (seg.length < 3 || seg[1] !== 'job') return null;
      const site = seg[0];
      const rest = seg.slice(1).join('/');
      return {
        url: u.origin + '/wday/cxs/' + tenant + '/' + site + '/' + rest,
        headers: { Accept: 'application/json' },
        map: { title: 'jobPostingInfo.title', descriptionHtml: 'jobPostingInfo.jobDescription',
          location: 'jobPostingInfo.location', company: 'hiringOrganization.name',
          jobId: 'jobPostingInfo.jobReqId',
          // Per-tenant: whether Workday will parse the CV at all once the
          // user has made an account. Worth knowing BEFORE signing up.
          resumeParsingEnabled: 'jobPostingInfo.includeResumeParsing' },
      };
    },
  };

  /**
   * What this platform does with an uploaded CV.
   *
   * Unknown by default, and unknown is its own answer: a platform nobody
   * has watched must not be treated as one that autofills, or the
   * extension waits for a parse that is never coming and reports its
   * absence as a failure.
   */
  function autofillCapability(platformKey) {
    const p = PLATFORMS[platformKey];
    const a = (p && p.autofill) || null;
    return {
      mode: (a && a.mode) || 'unknown',
      verified: !!(a && a.verified),
      gate: (a && a.gate) || '',
      trigger: (a && a.trigger) || '',
      phoneCountryDefault: (a && a.phoneCountryDefault) || '',
      fields: (a && a.fields) || [],
      note: (a && a.note) || '',
      // The two questions a caller actually asks.
      parsesCv: !!(a && (a.mode === 'full' || a.mode === 'partial')),
      blocked: !!(a && a.mode === 'gated'),
    };
  }

  function apiRequestFor(platformKey, href) {
    const build = API_BUILDERS[platformKey];
    if (!build) return null;
    try {
      const req = build(new URL(String(href || '')));
      return req && req.url ? req : null;
    } catch (e) { return null; }
  }

  /** Read a dotted path out of a parsed API response. */
  function pluck(obj, dotted) {
    let cur = obj;
    for (const key of String(dotted || '').split('.')) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  /** An API response mapped into the shape extractJobInfo works in. */
  function fromApiResponse(json, map) {
    const out = { title: '', company: '', location: '', description: '', jobId: '',
      resumeParsingEnabled: null, found: false };
    if (!json || !map) return out;
    const html = pluck(json, map.descriptionHtml);
    const description = _stripHtml(html);
    // A response that carries no description is not worth preferring
    // over the page: something changed, and the ladder should fall
    // through rather than report an empty posting.
    if (!description || description.length < 80) return out;
    out.description = description;
    out.title = String(pluck(json, map.title) || '').trim();
    out.company = String(pluck(json, map.company) || '').trim();
    const loc = pluck(json, map.location);
    out.location = String((loc && loc.name) || loc || '').trim();
    out.jobId = String(pluck(json, map.jobId) || '').trim();
    if (map.resumeParsingEnabled) {
      const flag = pluck(json, map.resumeParsingEnabled);
      if (typeof flag === 'boolean') out.resumeParsingEnabled = flag;
    }
    out.found = true;
    return out;
  }

  /** Requisition ID from the URL, using whichever platform matches. */
  function jobIdFromUrl(url) {
    const u = String(url || '');
    for (const key of Object.keys(PLATFORMS)) {
      const re = PLATFORMS[key].jobId;
      if (!re) continue;
      const m = u.match(re);
      if (m && m[1]) return m[1];
    }
    // Shapes common to several ATS, tried after the specific ones so a
    // platform's own pattern always wins.
    for (const re of [/\/jobs?\/(\d{5,})/i, /[?&](?:jobId|job_id|requisitionId|gh_jid|pid)=([A-Za-z0-9_-]{3,})/i]) {
      const m = u.match(re);
      if (m && m[1]) return m[1];
    }
    return '';
  }

  function list() {
    return Object.keys(PLATFORMS).map((id) => ({ id, label: PLATFORMS[id].label, host: PLATFORMS[id].host }));
  }

  global.ATSPlatforms = {
    PLATFORMS, GENERIC, detect, selectorsFor, descriptionPartsFor,
    apiRequestFor, fromApiResponse, autofillCapability,
    allDescriptionSelectors, jobIdFromUrl, list,
    fromJobPostingLd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ATSPlatforms;
})(typeof window !== 'undefined' ? window : globalThis);
