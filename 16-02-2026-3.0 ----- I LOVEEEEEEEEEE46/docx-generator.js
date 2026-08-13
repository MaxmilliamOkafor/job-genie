/**
 * Job Genie - DOCX Generator
 *
 * Builds a single-column, ATS-safe .docx of the audited CV from the same
 * plain-text the PDF engines consume. DOCX is what most ATS portals
 * (Workday, Greenhouse, Lever, Taleo, iCIMS, Glassdoor, eFinancialCareers)
 * parse most reliably -- PDF is the riskier format. Shipping DOCX
 * alongside PDF means the user can upload whichever the portal prefers.
 *
 * Why hand-rolled (no external library): a .docx is a ZIP of XML parts
 * with a tiny mandatory file set. Pulling in docx/jszip/pizzip would add
 * 100KB+ to the extension. This generator writes the four files Word
 * needs and zips them with our own DEFLATE-free store (Method 0). Word,
 * Pages, and every ATS we've tested accept stored ZIPs.
 *
 * Output: a base64 string (compatible with how the rest of the pipeline
 * passes generated files around) plus a filename.
 *
 * Public API:
 *   window.DocxGenerator.fromCvText(cvText, { name, filename })
 *     -> { base64, filename, success }
 */
(function (global) {
  'use strict';

  const TAG = '[JG-Docx]';

  // ---- Design system: "Deep Navy, premium corporate" (matches the PDF) --
  // Colours are OOXML hex (no leading #).
  const C = {
    NAVY: '16243F',   // name, section headers, company names
    BODY: '21232A',   // near-black body text
    MUTED: '66707A',  // dates, secondary meta
    LINK: '0066CC',   // hyperlinks
    RULE: 'BDC7D9',   // thin hairline under section headers
  };
  // Single clean professional sans (Calibri is the universal Word default;
  // Arial is the cross-platform fallback). ATS-safe either way.
  const FONT = 'Calibri';

  // ---- XML helpers -----------------------------------------------------
  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Build a run-properties block. opts: { bold, italic, caps, color, sz
  // (half-points), spacing (letter-spacing, 20ths of a pt), underline }
  function rPr(opts = {}) {
    const p = [`<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`];
    if (opts.bold) p.push('<w:b/><w:bCs/>');
    if (opts.italic) p.push('<w:i/><w:iCs/>');
    if (opts.caps) p.push('<w:caps/>');
    if (opts.color) p.push(`<w:color w:val="${opts.color}"/>`);
    if (opts.spacing != null) p.push(`<w:spacing w:val="${opts.spacing}"/>`);
    if (opts.sz != null) p.push(`<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>`);
    if (opts.underline) p.push('<w:u w:val="single"/>');
    return `<w:rPr>${p.join('')}</w:rPr>`;
  }
  // Last-resort dash guard, applied where text becomes a run so no caller
  // can bypass it. ContentQualityEngine rewrites dashes properly upstream
  // (a comma keeps the sentence whole); this is the guarantee for text that
  // reached the generator by some other path. A plain ASCII hyphen is one
  // byte in every encoding an ATS might assume, where an en or em dash is
  // three in UTF-8 and becomes mojibake if the parser guesses wrong.
  function foldDashes(text) {
    return String(text == null ? '' : text).replace(/[\u2013\u2014\u2015\u2212]/g, '-');
  }
  function run(text, opts = {}) {
    return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${xmlEscape(foldDashes(text))}</w:t></w:r>`;
  }
  function runText(text, bold) {
    return run(text, { bold: !!bold, color: C.BODY, sz: 21 });
  }
  function paragraph(content, opts = {}) {
    const ppr = [];
    if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
    // Tab stops: opts.tabs is an array of integers (twips from left margin).
    // The competencies grid this was built for is gone -- it is now one
    // item per line -- so the only remaining user is the role line, which
    // needs a RIGHT stop to set its dates flush to the margin.
    if (Array.isArray(opts.tabs) && opts.tabs.length) {
      // Accepts a plain number (a left stop) or { pos, val } for an
      // explicit alignment.
      const stops = opts.tabs.map((tb) => {
        const pos = (tb && typeof tb === 'object') ? tb.pos : tb;
        const val = (tb && typeof tb === 'object' && tb.val) ? tb.val : 'left';
        return `<w:tab w:val="${val}" w:pos="${pos}"/>`;
      }).join('');
      ppr.push(`<w:tabs>${stops}</w:tabs>`);
    }
    const sp = [];
    if (opts.spacingBefore != null) sp.push(`w:before="${opts.spacingBefore}"`);
    if (opts.spacingAfter != null) sp.push(`w:after="${opts.spacingAfter}"`);
    if (opts.lineRule) sp.push(`w:line="${opts.line}" w:lineRule="${opts.lineRule}"`);
    if (sp.length) ppr.push(`<w:spacing ${sp.join(' ')}/>`);
    if (opts.align) ppr.push(`<w:jc w:val="${opts.align}"/>`);
    if (opts.indent) ppr.push(`<w:ind w:left="${opts.indent}" w:hanging="${opts.hanging || 0}"/>`);
    if (opts.bottomBorder) {
      ppr.push(`<w:pBdr><w:bottom w:val="single" w:sz="${opts.bottomBorder.sz || 6}" w:space="2" w:color="${opts.bottomBorder.color}"/></w:pBdr>`);
    }
    const pprXml = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
    return `<w:p>${pprXml}${content}</w:p>`;
  }

  // ---- phone normaliser (parser-safe, no stray colon) ------------------
  // The source CV text header sometimes arrives as "+353: 0874261508"
  // (a stray colon between country code and number) which breaks ATS
  // phone parsers and reads as malformed. Normalise any phone-shaped
  // contact segment to "+CC NNN NNN NNNN" -- colon removed, trunk 0
  // after the country code dropped, light readability grouping.
  function normalizePhoneToken(seg) {
    const cleaned = String(seg || '').replace(/[^\d+]/g, '');
    if (!/\d{7,}/.test(cleaned)) return seg; // not a phone
    const m = cleaned.match(/^\+(\d{1,3})0?(\d+)$/);
    if (m) {
      const cc = m[1], local = m[2];
      let grouped = local;
      if (local.length >= 9) grouped = `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
      else if (local.length >= 7) grouped = `${local.slice(0, 3)} ${local.slice(3)}`;
      return `+${cc} ${grouped}`;
    }
    if (/^\d{7,}$/.test(cleaned)) {
      return cleaned.length >= 10
        ? `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`
        : cleaned;
    }
    return seg;
  }

  // Does this segment look like a phone number? (mostly digits + phone punct)
  function looksLikePhone(seg) {
    const s = String(seg || '').trim();
    return /^[+(]?[\d][\d\s:+()\-.]{6,}$/.test(s) && (s.match(/\d/g) || []).length >= 7;
  }

  // ---- contact line with real hyperlinks -------------------------------
  // Splits a contact/links line on " | " or " · " and renders each segment;
  // email/URL segments become clickable hyperlinks (collected into rels).
  // Uses " | " (pipe) as the visible separator -- the delimiter resume
  // parsers (Workday, Greenhouse, Sovren, HireAbility) handle most
  // reliably when splitting a contact line into email/phone/location.
  function contactParagraph(text, relsCollector, opts = {}) {
    const segs = text.split(/\s*[|·]\s*/).map((s) => s.trim()).filter(Boolean);
    const sep = '  |  ';
    const pieces = [];
    segs.forEach((seg, i) => {
      if (i > 0) pieces.push(run(sep, { color: C.MUTED, sz: opts.sz || 19 }));
      const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(seg);
      const isUrl = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(seg) && !isEmail;
      if (isEmail || isUrl) {
        const target = isEmail ? `mailto:${seg}` : (/^https?:\/\//i.test(seg) ? seg : `https://${seg}`);
        const id = `rIdLink${relsCollector.length + 1}`;
        relsCollector.push({ id, target });
        // Display without scheme/www/trailing slash. The full URL stays as
        // the hyperlink TARGET, so nothing is lost, but the visible line
        // drops from ~110 characters to ~75. At full width that is merely
        // tidier; on a phone the long form wrapped mid-URL and made the
        // header look broken, which is where a recruiter's eye lands first.
        // "linkedin.com/in/name" remains fully parseable to every ATS.
        // Keep the scheme. Dropping it shortened the line nicely, but an
        // ATS profile check looks for a URL and a bare "linkedin.com/in/x"
        // can read as plain text -- a scan came back flagging "Some
        // employers require a LinkedIn profile" on a CV that had one.
        // Detection beats tidiness, so only "www." and the trailing slash
        // go: still ~12 characters shorter than the raw value.
        const display = isEmail ? seg
          : (/^https?:\/\//i.test(seg) ? seg : 'https://' + seg)
              .replace(/^(https?:\/\/)www\./i, '$1')
              .replace(/\/+$/, '');
        pieces.push(`<w:hyperlink r:id="${id}">${run(display, { color: C.LINK, sz: opts.sz || 19, underline: true })}</w:hyperlink>`);
      } else {
        // Phone segments get normalised (strip stray colon, group digits).
        const display = looksLikePhone(seg) ? normalizePhoneToken(seg) : seg;
        pieces.push(run(display, { color: C.BODY, sz: opts.sz || 19 }));
      }
    });
    return paragraph(pieces.join(''), { align: opts.align || 'left', spacingAfter: opts.spacingAfter != null ? opts.spacingAfter : 40 });
  }

  // ---- inline URL hyperlinker (body) -----------------------------------
  // Wraps every http(s) URL in a line as a clickable hyperlink whose VISIBLE
  // text is the URL itself. This keeps links BOTH ATS-parseable (the full URL
  // stays in the extracted text — strict parsers never lose it) AND clickable.
  // Non-URL text (labels like "Live demo:" / "Code:") renders as normal body
  // runs. Used for the SELECTED PROJECTS link lines.
  function linkifyRuns(text, relsCollector, runOpts = {}) {
    const urlRe = /(https?:\/\/[^\s|]+)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = urlRe.exec(text)) !== null) {
      if (m.index > last) out += run(text.slice(last, m.index), runOpts);
      // Keep a trailing ) . , ; out of the link target but still visible.
      const raw = m[1];
      const target = raw.replace(/[).,;]+$/, '');
      const id = `rIdLink${relsCollector.length + 1}`;
      relsCollector.push({ id, target });
      out += `<w:hyperlink r:id="${id}">${run(target, Object.assign({}, runOpts, { color: C.LINK, underline: true }))}</w:hyperlink>`;
      if (target.length < raw.length) out += run(raw.slice(target.length), runOpts);
      last = m.index + raw.length;
    }
    if (last < text.length) out += run(text.slice(last), runOpts);
    return out;
  }

  // ---- name normaliser (parser-friendly First Last) --------------------
  // Resume parsers split the candidate's name into First/Last fields most
  // reliably from Title Case ("Maxmilliam Okafor"), and often FAIL on an
  // all-caps name ("MAXMILLIAM OKAFOR"). If the supplied name is entirely
  // upper-case we convert it to Title Case for the UNDERLYING text (the
  // generator can still render it visually bold/large). Names that are
  // already mixed case are left untouched so "McDonald" / "O'Brien" /
  // "van der Berg" are never mangled.
  function normalizeNameForParsing(name) {
    const n = String(name || '').trim();
    if (!n) return n;
    // Only touch all-caps names (no lowercase letters present).
    if (/[a-z]/.test(n)) return n;
    return n.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
  }

  // Is this line a date range? ("January 2023 - Present", "2021 - 2022")
  // Full month names. Both forms parse identically in every mainstream ATS
  // (Sovren/Textkernel, DaXtra, HireAbility, Affinda all accept "Jan",
  // "January" and "01/2023"), so this is chosen on readability: a recruiter
  // scanning a page reads "January 2023 - Present" faster than a numeric
  // range, and a spelled month cannot be mistaken for anything else.
  // Measured against the layout first -- the longest real title plus the
  // longest full-month range is 69 characters against ~96 available on the
  // role line, so it cannot collide with the right-aligned date.
  const MONTHS = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  // The tokens that mean "still there". These must match the set
  // prettyDateRange normalises, or a line written "01/2023 - Now" is not
  // recognised as a date at all: it renders as ordinary body text, loses
  // its right-aligned date styling, and never reaches the normaliser that
  // would have turned it into "January 2023 - Present".
  const ONGOING = 'present|current|now|ongoing|to\\s*date|till\\s*date';

  function isDateLine(t) {
    return new RegExp('^[A-Za-z]{3,9}\\.?\\s+\\d{4}\\s*[-–—]\\s*(' + ONGOING + '|[A-Za-z]{3,9}\\.?\\s+\\d{4})$', 'i').test(t) ||
      new RegExp('^\\d{4}\\s*[-–—]\\s*(' + ONGOING + '|\\d{4})$', 'i').test(t) ||
      new RegExp('^\\d{1,2}\\/\\d{4}\\s*[-–—]\\s*(' + ONGOING + '|\\d{1,2}\\/\\d{4})$', 'i').test(t) ||
      // MM/YYYY ranges: "01/2023 - Present", "04/2021 - 12/2022". These were
      // NOT matched, so every date in a generated CV fell through to the
      // generic body branch and rendered as ordinary text -- unstyled, and
      // not recognised as a date by the layout.
      /^\d{1,2}\/\d{4}\s*[-–—]\s*(present|current|\d{1,2}\/\d{4})$/i.test(t) ||
      /^[A-Za-z]{3,9}\.?\s+\d{4}$/.test(t) && t.length < 22;
  }

  // "01/2023 - Present" -> "Jan 2023 - Present". Month names are
  // unambiguous across regions and are the form ATS date parsers document,
  // whereas a bare 01/2023 has to be inferred.
  function prettyDateRange(t) {
    const ABBR = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11 };
    const one = (p) => {
      const v = String(p).trim();
      // "Present" is the token every documented ATS date parser recognises
      // for an ongoing role. "Current", "Now", "To date" and "Ongoing" are
      // understood by some and not others, and a parser that misses it
      // records the role as having no end date at all.
      if (/^(present|current|now|to\s*date|till\s*date|ongoing|date)$/i.test(v)) return 'Present';
      const m = /^(\d{1,2})\/(\d{4})$/.exec(v);
      if (m) {
        const idx = parseInt(m[1], 10) - 1;
        return MONTHS[idx] ? MONTHS[idx] + ' ' + m[2] : v;
      }
      // Expand an abbreviated month so one CV never mixes "Jan 2023" with
      // "August 2022" depending on how each role happened to be written.
      const a = /^([A-Za-z]{3,4})\.?\s+(\d{4})$/.exec(v);
      if (a) {
        const i = ABBR[a[1].toLowerCase()];
        if (i !== undefined) return MONTHS[i] + ' ' + a[2];
      }
      return v;
    };
    const parts = String(t).split(/\s*[-–—]\s*/);
    // Plain hyphen, not an en dash. The dash is typographically nicer, but
    // ATS date parsers are documented against "Month YYYY - Month YYYY"
    // and a en dash is a needless compatibility gamble in the one field
    // where a parse failure costs an employment record.
    if (parts.length === 2) return one(parts[0]) + ' - ' + one(parts[1]);
    return one(t);
  }

  // ---- CV text -> DOCX paragraphs --------------------------------------
  // The audited CV text uses the standard structure we already enforce:
  //   <name line>
  //   <contact line>
  //   <urls line>
  //   PROFESSIONAL SUMMARY
  //   <paragraph>
  //   CORE COMPETENCIES (or SKILLS)
  //   - item
  //   WORK EXPERIENCE
  //   Company
  //   Title
  //   <date range>
  //   - bullet
  //   ...
  //   EDUCATION / CERTIFICATIONS / SKILLS
  //
  // We detect section headers, bullets, and date-range lines by pattern.
  // Anything we can't classify becomes a normal body paragraph -- the
  // worst case is that it still appears, in order, which is what ATS
  // needs.

  const SECTION_HEADERS = [
    'PROFESSIONAL SUMMARY', 'SUMMARY', 'PROFILE',
    'CORE COMPETENCIES', 'AREAS OF EXPERTISE',
    'WORK EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT', 'PROFESSIONAL EXPERIENCE',
    'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'TECHNICAL PROFICIENCIES',
    'CERTIFICATIONS', 'PROJECTS', 'SELECTED PROJECTS', 'AWARDS',
  ];

  // ---- section order, enforced HERE rather than hoped for -------------
  // The DOCX prints whatever the tailoring model emitted, in whatever order
  // it emitted it. That made the layout depend on a prompt deployed
  // elsewhere: the prompt was corrected and the documents kept coming out
  // in the old order because the deploy had not happened.
  //
  // Reordering the TEXT before it is parsed removes that dependency. A
  // recruiter reads top-down and stops early, so the sections that answer
  // "can this person do THIS job" come first, and education goes last:
  // education above experience is the graduate convention and reads as
  // early-career on a CV with years of history behind it.
  const SECTION_RANK = [
    [/^(PROFESSIONAL SUMMARY|SUMMARY|PROFILE)$/, 1],
    [/^(CORE COMPETENCIES|AREAS OF EXPERTISE)$/, 2],
    [/^(WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT|PROFESSIONAL EXPERIENCE)$/, 3],
    [/^(SELECTED PROJECTS|PROJECTS)$/, 4],
    [/^(TECHNICAL PROFICIENCIES|TECHNICAL SKILLS|SKILLS)$/, 5],
    [/^CERTIFICATIONS$/, 6],
    [/^AWARDS$/, 7],
    [/^EDUCATION$/, 9],          // last, deliberately
  ];
  const rankOf = (header) => {
    for (const [re, r] of SECTION_RANK) if (re.test(header)) return r;
    return 8;                    // anything unrecognised sits above education
  };

  // The heading actually printed, whatever synonym the text arrived
  // with. The safest headings for a parser are the conventional ones,
  // and the tailoring prompt lives in an edge function deployed
  // separately -- so relying on the prompt alone means documents keep
  // coming out with the old heading until that deploy happens.
  // Normalising here makes the rendered file correct on extension
  // reload alone. Only synonyms are rewritten; a heading the renderer
  // does not recognise is left exactly as the writer set it.
  const CANONICAL_HEADER = {
    1: 'PROFESSIONAL SUMMARY',
    2: 'CORE COMPETENCIES',
    3: 'PROFESSIONAL EXPERIENCE',
    5: 'TECHNICAL SKILLS',
    6: 'CERTIFICATIONS',
    9: 'EDUCATION',
  };
  const canonicalHeader = (header, rank) => CANONICAL_HEADER[rank] || header;

  // ---- one heading, once --------------------------------------------
  // A generated CV passes through several keyword injectors before it
  // reaches here: the tailoring edge function appends a TECHNICAL
  // PROFICIENCIES section when it cannot find one to append to, the
  // popup's post-sanitisation pass does the same, and the model emits
  // its own. Each guards against creating a second copy, none of them
  // against creating a THIRD, and the popup's text-level dedupe merged
  // only the first duplicate pair -- so a document went out with
  //
  //   TECHNICAL PROFICIENCIES
  //   langgraph, crewai, b2b, enterprise
  //   TECHNICAL PROFICIENCIES
  //   Python, TypeScript, React, ...
  //
  // A repeated heading is not just untidy. Parsers that key sections by
  // heading either overwrite the first block with the second or drop one
  // of them, so it can cost the whole skills section -- the section an
  // ATS scores most directly. Merging here, in the renderer, means the
  // file is correct no matter which upstream injector misbehaves.
  const isCommaList = (body) => {
    const real = body.filter((l) => l.trim());
    return real.length === 1 && real[0].includes(',') && !/^[•\-*]/.test(real[0].trim());
  };
  function mergeCommaLists(a, b) {
    const seen = new Map();                      // lowercase -> chosen casing
    for (const item of (a + ', ' + b).split(',')) {
      const v = item.trim();
      if (!v) continue;
      const k = v.toLowerCase();
      // Injected keywords arrive lowercase ("langgraph"); the model's own
      // list is properly cased ("LangGraph"). On a collision keep the
      // cased one -- an all-lowercase term reads as machine-generated.
      if (!seen.has(k) || (seen.get(k) === seen.get(k).toLowerCase() && v !== v.toLowerCase())) {
        seen.set(k, v);
      }
    }
    return [...seen.values()].join(', ');
  }
  function absorb(first, later) {
    const trimEdges = (arr) => {
      const c = arr.slice(1);                    // drop the heading line
      while (c.length && !c[0].trim()) c.shift();
      while (c.length && !c[c.length - 1].trim()) c.pop();
      return c;
    };
    const a = trimEdges(first.lines);
    const b = trimEdges(later.lines);
    if (!b.length) return;
    if (isCommaList(a) && isCommaList(b)) {
      const ai = a.findIndex((l) => l.trim());
      a[ai] = mergeCommaLists(a[ai].trim(), b.find((l) => l.trim()).trim());
      first.lines = [first.lines[0]].concat(a, '');
      return;
    }
    first.lines = [first.lines[0]].concat(a, b, '');
  }

  // A heading with its content welded on after a colon is not a heading.
  //
  // The tailoring model sometimes emits
  //
  //   CORE COMPETENCIES: LLM Implementation, AI Workflows, ...
  //
  // on one line. A section is only recognised here when the whole line
  // IS the heading, so that arrived as ordinary body text: no heading
  // paragraph, the entire skills list rendered in bold, and nothing for
  // reorderSections to rank. Worse for the thing that matters -- an ATS
  // splits a CV into sections by finding a line that is just the
  // heading, so a competencies section written this way is not a
  // section at all, and its keywords are not scored as skills.
  //
  // Only split on a prefix that is a known section heading. That leaves
  // "Live demo: https://..." and "Microsoft Certified: Azure AI
  // Engineer Associate" alone, which is why the check is membership
  // rather than a shape.
  function splitInlineHeadings(lines) {
    const out = [];
    let split = 0;
    for (const line of lines) {
      const m = line.match(/^\s*([A-Za-z][A-Za-z &/]{2,40}?)\s*:\s*(\S.*)$/);
      if (m && SECTION_HEADERS.includes(m[1].trim().toUpperCase())) {
        out.push(m[1].trim().toUpperCase());
        out.push(m[2].trim());
        split++;
        continue;
      }
      out.push(line);
    }
    return { lines: out, split };
  }

  function reorderSections(cvText) {
    const raw = String(cvText == null ? '' : cvText);
    const inline = splitInlineHeadings(raw.split('\n'));
    const lines = inline.lines;
    const preamble = [];
    const blocks = [];
    let current = null;
    let renamed = 0;
    for (const line of lines) {
      const upper = line.trim().toUpperCase();
      if (SECTION_HEADERS.includes(upper)) {
        const rank = rankOf(upper);
        const label = canonicalHeader(upper, rank);
        if (label !== line.trim()) renamed++;
        current = { header: label, rank, lines: [label] };
        blocks.push(current);
        continue;
      }
      (current ? current.lines : preamble).push(line);
    }
    if (blocks.length < 2) {
      if (!inline.split && !renamed) return cvText;
      return preamble.concat(blocks.map((b) => b.lines.join('\n'))).join('\n');
    }

    // Fold repeats into the first block that carries the same heading.
    // Headings that mean the same section merge too (SKILLS into
    // TECHNICAL PROFICIENCIES): two differently-named skills lists are
    // the same duplication wearing a different label. Rank 8 is
    // "unrecognised", which is not a shared meaning, so those merge only
    // on an exact heading match.
    const byKey = new Map();
    const kept = [];
    let mergedAny = false;
    for (const b of blocks) {
      const key = b.rank === 8 ? 'x:' + b.header : 'r:' + b.rank;
      if (byKey.has(key)) { absorb(byKey.get(key), b); mergedAny = true; continue; }
      byKey.set(key, b);
      kept.push(b);
    }

    const sorted = kept
      .map((b, i) => ({ b, i }))
      .sort((x, y) => (x.b.rank - y.b.rank) || (x.i - y.i))   // stable
      .map((x) => x.b);
    // Nothing to merge, nothing to split, already in order: leave it
    // exactly as it is.
    let dedupedSkills = false;
    // ---- the two skills sections must not repeat each other ----------
    //
    // A real generated CV listed nine Core Competencies, six of which
    // appeared again verbatim in Technical Skills sixty lines later:
    // Data Profiling, Data Modelling, Databricks, SQL, Power BI, Data
    // Warehousing. Two thirds of the scan zone was padding, and a
    // recruiter reading the same six terms twice draws the obvious
    // conclusion. The prompt already forbids this (RULE 15c); the model
    // did it anyway, so the renderer enforces it and no deploy is
    // needed.
    //
    // Trimmed from TECHNICAL SKILLS rather than CORE COMPETENCIES.
    // Both map to "skills" in every parser here, so the term is still
    // indexed either way and no keyword is lost -- but Core Competencies
    // is the six-second scan zone and gutting it to three lines would
    // trade one problem for another. A floor keeps the technical list
    // substantial: if trimming would leave it thin, the duplication is
    // the lesser evil and nothing is touched.
    (() => {
      const cc = sorted.find((b) => b.rank === 2);
      const ts = sorted.find((b) => b.rank === 5);
      if (!cc || !ts) return;
      const itemsOf = (block) => block.lines.slice(1).join('\n')
        .split(/[,\n]/).map((s) => s.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean);
      const owned = new Set(itemsOf(cc).map((s) => s.toLowerCase()));
      if (!owned.size) return;
      const kept = itemsOf(ts).filter((s) => !owned.has(s.toLowerCase()));
      if (kept.length === itemsOf(ts).length) return;      // nothing repeated
      if (kept.length < 8) return;                          // would leave it thin
      ts.lines = [ts.lines[0], kept.join(', '), ''];
      dedupedSkills = true;
    })();

    if (!mergedAny && !inline.split && !renamed && !dedupedSkills && sorted.every((b, i) => b === blocks[i])) return cvText;

    // Exactly one blank line between sections. Reordering moves blocks
    // that did not end in one, which is how EDUCATION ended up welded to
    // the last certification bullet with no gap.
    const dropTrailingBlanks = (arr) => {
      const l = arr.slice();
      while (l.length && !l[l.length - 1].trim()) l.pop();
      return l;
    };

    const parts = [];
    const pre = dropTrailingBlanks(preamble);
    if (pre.length) parts.push(pre.join('\n'));
    for (const b of sorted) parts.push(dropTrailingBlanks(b.lines).join('\n'));
    return parts.join('\n\n');
  }

  function buildBodyXml(cvText) {
    const lines = reorderSections(cvText).split('\n');
    const out = [];
    const rels = []; // hyperlink relationships collected for the contact line

    // Experience sections where the company/title/date treatment applies.
    //
    // PROFESSIONAL EXPERIENCE was missing, though SECTION_HEADERS has
    // always listed it and the tailoring model emits it freely. A CV
    // that used that wording lost the whole role/date treatment --
    // dates no longer right-aligned to their role line, the company and
    // title no longer emphasised -- silently, because nothing here
    // fails when the list does not match. Kept in step with
    // SECTION_RANK rank 3.
    const EXPERIENCE_HEADERS = SECTION_HEADERS.filter((h) => rankOf(h) === 3);

    let firstNonEmpty = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { firstNonEmpty = i; break; }
    }

    if (firstNonEmpty >= 0) {
      // NAME -- navy, bold, 22pt, left-aligned (matches the PDF header)
      out.push(paragraph(
        run(normalizeNameForParsing(lines[firstNonEmpty].trim()), { bold: true, color: C.NAVY, sz: 44, spacing: 4 }),
        { align: 'left', spacingAfter: 40 }
      ));

      // Contact + links lines until first section header (hyperlinked)
      let i = firstNonEmpty + 1;
      let headerLineCount = 0;
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        const upper = t.toUpperCase().replace(/:$/, '');
        if (SECTION_HEADERS.includes(upper)) break;
        out.push(contactParagraph(t, rels, { align: 'left', sz: 19, spacingAfter: 40 }));
        headerLineCount++;
      }

      // Full-width navy hairline under the header block.
      out.push(paragraph('', { bottomBorder: { color: C.NAVY, sz: 8 }, spacingAfter: 120 }));

      // Body
      let roleState = 'none';        // 'expectCompany' | 'expectTitle' | 'inRole'
      let inExperience = false;
      // Tracks the section we are currently rendering into so list-shaped
      // content (CERTIFICATIONS / TECHNICAL PROFICIENCIES / SKILLS) can
      // be split into one bullet per item even when the source has them
      // as a single comma-separated paragraph.
      let currentSection = '';
      // One-per-line bulleted sections: each item is its own paragraph.
      const LIST_SECTIONS = new Set([
        'CERTIFICATIONS', 'AWARDS',
      ]);
      // Sections rendered as one item per line, single column.
      //
      // These used to be a three-up grid built from TAB characters. The
      // structure was genuinely single-column -- no tables, no Word
      // columns -- which is why it read as ATS-safe. The tabs were not.
      // Parsers disagree about <w:tab/>: some emit "\t", some drop it
      // entirely, and when it is dropped adjacent items glue together --
      // "Project ManagementQuality AssuranceRisk Management", one
      // unmatchable blob in the section an ATS scores most directly.
      //
      // That was previously patched by padding each item with a trailing
      // space so a word boundary survived. It treated the symptom: the
      // items were still undelimited, just no longer welded. And the tab
      // stops were fixed positions measured for A4, so on a phone the
      // columns did not reflow, they overflowed.
      //
      // A line break is a delimiter no parser can misread.
      const GRID_SECTIONS = new Set([
        'CORE COMPETENCIES', 'AREAS OF EXPERTISE',
      ]);
      // ONE ITEM PER PARAGRAPH.
      //
      // This was a three-up grid: one paragraph per row, with items
      // separated by TAB characters. It is a single-column paragraph
      // structure, which is why it looked safe -- but text extraction
      // yields the tabs, and every ATS then has to guess what they mean.
      // Some drop them, giving "Stakeholder managementAzure DevOps"; some
      // render a space, merging three skills into one long phrase. Either
      // way the delimiter between skills is lost, which is the one thing
      // a skills section has to get right.
      //
      // The tab stops were also fixed positions measured for A4, so on a
      // phone the columns do not reflow -- they overflow.
      //
      // A line break is a delimiter no parser can misread, and a short
      // line fits any screen.
      const emitGrid = (items) => { items.forEach(emitCompetency); };
      // Competencies: bulleted, one per line, single column.
      const emitCompetency = (item) => out.push(paragraph(
        run('•  ', { color: C.NAVY, sz: 22 }) + run(item, { color: C.BODY, sz: 21 }),
        { indent: 360, hanging: 240, spacingAfter: 30, line: 276, lineRule: 'auto' }
      ));
      // A helper to emit a single navy-bullet item paragraph.
      const emitBullet = (item) => out.push(paragraph(
        run('•  ', { color: C.NAVY, sz: 22 }) + run(item, { color: C.BODY, sz: 21 }),
        { indent: 360, hanging: 240, spacingAfter: 50, line: 288, lineRule: 'auto' }
      ));
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) {
          out.push(paragraph('', { spacingAfter: 40 }));
          if (inExperience) roleState = 'expectCompany';
          continue;
        }
        const upper = t.toUpperCase().replace(/:$/, '');

        if (SECTION_HEADERS.includes(upper)) {
          // SECTION HEADER -- navy, bold, caps, tracked, light-grey rule under
          out.push(paragraph(
            run(upper, { bold: true, caps: true, color: C.NAVY, sz: 22, spacing: 24 }),
            { spacingBefore: 240, spacingAfter: 60, bottomBorder: { color: C.RULE, sz: 4 } }
          ));
          inExperience = EXPERIENCE_HEADERS.includes(upper);
          roleState = inExperience ? 'expectCompany' : 'none';
          currentSection = upper;
          continue;
        }

        if (/^([\-*•]|\d+\.)\s+/.test(t)) {
          const item = t.replace(/^([\-*•]|\d+\.)\s+/, '');
          emitBullet(item);
          if (inExperience) roleState = 'inRole';
          continue;
        }

        // Experience role lines: company (navy bold) -> title (body bold)
        // -> date (muted italic). Date lines detected anywhere.
        if (inExperience) {
          if (isDateLine(t)) {
            out.push(paragraph(run(prettyDateRange(t), { italic: true, color: C.MUTED, sz: 19 }), { spacingAfter: 40 }));
            continue;
          }
          if (roleState === 'expectCompany') {
            out.push(paragraph(run(t, { bold: true, color: C.NAVY, sz: 21 }), { spacingBefore: 80, spacingAfter: 20 }));
            roleState = 'expectTitle';
            continue;
          }
          if (roleState === 'expectTitle') {
            // Put the dates on the SAME line as the job title, right
            // aligned. Three stacked lines per role (company / title /
            // dates) wasted a line each and left the date orphaned from the
            // role it belongs to; parsers bind a date to the nearest
            // title far more reliably when they share a line.
            //
            // The trailing space before the tab is the same guard the
            // competencies grid needs: parsers that drop <w:tab/> would
            // otherwise glue "Software EngineerJan 2023".
            const next = (lines[i + 1] || '').trim();
            if (isDateLine(next)) {
              out.push(paragraph(
                run(t + ' ', { bold: true, color: C.BODY, sz: 21 })
                  + '<w:r><w:tab/></w:r>'
                  + run(prettyDateRange(next), { italic: true, color: C.MUTED, sz: 19 }),
                { tabs: [{ pos: 10106, val: 'right' }], spacingAfter: 30 }
              ));
              i++;                       // the date line is consumed
              roleState = 'inRole';
              continue;
            }
            out.push(paragraph(run(t, { bold: true, color: C.BODY, sz: 21 }), { spacingAfter: 20 }));
            roleState = 'inRole';
            continue;
          }
          // Anything else inside a role -> body
          out.push(paragraph(run(t, { color: C.BODY, sz: 21 }), { spacingAfter: 40 }));
          continue;
        }

        // LIST-SHAPED SECTIONS: a single line of 2+ comma-separated items
        // with no sentence punctuation gets split into per-item paragraphs.
        // CORE COMPETENCIES / AREAS OF EXPERTISE -> one item per line.
        // CERTIFICATIONS / AWARDS                -> one bullet per line.
        if (LIST_SECTIONS.has(currentSection) || GRID_SECTIONS.has(currentSection)) {
          const looksLikeList = /,/.test(t) && !/[.!?]\s/.test(t) && t.split(',').length >= 2;
          if (looksLikeList) {
            const items = t.split(/,\s*/)
              .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
              .filter((s) => s.length > 0);
            if (GRID_SECTIONS.has(currentSection)) {
              emitGrid(items);
            } else {
              items.forEach(emitBullet);
            }
            continue;
          }
        }

        // Lines containing URLs (e.g. SELECTED PROJECTS "Live demo / Code"):
        // render each URL as a clickable hyperlink while keeping the full URL
        // visible as text, so it stays 100% ATS-parseable. Labels render as
        // plain body text.
        if (/https?:\/\//.test(t)) {
          out.push(paragraph(linkifyRuns(t, rels, { color: C.BODY, sz: 21 }),
            { spacingAfter: 40, line: 276, lineRule: 'auto' }));
          continue;
        }

        // Non-experience body. "Label: items" (skills) -> bold label.
        const labelMatch = t.match(/^([A-Z][A-Za-z &/]{1,28}):\s*(.+)$/);
        if (labelMatch) {
          out.push(paragraph(
            run(labelMatch[1] + ': ', { bold: true, color: C.BODY, sz: 21 }) +
            run(labelMatch[2], { color: C.BODY, sz: 21 }),
            { spacingAfter: 40 }
          ));
          continue;
        }
        out.push(paragraph(run(t, { color: C.BODY, sz: 21 }), { spacingAfter: 40, line: 276, lineRule: 'auto' }));
      }
    }

    return { bodyXml: out.join(''), rels };
  }

  // ---- Word document XML ----------------------------------------------
  //
  // Page size follows the posting's country: US Letter for North America
  // and the Letter-using parts of Latin America, A4 everywhere else. This
  // is invisible to every ATS -- parsers read the text stream and never
  // look at <w:pgSz> -- so it is not a rejection risk in either
  // direction. It matters exactly once, when a human prints the file: A4
  // on a Letter tray loses the bottom 18mm of the page.
  //
  // Margins stay identical in both. They are already inside the printable
  // area of both paper sizes, and a single margin set means the line
  // breaks a reviewer sees do not depend on which country they are in.
  const A4_TWIPS = { w: 11906, h: 16838 };

  function documentXml(bodyXml, pageTwips) {
    const pg = (pageTwips && pageTwips.w && pageTwips.h) ? pageTwips : A4_TWIPS;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${bodyXml}` +
      `<w:sectPr>` +
      `<w:pgSz w:w="${pg.w}" w:h="${pg.h}"/>` +
      `<w:pgMar w:top="864" w:right="900" w:bottom="864" w:left="900" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>` +
      `</w:body></w:document>`;
  }

  // Resolve the page from whatever the caller passed: an explicit
  // {w,h}, a region object from RegionalFormat, or a location string.
  function pageTwipsFrom(opts) {
    if (opts && opts.pageTwips && opts.pageTwips.w) return opts.pageTwips;
    if (opts && opts.region && opts.region.pageTwips) return opts.region.pageTwips;
    const RF = global.RegionalFormat;
    if (RF && opts && opts.jobLocation) {
      return RF.resolveRegion(opts.jobLocation, opts.candidateLocation).pageTwips;
    }
    return A4_TWIPS;
  }

  function wordRelsXml(rels) {
    const links = (rels || []).map((r) =>
      `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(r.target)}" TargetMode="External"/>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${links}</Relationships>`;
  }

  const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;
  const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  // ---- Minimal ZIP writer (store / Method 0, no compression) -----------
  // CRC32 implementation -- needed for the local + central directory headers.
  const CRC_TABLE = (() => {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();
  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function strToBytes(s) {
    return new TextEncoder().encode(s);
  }
  function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
  function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

  function buildZip(files) {
    // files: [{ name, content (string) }]
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = strToBytes(f.name);
      const dataBytes = strToBytes(f.content);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header
      const local = [
        ...u32(0x04034b50),    // signature
        ...u16(20),            // version needed
        ...u16(0),             // gp flag
        ...u16(0),             // method = stored
        ...u16(0),             // mod time
        ...u16(0x4F21),        // mod date (2019-05-01)
        ...u32(crc),
        ...u32(size),          // compressed size
        ...u32(size),          // uncompressed size
        ...u16(nameBytes.length),
        ...u16(0),             // extra length
      ];
      localChunks.push(new Uint8Array(local));
      localChunks.push(nameBytes);
      localChunks.push(dataBytes);

      // Central directory entry
      const central = [
        ...u32(0x02014b50),
        ...u16(20),            // version made by
        ...u16(20),            // version needed
        ...u16(0),             // gp flag
        ...u16(0),             // method
        ...u16(0),             // mod time
        ...u16(0x4F21),        // mod date
        ...u32(crc),
        ...u32(size),
        ...u32(size),
        ...u16(nameBytes.length),
        ...u16(0),             // extra
        ...u16(0),             // comment
        ...u16(0),             // disk number
        ...u16(0),             // internal attrs
        ...u32(0),             // external attrs
        ...u32(offset),        // local header offset
      ];
      centralChunks.push(new Uint8Array(central));
      centralChunks.push(nameBytes);

      offset += 30 + nameBytes.length + size;
    }

    // End of central directory record
    let centralSize = 0;
    for (const c of centralChunks) centralSize += c.length;
    const eocd = [
      ...u32(0x06054b50),
      ...u16(0),                 // disk #
      ...u16(0),                 // start disk
      ...u16(files.length),      // entries on disk
      ...u16(files.length),      // total entries
      ...u32(centralSize),
      ...u32(offset),            // central dir offset
      ...u16(0),                 // comment
    ];

    const totalSize = offset + centralSize + eocd.length;
    const out = new Uint8Array(totalSize);
    let pos = 0;
    for (const c of localChunks) { out.set(c, pos); pos += c.length; }
    for (const c of centralChunks) { out.set(c, pos); pos += c.length; }
    out.set(new Uint8Array(eocd), pos);
    return out;
  }

  function bytesToBase64(bytes) {
    // Window has btoa; we chunk to avoid argument-length issues.
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(s);
  }

  // ---- COVER LETTER -> DOCX paragraphs (same navy design language) ----
  // Cover letters have no SECTION HEADERS -- the structure is:
  //   <name>            -- navy 22pt bold
  //   <contact + links> -- hyperlinked
  //   ---- navy hairline ----
  //   <date>            -- muted
  //   Re: <Job Title>   -- navy bold
  //   Dear Hiring Manager,
  //   <body paragraphs>
  //   Sincerely,
  //   <name>
  function buildCoverLetterBodyXml(text) {
    const lines = text.split('\n');
    const out = [];
    const rels = [];

    let firstNonEmpty = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { firstNonEmpty = i; break; }
    }
    if (firstNonEmpty < 0) return { bodyXml: '', rels };

    // NAME
    out.push(paragraph(
      run(normalizeNameForParsing(lines[firstNonEmpty].trim()), { bold: true, color: C.NAVY, sz: 44, spacing: 4 }),
      { align: 'left', spacingAfter: 40 }
    ));

    // Contact / links lines until we hit either a date line, a "Re:" line,
    // or "Dear" -- those mark the end of the header block.
    let i = firstNonEmpty + 1;
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      if (/^(re:|dear\b|sincerely|yours\s+(sincerely|truly))/i.test(t)) break;
      // Date line: e.g. "June 10, 2026"
      if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(t)) break;
      out.push(contactParagraph(t, rels, { align: 'left', sz: 19, spacingAfter: 40 }));
    }

    // Navy hairline under the header
    out.push(paragraph('', { bottomBorder: { color: C.NAVY, sz: 8 }, spacingAfter: 200 }));

    // Body
    for (; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) { out.push(paragraph('', { spacingAfter: 80 })); continue; }

      // Date
      if (/^[A-Za-z]+\s+\d{1,2},\s+\d{4}$/.test(t)) {
        out.push(paragraph(run(t, { color: C.MUTED, sz: 21 }), { spacingAfter: 120 }));
        continue;
      }
      // "Re: Job Title"
      if (/^re:/i.test(t)) {
        out.push(paragraph(run(t, { bold: true, color: C.NAVY, sz: 22 }), { spacingAfter: 120 }));
        continue;
      }
      // Salutation / closing salutation
      if (/^dear\b/i.test(t) || /^sincerely|^yours\s+(sincerely|truly)/i.test(t)) {
        out.push(paragraph(run(t, { color: C.BODY, sz: 21 }), { spacingAfter: 120 }));
        continue;
      }
      // Body paragraph (justified for letter look, ~1.4 line height)
      out.push(paragraph(
        run(t, { color: C.BODY, sz: 21 }),
        { spacingAfter: 120, line: 288, lineRule: 'auto' }
      ));
    }

    return { bodyXml: out.join(''), rels };
  }

  function fromCvText(cvText, opts = {}) {
    try {
      if (!cvText || typeof cvText !== 'string') {
        return { success: false, error: 'empty CV text' };
      }
      const { bodyXml, rels } = buildBodyXml(cvText);
      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: ROOT_RELS_XML },
        { name: 'word/_rels/document.xml.rels', content: wordRelsXml(rels) },
        { name: 'word/document.xml', content: documentXml(bodyXml, pageTwipsFrom(opts)) },
      ];
      const zipBytes = buildZip(files);
      const base64 = bytesToBase64(zipBytes);
      const baseName = (opts.name || 'Resume').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
      const filename = opts.filename || `${baseName}_CV.docx`;
      return { success: true, base64, filename, size: zipBytes.length };
    } catch (e) {
      console.warn(TAG, 'generation failed:', e);
      return { success: false, error: e.message };
    }
  }

  function fromCoverLetterText(coverText, opts = {}) {
    try {
      if (!coverText || typeof coverText !== 'string') {
        return { success: false, error: 'empty cover letter text' };
      }
      const { bodyXml, rels } = buildCoverLetterBodyXml(coverText);
      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: ROOT_RELS_XML },
        { name: 'word/_rels/document.xml.rels', content: wordRelsXml(rels) },
        { name: 'word/document.xml', content: documentXml(bodyXml, pageTwipsFrom(opts)) },
      ];
      const zipBytes = buildZip(files);
      const base64 = bytesToBase64(zipBytes);
      const baseName = (opts.name || 'Cover_Letter').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
      const filename = opts.filename || `${baseName}_Cover_Letter.docx`;
      return { success: true, base64, filename, size: zipBytes.length };
    } catch (e) {
      console.warn(TAG, 'cover-letter generation failed:', e);
      return { success: false, error: e.message };
    }
  }

  // ---- one filename rule, used by every path that builds a document ---
  //
  // The popup and the content script each generate documents, and each
  // built its own filename. The popup learned to include the target role
  // ("Maxmilliam_Okafor_Senior_Technical_Business_Analyst_CV.docx"); the
  // content script's auto-flow kept its own `First_Last_CV.docx`. So the
  // panel showed one name and the file attached to the form had another,
  // which is both confusing and hides a real failure: with the role in
  // the name, a CV left over from a DIFFERENT application is obvious at a
  // glance. Without it, every file is called the same thing and a stale
  // attachment is invisible.
  //
  // Capped at four words and 34 characters, never cutting a word in half:
  // some postings run past eighty characters and older portals truncate.
  function buildFileBase(firstName, lastName, jobTitle) {
    const clean = (s) => String(s == null ? '' : s).trim()
      .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const first = clean(firstName) || 'Applicant';
    const last = clean(lastName);
    const nameBase = last ? first + '_' + last : first;

    const words = String(jobTitle == null ? '' : jobTitle)
      .replace(/\([^)]*\)/g, ' ')                       // "(Remote)", "(m/f/d)"
      .replace(/\s*[-–—|]\s*(remote|hybrid|onsite|contract|permanent|full[- ]time|part[- ]time)\b.*$/i, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .trim().split(/\s+/).filter(Boolean).slice(0, 4);
    let slug = '';
    for (const w of words) {
      const next = slug ? slug + '_' + w : w;
      if (next.length > 34) break;
      slug = next;
    }
    return slug ? nameBase + '_' + slug : nameBase;
  }

  global.DocxGenerator = { fromCvText, fromCoverLetterText, buildFileBase };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.DocxGenerator;
  }
  console.log(TAG, 'loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
