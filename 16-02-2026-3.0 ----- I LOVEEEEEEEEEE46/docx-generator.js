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
  //
  // ---- ON COLOUR, AND HOW MUCH OF IT ----------------------------------
  // Asked whether an accent colour helps a recruiter who has read a
  // thousand black-and-white CVs today. It does, but only if it marks
  // something. Two failures are possible and both were present.
  //
  // TOO DARK TO BE AN ACCENT. NAVY was 16243F, about 15:1 on white,
  // which the eye reads as black. Every heading was "accented" and the
  // page had no accent at all: the cost of a colour with none of the
  // benefit.
  //
  // TOO MUCH OF IT. A CV rendered elsewhere came back with the name,
  // every job title, every project title, every degree and every
  // certification title in a bright link blue -- about twenty items.
  // Colour works by contrast, so accenting a fifth of the page
  // emphasises nothing and simply changes the palette.
  //
  // So: the accent marks the LANDMARKS a scan jumps between, which is
  // the name and the section headings, and nothing else. Company names
  // moved to bold black beside the titles that were already bold black.
  // Bold outranks colour at 10pt anyway.
  //
  // 1F4E79 is about 8.6:1 on white -- unmistakably blue on screen, and
  // it prints as a solid dark grey rather than the pale smudge a link
  // blue leaves in greyscale.
  //
  // None of this touches parsing. Text extraction reads the text
  // stream; colour is a separate graphics instruction that every
  // extractor discards. No ATS scores it, and no keyword match depends
  // on it. The parsing risks are columns, tables, text boxes and
  // header/footer content, none of which this renderer emits.
  const C = {
    NAVY: '1F4E79',   // THE accent: the name and the section headings
    BODY: '21232A',   // near-black body text, and the company/title lines
    MUTED: '66707A',  // dates, secondary meta
    LINK: '1F4E79',   // hyperlinks, same accent -- the underline marks them
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
  // Adds w:before to a paragraph that has already been built. Used for
  // the entry gap, which is only known to be needed once the NEXT entry
  // starts -- by which time the paragraph is a string in the output.
  function withSpacingBefore(xml, twips) {
    const p = String(xml || '');
    if (!p.startsWith('<w:p>')) return p;
    if (/<w:spacing [^>]*w:before="/.test(p)) return p;      // already spaced
    if (/<w:spacing /.test(p)) {
      return p.replace(/<w:spacing /, '<w:spacing w:before="' + twips + '" ');
    }
    if (p.startsWith('<w:p><w:pPr>')) {
      return p.replace('<w:p><w:pPr>',
        '<w:p><w:pPr><w:spacing w:before="' + twips + '"/>');
    }
    return p.replace('<w:p>', '<w:p><w:pPr><w:spacing w:before="' + twips + '"/></w:pPr>');
  }

  function paragraph(content, opts = {}) {
    const ppr = [];
    if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
    // A HEADING SEPARATED FROM WHAT IT INTRODUCES IS A PARSING FAULT.
    //
    // Nothing here set keepNext, so a company name could sit at the foot
    // of one page with its date line and bullets starting the next. A
    // parser reading a role expects company, then title, then dates,
    // adjacent; split across a page boundary they stop being one record.
    //
    // It also produced visible damage in a real parse. Both of these are
    // page boundaries, and both merged two unrelated lines into one:
    //
    //   "LedgerLens, Explainable Credit-Risk Scoring APIPython, XGBoost"
    //   "review. -Architected an autoscaling microservices backend"
    //
    // keepNext holds a heading, a company, a role line and a project
    // title with the line beneath it, so the break falls between records
    // rather than through the middle of one. keepLines stops a single
    // paragraph being split across pages.
    if (opts.keepNext) ppr.push('<w:keepNext/>');
    if (opts.keepLines) ppr.push('<w:keepLines/>');
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

  // ---- phone normaliser: ONE implementation, shared with the PDF ------
  // Exported as DocxGenerator.normalizePhone. The PDF formatters used to
  // carry their own copy with the same faults, so fixing the DOCX left
  // the PDF broken.
  function normalizePhoneToken(seg) {
    const raw = String(seg || '');
    const cleaned = raw.replace(/[^\d+]/g, '');
    if (!/\d{7,}/.test(cleaned)) return seg; // not a phone

    // MEASURED AGAINST BOTH PARSERS, NOT ONE.
    //
    // An earlier version of this emitted "+353: 0874261508". The colon
    // was chosen because OpenResume's rule,
    // /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/, then extracts a clean
    // "0874261508" instead of running through the country code. That was
    // right about OpenResume and wrong about everything else:
    // libphonenumber, which is what Workday and Greenhouse validate
    // phone fields with, REJECTS that string under IE, DE, GB, US and
    // with no region set. Optimising for the parser I could read the
    // source of, and never testing the validator the real portals use.
    //
    //   "+353: 0874261508"     OpenResume "0874261508"   libphonenumber FAILS
    //   "+353 0874261508"      OpenResume "353 0874261"  a WRONG number
    //   "+353 087 426 1508"    OpenResume "087 426 1508" libphonenumber valid
    //
    // Three things are each load-bearing. The TRUNK ZERO makes the
    // national number ten digits, which a 3-3-4 rule needs. The SPACE
    // after the country code keeps it readable and dialable. And the
    // GROUPING inside the national part is what stops the match spanning
    // the country code: without those spaces the regex takes
    // "353 0874261" and a recruiter calls a number that is not yours.
    const D = { 353: 9, 44: 10, 33: 9, 61: 9, 91: 10 };

    const m = raw.match(/^\s*\+(\d{1,3})\D+(.+)$/);
    if (m) {
      const cc = m[1];
      let national = m[2].replace(/\D/g, '');
      if (national.length >= 7) {
        if (national.charAt(0) !== '0' && D[cc] === national.length) national = '0' + national;
        // 3-3-rest, so the first two groups can never merge with the
        // country code in front of them.
        const grouped = national.length > 6
          ? national.slice(0, 3) + ' ' + national.slice(3, 6) + ' ' + national.slice(6)
          : national;
        return '+' + cc + ' ' + grouped;
      }
    }
    // Already national and contiguous: leave it exactly as it is.
    if (/^\d{7,}$/.test(cleaned)) return cleaned;
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
        // Same reason as the phone: a label identifies the field without
        // the parser having to recognise the value. Email already parses
        // everywhere on its @ shape, so this costs nothing and helps the
        // parsers that key on the label.
        if (isEmail) pieces.push(run('Email: ', { color: C.MUTED, sz: opts.sz || 19 }));
        pieces.push(`<w:hyperlink r:id="${id}">${run(display, { color: C.LINK, sz: opts.sz || 19, underline: true })}</w:hyperlink>`);
      } else if (looksLikePhone(seg)) {
        // A PLAIN-TEXT "Phone:" LABEL IN FRONT OF THE NUMBER.
        //
        // The contact line was a bare pipe-separated list:
        //
        //   Surrey, CA | +353 874 261 508 | maxokafordev@gmail.com
        //
        // and the OpenResume parser returned Phone: EMPTY. Its rule is a
        // regex for a US 3-3-4 number, which an Irish +353 number cannot
        // satisfy however it is grouped. A label is what lets a parser
        // identify the field without recognising the number format, and
        // it is the one item on the standard ATS checklist this line did
        // not meet. Every parser that reads labels now gets the field for
        // free; the regex-only ones are no worse off than before.
        // No "Phone:" prefix. The number already carries "+353:", and
        // "Phone: +353: 0874261508" reads badly to the human who sees it
        // first. The colon in the number is the part that does the work.
        pieces.push(run(normalizePhoneToken(seg), { color: C.BODY, sz: opts.sz || 19 }));
      } else {
        pieces.push(run(seg, { color: C.BODY, sz: opts.sz || 19 }));
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
      // SHOW THE SHORT FORM, LINK THE FULL ONE.
      //
      // The scheme and a trailing slash are nine characters that carry no
      // information a reader or a parser needs. Across a project's two
      // links that is eighteen, which is the difference between the links
      // fitting on one line and wrapping onto two -- and with three
      // projects, three lines of a one-page CV spent on "https://".
      //
      // The href keeps the full URL so the link still works, and the
      // visible text still matches the shape a parser looks for
      // (\S+\.[a-z]+/\S+), so it is still extracted as a URL. Nothing is
      // hidden: every character removed is one the reader could not use.
      const shown = target.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      out += `<w:hyperlink r:id="${id}">${run(shown, Object.assign({}, runOpts, { color: C.LINK, underline: true }))}</w:hyperlink>`;
      if (target.length < raw.length) out += run(raw.slice(target.length), runOpts);
      // (raw/target lengths, not `shown` -- the trailing ")." belongs to
      // the source text and is unaffected by how the link is displayed.)
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

  // ===================================================================
  // BLOCK SPACING, IN TWIPS (20 to the point)
  // -------------------------------------------------------------------
  // Separation between blocks lives here rather than in blank lines. A
  // blank line costs a full line height, about 14pt, and cannot be tuned;
  // these are a few points each and are what the density profiles scale.
  //
  // Chosen against the gaps measured on a real parse, where a body line
  // is about 13pt and every section gap was coming out at 36:
  //
  //   last bullet -> next role title   bullet(30) + role(120)      = 7.5pt
  //   last bullet -> section heading   bullet(30) + section(200)   = 11.5pt
  //   heading -> first entry           afterHeading(60) + 40       = 5pt
  //
  // The heading case needs its own value: a company line directly under a
  // heading would otherwise add the heading's trailing space to a full
  // role gap and reopen the hole this closed.
  const SPACE = {
    section: 200,             // 10pt above a section heading
    afterHeading: 60,         // 3pt below it, before its first entry
    firstAfterHeading: 40,    // 2pt -- the heading already spaced this
    role: 120,                // 6pt between one role and the next
    bullet: 30,               // 1.5pt after a bullet
    // WHAT SEPARATES ONE ENTRY FROM THE NEXT, OUTSIDE EXPERIENCE.
    //
    // A blank line in the CV text used to emit nothing at all, so the gap
    // between two education entries was the same as the gap between the
    // two lines INSIDE one. Measured off a real parse: 14 units within an
    // entry, 17 between them for education, and 13-14 both ways for
    // projects -- no difference whatsoever.
    //
    // OpenResume splits subsections on round(prevY - y) exceeding a
    // threshold, so with no gap to find it read all four education lines
    // as ONE entry (one school, one degree, the rest dumped into
    // descriptions) and all three projects as one project. Two degrees
    // became one; three projects became one.
    //
    // 11pt on top of the line advance roughly doubles the gap, which puts
    // it unambiguously above the threshold without looking airy.
    entry: 220,
  };


  // ===================================================================
  // THE TYPE SCALE, AND WHY BODY COPY IS THE SMALLEST THING ON IT
  // -------------------------------------------------------------------
  // Sizes are half-points, as OOXML counts them. Everything used to sit
  // at 21 -- company, job title, bullets and body all the same size --
  // with only weight and colour separating them. Two costs to that.
  //
  // A parser that weights relative font size to decide what is a header
  // gets a flat signal and has to fall back on guessing. And a recruiter
  // scanning the page has nothing to land on: the employer, which is the
  // single most-scanned item on a CV, is exactly as loud as the fourth
  // bullet of the oldest role.
  //
  // The scale now descends: heading and company, then title, then body,
  // then dates. Body copy being the smallest is the point, not a
  // compromise -- it is the most of the page and the least of the scan.
  // The first version of this scale fixed the flatness by lowering the
  // BODY to 10pt. That worked on the hierarchy and cost readability,
  // which is the wrong trade: bullets are what a recruiter actually
  // reads, and they are the text most likely to be printed, forwarded as
  // a scan, or read on a phone.
  //
  // The hierarchy is a set of DIFFERENCES, so it can be built by raising
  // the structure instead of shrinking the prose. Body is back at 10.5pt
  // and every structural line moved up half a point around it. Same
  // descending order, nothing harder to read than before, and the
  // one-page fitter absorbs the extra height by choosing a tighter
  // spacing profile when it needs to.
  const SZ_BASE = {
    name: 52,       // 26pt -- the name is the largest thing on the page
    headline: 26,   // 13pt -- the role line under the name: clearly above
                    //         the contact line, clearly below the name
    heading: 23,    // 11.5pt
    company: 23,    // 11.5pt
    title: 22,      // 11pt
    body: 21,       // 10.5pt -- restored; this is the text that gets read
    date: 20,       // 10pt
  };

  // ===================================================================
  // ONE PAGE
  // -------------------------------------------------------------------
  // A recruiter working a stack of applications decides whether to read
  // a CV before they decide what it says, and a second page is where a
  // lot of that decision gets made. The LaTeX CV's whole argument is
  // that everything worth saying fits on one page.
  //
  // Nothing here deletes content to get there. Bullet selection already
  // happens upstream, in the audit, where relevance to the posting is
  // known; by the time text reaches this generator, every line in it has
  // earned its place and dropping one would be the generator overruling
  // a decision made with more information.
  //
  // What is left is typography. Four profiles, loosest first, and the
  // first one that fits on a page wins. If none of them fits, the
  // tightest is used and the CV runs to two pages -- which is the
  // honest outcome for a CV with more on it than a page holds, and far
  // better than a page of unreadable 7pt or a silently truncated role.
  const DENSITY = [
    { name: 'comfortable', sz: 0, space: 1.00 },
    { name: 'tight', sz: 0, space: 0.70 },
    { name: 'compact', sz: -1, space: 0.55 },
    { name: 'dense', sz: -2, space: 0.45 },
  ];
  // 9pt body is the floor. Below that a document stops reading as a
  // professional CV and starts reading as someone hiding how much they
  // wrote, which costs more than the second page would have.
  const SZ_FLOOR = 18;

  // Word's own metrics, close enough to choose a profile by.
  //
  // Calibri's average advance over mixed-case English is about 0.47 em,
  // and single line spacing is about 1.22 em. Both are approximations,
  // so the fit test below leaves a margin rather than filling the page
  // to the last twip.
  const EM_TWIPS = 10;             // 1 half-point = 10 twips
  const CHAR_EM = 0.47;
  const LINE_EM = 1.22;

  // Measured from the XML that was actually emitted rather than from a
  // parallel model of it. A separate estimator drifts from the renderer
  // the first time either changes; reading back the emitted paragraphs
  // cannot.
  function estimateHeightTwips(bodyXml, contentWidthTwips) {
    const paras = String(bodyXml || '').match(/<w:p>[\s\S]*?<\/w:p>/g) || [];
    let total = 0;
    for (const p of paras) {
      const attr = (re) => { const m = re.exec(p); return m ? parseInt(m[1], 10) : 0; };
      const before = attr(/w:before="(\d+)"/);
      const after = attr(/w:after="(\d+)"/);
      const indent = attr(/<w:ind w:left="(\d+)"/);
      const width = Math.max(1440, contentWidthTwips - indent);

      // A tab stop puts its runs side by side, so the paragraph is one
      // line regardless of the combined length.
      const tabbed = /<w:tab\/>/.test(p);

      // The size that governs the line is the one MOST OF THE TEXT is
      // set in, not the largest present. A bullet paragraph opens with a
      // navy marker one step above the body, and taking the maximum
      // measured every bullet as though the whole sentence were set at
      // heading size -- narrower lines, taller rows, and a CV pushed to a
      // tighter profile than it needed.
      let chars = 0, govSz = 0, govChars = -1;
      const runRe = /<w:r>([\s\S]*?)<\/w:r>/g;
      let m;
      while ((m = runRe.exec(p)) !== null) {
        const r = m[1];
        const szm = /<w:sz w:val="(\d+)"\/>/.exec(r);
        const sz = szm ? parseInt(szm[1], 10) : SZ_BASE.body;
        const tm = /<w:t[^>]*>([\s\S]*?)<\/w:t>/.exec(r);
        const n = tm ? tm[1].length : 0;
        chars += n;
        if (n > govChars) { govChars = n; govSz = sz; }
      }
      const maxSz = govSz || SZ_BASE.body;

      const charW = maxSz * EM_TWIPS * CHAR_EM;
      const perLine = Math.max(10, Math.floor(width / charW));
      const wrapped = tabbed ? 1 : Math.max(1, Math.ceil(chars / perLine));

      let lineH = maxSz * EM_TWIPS * LINE_EM;
      const lm = /w:line="(\d+)" w:lineRule="auto"/.exec(p);
      if (lm) lineH = lineH * (parseInt(lm[1], 10) / 240);

      // An empty paragraph still occupies a line, and the rule under a
      // heading is drawn in the same band, so nothing is free.
      total += wrapped * lineH + before + after;
    }
    return Math.round(total);
  }

  // A density is a pure transform on the emitted XML, so it needs no
  // cooperation from the ~20 places that build a paragraph and cannot
  // fall out of step with them.
  //
  // Both regexes are deliberately narrow. <w:sz w:val=".."/> is the run
  // property; the w:sz on <w:bottom> is a BORDER WIDTH and must not be
  // scaled. w:before/w:after are paragraph spacing; the <w:spacing
  // w:val=".."/> inside a run is LETTER spacing, which is what made
  // every section heading unparseable in the first place and must never
  // be touched here.
  function applyDensity(bodyXml, d) {
    let out = String(bodyXml || '');
    if (d.sz) {
      out = out.replace(/<w:sz w:val="(\d+)"\/><w:szCs w:val="(\d+)"\/>/g, (m0, a) => {
        const v = Math.max(SZ_FLOOR, parseInt(a, 10) + d.sz);
        return `<w:sz w:val="${v}"/><w:szCs w:val="${v}"/>`;
      });
    }
    if (d.space !== 1) {
      out = out.replace(/w:(before|after)="(\d+)"/g,
        (m0, which, v) => `w:${which}="${Math.round(parseInt(v, 10) * d.space)}"`);
    }
    return out;
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
  //
  // ---- ONE SKILLS SECTION, NOT TWO ------------------------------------
  //
  // CORE COMPETENCIES and TECHNICAL SKILLS shared a rank each, printed as
  // two headings, and a live parse of a real generated CV showed what that
  // costs: the competencies came back EMPTY. A parser looks for its skills
  // section by keyword -- OpenResume's is literally `["skill"]` -- and
  // "CORE COMPETENCIES" contains no such word, so eight tailored,
  // job-matched keyword phrases sitting in the six-second scan zone were
  // never indexed as skills at all.
  //
  // Renaming the heading alone would have made it worse. That same lookup
  // returns the FIRST section whose name matches and stops, so a CV with
  // "CORE SKILLS" up top and "TECHNICAL SKILLS" lower down loses the
  // second one instead -- the same bug, pointed the other way.
  //
  // One section is the only shape with no losing case: every term is
  // indexed, the heading is the conventional one, and it stays where the
  // competencies were, directly under the summary, which is where a
  // recruiter scanning for six seconds looks. Giving both headings the
  // same rank is all it takes -- the merge, the ordering and the
  // case-insensitive de-duplication are what this function already does
  // for a repeated heading.
  //
  // ---- and where the merged section sits ------------------------------
  // It sat directly under the summary, on the six-second-scan argument.
  // That argument holds for a keyword block a recruiter is hunting; it
  // does not hold for this candidate's CV, where the block runs to six
  // labelled groups and is the first thing a human reads. A screen of
  // technology names before a single employer is how a business-analyst
  // application gets read as an engineer's and skipped.
  //
  // Experience first, then the skills that back it up, then projects.
  // The order answers the questions in the order they get asked: who
  // has employed you, what do you work with, what else have you built.
  // It also decides what survives a spill to page two -- projects are
  // the least load-bearing section here, so they are the ones that go
  // over the fold rather than the skills.
  //
  // No ATS reads order as meaning; every parser here keys off the
  // heading. This is a human-reading change only, which is why it is
  // safe to make at the renderer.
  const SECTION_RANK = [
    [/^(PROFESSIONAL SUMMARY|SUMMARY|PROFILE)$/, 1],
    [/^(WORK EXPERIENCE|EXPERIENCE|EMPLOYMENT|PROFESSIONAL EXPERIENCE)$/, 3],
    [/^(CORE COMPETENCIES|AREAS OF EXPERTISE|TECHNICAL PROFICIENCIES|TECHNICAL SKILLS|SKILLS)$/, 4],
    [/^(SELECTED PROJECTS|PROJECTS)$/, 5],
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
    3: 'PROFESSIONAL EXPERIENCE',
    4: 'TECHNICAL SKILLS',
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
  // A LABEL INSIDE A SECTION IS NOT A HEADING FOR THAT SAME SECTION.
  //
  // The skills section is written as labelled groups now:
  //
  //   TECHNICAL SKILLS
  //   Core Competencies: Technical Problem-Solving, Team Collaboration
  //   Languages & Frameworks: Python, Java, SQL, React
  //
  // "Core Competencies" is also a section name, so this split it back
  // out into a heading, which then merged into the skills section it was
  // already inside -- silently deleting the label and undoing the
  // grouping. Tracking which section is open costs one variable and
  // tells the two cases apart: a heading that opens a DIFFERENT section
  // still splits, a label for the section already open does not.
  function splitInlineHeadings(lines) {
    const out = [];
    let split = 0;
    let openRank = 0;
    for (const line of lines) {
      const bare = line.trim().toUpperCase();
      if (SECTION_HEADERS.includes(bare)) { openRank = rankOf(bare); out.push(line); continue; }
      const m = line.match(/^\s*([A-Za-z][A-Za-z &/]{2,40}?)\s*:\s*(\S.*)$/);
      if (m && SECTION_HEADERS.includes(m[1].trim().toUpperCase())
          && rankOf(m[1].trim().toUpperCase()) !== openRank) {
        out.push(m[1].trim().toUpperCase());
        out.push(m[2].trim());
        openRank = rankOf(m[1].trim().toUpperCase());
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
    //
    // A real generated CV listed nine Core Competencies, six of which
    // appeared again verbatim in Technical Skills sixty lines later:
    // Data Profiling, Data Modelling, Databricks, SQL, Power BI, Data
    // Warehousing. Two thirds of the scan zone was padding, and a
    // recruiter reading the same six terms twice draws the obvious
    // conclusion. That used to be trimmed here, block against block.
    // Now the two blocks ARE one block by the time this runs, and
    // mergeCommaLists drops the repeat while it merges them -- keeping
    // the properly-cased spelling, which the trimmer could not do.
    if (!mergedAny && !inline.split && !renamed && sorted.every((b, i) => b === blocks[i])) return cvText;

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
    const SZ = SZ_BASE;
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

    // Entry-gap bookkeeping; see SPACE.entry.
    let pendingEntryGap = false;
    let entryGapMark = 0;

    let firstNonEmpty = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { firstNonEmpty = i; break; }
    }

    if (firstNonEmpty >= 0) {
      // THE HEADER IS A THREE-STEP HIERARCHY, CENTRED.
      //
      //   name      26pt navy bold, letterspaced -- the largest thing
      //             on the page, seen before anything is read
      //   headline  13pt bold black -- the role, bigger than the
      //             contact line because it is a claim, not a detail
      //   contact   10pt muted -- reference data, present but quiet
      //
      // Every part of this is a run or paragraph property (size, bold,
      // colour, alignment, letterspacing) that the text stream never
      // carries, so an extractor reads this header character-for-
      // character as it read the plain one. The body stays left-aligned
      // -- a centred header over a left body is the convention; a
      // centred body would be unreadable.
      out.push(paragraph(
        run(normalizeNameForParsing(lines[firstNonEmpty].trim()), { bold: true, color: C.NAVY, sz: SZ.name, spacing: 8 }),
        { align: 'center', spacingAfter: 60 }
      ));

      // Headline + contact lines until first section header. A header
      // line that carries no contact material (no pipes, no @, no URL,
      // no phone-length digit run) is the HEADLINE -- the role under
      // the name -- and takes the middle step of the hierarchy. The
      // detection is by content, not position, so a profile that puts
      // the contact line first still gets its role line emphasised.
      let i = firstNonEmpty + 1;
      let headerLineCount = 0;
      const looksLikeContact = (s) => /[|@]|https?:\/\/|www\.|\d[\d\s().-]{6,}/.test(s);
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        const upper = t.toUpperCase().replace(/:$/, '');
        if (SECTION_HEADERS.includes(upper)) break;
        if (!looksLikeContact(t)) {
          out.push(paragraph(
            run(t, { bold: true, color: C.BODY, sz: SZ.headline, spacing: 2 }),
            { align: 'center', spacingAfter: 50 }
          ));
        } else {
          out.push(contactParagraph(t, rels, { align: 'center', sz: SZ.date, spacingAfter: 40 }));
        }
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
      // Education entries get the same institution-and-date-on-one-line
      // shape the experience block uses. A live Workday parse returned
      // date: "" for both entries, and Workday's education block has
      // required From/To year fields, so those were being hand-typed on
      // every application. The right tab stop is the layout the parse
      // report confirmed works: title and date stay two separate text
      // items and land in two separate fields.
      const PROJECT_SECTIONS = new Set(['PROJECTS', 'SELECTED PROJECTS']);

      // ONE SHAPE FOR THE WHOLE PROJECTS SECTION, DECIDED BEFORE ANY OF
      // IT IS RENDERED.
      //
      // Whether a title and its tech stack can share a line depends on
      // their combined length, so deciding per project produced a
      // section where two entries were one line and the third was two.
      // A parser that segments by entry shape reads the odd one as part
      // of the entry above it. So the whole section takes the tabbed
      // form only if EVERY pair in it fits.
      // WHAT A TECH-STACK LINE IS, AND WHETHER IT FITS, ARE TWO
      // QUESTIONS AND THEY MUST NOT BE ASKED WITH THE SAME NUMBER.
      //
      // They were: a stack was "a comma list of at most 60 characters",
      // and a pair was tabbed when title + stack came to 96 or less. A
      // 61-character stack therefore failed to be a stack at all, fell
      // through to the ordinary body branch, and printed on its own line
      // while its 58-character siblings sat tab-joined to their titles.
      // That is how the live CV came out. Identification is by shape;
      // 80 is only there to stop a paragraph being mistaken for a stack.
      const isStackLine = (s) => !!s && s.indexOf(',') !== -1
        && !/^([-•*]|\d+\.)\s+/.test(s) && !/https?:\/\//.test(s)
        && !/[.!?]$/.test(s) && s.length <= 80;
      const pairFits = (title, stack) => (title.length + stack.length) <= 96;

      const projectsTabbed = (() => {
        let inProjects = false, pairs = 0;
        for (let k = 0; k < lines.length; k++) {
          const cur = lines[k].trim();
          const upper = cur.toUpperCase();
          if (SECTION_HEADERS.includes(upper)) { inProjects = PROJECT_SECTIONS.has(upper); continue; }
          if (!inProjects || !cur) continue;
          if (/^([-•*]|\d+\.)\s+/.test(cur) || /https?:\/\//.test(cur)) continue;
          const nxt = (lines[k + 1] || '').trim();
          if (!isStackLine(nxt)) continue;
          pairs++;
          if (!pairFits(cur, nxt)) return false;   // one cannot, so none do
          k++;                                     // skip the stack line
        }
        return pairs > 0;
      })();
      const EDU_SECTIONS = new Set([
        'EDUCATION', 'ACADEMIC BACKGROUND', 'ACADEMIC QUALIFICATIONS',
        'EDUCATIONAL QUALIFICATIONS', 'ACADEMIC HISTORY', 'QUALIFICATIONS',
      ]);
      // A degree usually carries a single graduation year rather than a
      // range, which isDateLine deliberately does not match -- a bare
      // four-digit line is too easy to hit by accident elsewhere. Inside
      // the education section there is nothing else it could be.
      const isEduDateLine = (t) => isDateLine(t) || /^(?:19|20)\d{2}$/.test(t);
      // Degree keywords are the same ones OpenResume itself matches on,
      // so a line this recognises is a line the parser will treat as the
      // start of an education entry.
      const _DEGREE_RE = /\b(?:bachelor|master|magister|doctor|doctorate|ph\.?d|m\.?b\.?a|associate|diploma|certificate|b\.?sc|m\.?sc|b\.?a\b|m\.?a\b|b\.?eng|m\.?eng|llb|llm|hnd|foundation degree)\b/i;
      // The grade at the end of a degree line ("MSc in AI, Distinction")
      // moves to the right edge, bold, on the same tab stop every other
      // right-aligned field uses. Reading order in the text stream is
      // unchanged -- "MSc in AI<tab>Distinction" extracts in the same
      // order the comma version did -- so a parser sees the same entry
      // while a human sees the grade without hunting for it.
      const _HONOURS_RE = /^(.*?\S)[,;]\s*((?:First[- ]Class(?: Honou?rs)?|Upper Second(?: Class)?(?: Honou?rs)?|Second[- ]Class(?: Honou?rs)?|2:1|2:2|Distinction|Merit|Pass|Magna Cum Laude|Summa Cum Laude|Cum Laude|GPA\s*[\d.]+(?:\s*\/\s*[\d.]+)?)\.?)$/i;
      let sawDegree = false;
      // True for the first content line after a section heading, so the
      // heading's trailing space is not added to a full role gap.
      let afterHeading = false;
      // A helper to emit a single bullet item paragraph.
      //
      // The glyph is grey, not the accent. It was NAVY, which was
      // invisible while NAVY was near-black and would have become
      // thirty-odd blue dots the moment the accent became a real
      // colour. A marker on every line is the dilution the accent
      // exists to avoid; grey reads as typography rather than emphasis.
      const emitBullet = (item) => out.push(paragraph(
        run('•  ', { color: C.MUTED, sz: SZ.heading }) + run(item, { color: C.BODY, sz: SZ.body }),
        { indent: 360, hanging: 240, spacingAfter: SPACE.bullet, line: 288, lineRule: 'auto' }
      ));
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        // A BLANK LINE IS A SIGNAL, NOT A PARAGRAPH.
        //
        // This used to emit an empty paragraph for every blank line in
        // the CV text. An empty paragraph is not free: it occupies a full
        // line height plus its own spacing, about 14pt, and the text has
        // one before every role and every section.
        //
        // Measured on a real parse, the gap from the PROFESSIONAL
        // EXPERIENCE heading to "Meta" was 36 units where a line of body
        // text is 13. Same between every role, and between the last
        // bullet and PROJECTS. Fifteen of those is roughly three inches
        // of nothing, which is most of a page.
        //
        // Separation between blocks belongs to the blocks themselves, as
        // spacingBefore/spacingAfter, where it is a few points instead of
        // a whole line and cannot accumulate. The blank line still does
        // its real job here: telling the role state machine that the next
        // non-empty line starts a new employer.
        if (!t) {
          if (inExperience) roleState = 'expectCompany';
          // A blank line separates one entry from the next. Experience
          // has its own spacing on the company line; everywhere else the
          // gap has to be added here or there is none at all.
          else if (currentSection) { pendingEntryGap = true; entryGapMark = out.length; }
          continue;
        }

        // The blank line above produced no paragraph of its own, so the
        // gap lands on whatever was emitted first after it -- known only
        // now, one iteration later.
        if (pendingEntryGap && out.length > entryGapMark) {
          out[entryGapMark] = withSpacingBefore(out[entryGapMark], SPACE.entry);
          pendingEntryGap = false;
        }

        const upper = t.toUpperCase().replace(/:$/, '');

        if (SECTION_HEADERS.includes(upper)) {
          // SECTION HEADER -- navy, bold, caps, light-grey rule under.
          //
          // NO LETTER SPACING. This carried spacing: 24, a little over a
          // point of tracking, which looks smart on the page and destroys
          // the document for every ATS that reads it.
          //
          // Letter spacing is applied by the renderer between glyphs, so
          // the PDF text layer stops being one word. Run through the
          // OpenResume parser, this CV's headings came out as
          //
          //     P R O F ES S I O NA L EXP ER I ENCE
          //     T ECH NI CA L S K I LLS
          //     ED U CAT I O N
          //
          // Every ATS locates a section by keyword-matching its heading,
          // and none of those match. So no section was found: all 90
          // lines were grouped under PROFILE, and Work Experience,
          // Education and Skills each came back EMPTY. Workday's
          // autofillWithResume did the same thing on the same file.
          //
          // That is the whole document lost, not a keyword. It outranks
          // every scoring question, because a parser that finds no
          // employment history has nothing to score. The name kept its
          // spacing: 4, which is a fifth of this and parsed correctly.
          out.push(paragraph(
            run(upper, { bold: true, caps: true, color: C.NAVY, sz: SZ.heading }),
            { spacingBefore: SPACE.section, spacingAfter: SPACE.afterHeading, keepNext: true, keepLines: true,
              bottomBorder: { color: C.RULE, sz: 4 } }
          ));
          inExperience = EXPERIENCE_HEADERS.includes(upper);
          sawDegree = false;   // the gap rule is per education section
          afterHeading = true;
          roleState = inExperience ? 'expectCompany' : 'none';
          currentSection = upper;
          continue;
        }

        // Consumed by whichever branch below emits this line, then
        // cleared: only the FIRST content line after a heading gets the
        // reduced gap.
        const isFirstAfterHeading = afterHeading;
        afterHeading = false;

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
            out.push(paragraph(run(prettyDateRange(t), { italic: true, color: C.MUTED, sz: SZ.date }), { spacingAfter: 40 }));
            continue;
          }
          if (roleState === 'expectCompany') {
            // THE ROLE HEADER IS A TWO-LINE GRID, PAIRED THE WAY THE
            // REFERENCE TEMPLATE PAIRS IT:
            //
            //   Meta                       January 2023 - Present
            //   Software Engineer                 Dublin, Ireland
            //
            // Company bold with the DATES flush right; title italic
            // with the LOCATION flush right. Adopted on request from
            // the user's reference CV -- and it is also the pairing
            // most parsers were built against. Parsing does not move:
            // all four fields stay adjacent inside the same block, the
            // tab keeps each pair as two separate text items, and the
            // extraction order (company, dates, title, location) binds
            // to one role exactly as before.
            //
            // The location arrives tab-separated on the company line
            // from the audit rather than being guessed at here. A
            // heuristic that decides "is this line a location?" would
            // eventually mistake a company for one and file an
            // employer under Location, and a wrong employer is worse
            // than a missing city.
            const tabAt = t.indexOf('\t');
            const co = (tabAt > 0 ? t.slice(0, tabAt) : t).trim();
            const loc = tabAt > 0 ? t.slice(tabAt + 1).trim() : '';
            // Lookahead through blanks: the title line, then its date.
            let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
            let k = j + 1; while (k < lines.length && !lines[k].trim()) k++;
            const title = j < lines.length ? lines[j].trim() : '';
            const dateLn = k < lines.length ? lines[k].trim() : '';
            const gridReady = !!co && !!title && !isDateLine(title)
              && !/^([\-*•]|\d+\.)\s+/.test(title) && title.indexOf('\t') === -1
              && isDateLine(dateLn);
            if (gridReady) {
              // Trailing spaces before both tabs: a parser that drops
              // <w:tab/> must not read "MetaJanuary 2023".
              out.push(paragraph(
                run(co + ' ', { bold: true, color: C.BODY, sz: SZ.company })
                  + '<w:r><w:tab/></w:r>'
                  + run(prettyDateRange(dateLn), { bold: true, color: C.BODY, sz: SZ.date }),
                { tabs: [{ pos: 10106, val: 'right' }],
                  spacingBefore: isFirstAfterHeading ? SPACE.firstAfterHeading : SPACE.role,
                  spacingAfter: 20, keepNext: true, keepLines: true }
              ));
              out.push(paragraph(
                run(title + (loc ? ' ' : ''), { italic: true, color: C.BODY, sz: SZ.title })
                  + (loc
                    ? '<w:r><w:tab/></w:r>' + run(loc, { italic: true, color: C.MUTED, sz: SZ.date })
                    : ''),
                { tabs: loc ? [{ pos: 10106, val: 'right' }] : undefined,
                  spacingAfter: 30, keepNext: true, keepLines: true }
              ));
              i = k;                     // title and date lines consumed
              roleState = 'inRole';
              continue;
            }
            // No title/date pair behind the company: fall back to the
            // company line as it arrives, location kept beside it so
            // the field is not dropped.
            if (co && loc) {
              out.push(paragraph(
                run(co + ' ', { bold: true, color: C.BODY, sz: SZ.company })
                  + '<w:r><w:tab/></w:r>'
                  + run(loc, { italic: true, color: C.MUTED, sz: SZ.date }),
                { tabs: [{ pos: 10106, val: 'right' }],
                  spacingBefore: isFirstAfterHeading ? SPACE.firstAfterHeading : SPACE.role,
                  spacingAfter: 20, keepNext: true, keepLines: true }
              ));
              roleState = 'expectTitle';
              continue;
            }
            out.push(paragraph(run(t, { bold: true, color: C.BODY, sz: SZ.company }),
              { spacingBefore: isFirstAfterHeading ? SPACE.firstAfterHeading : SPACE.role,
                spacingAfter: 20, keepNext: true, keepLines: true }));
            roleState = 'expectTitle';
            continue;
          }
          if (roleState === 'expectTitle') {
            // Fallback only: the grid above already consumed the usual
            // company/title/date run. This fires when the company line
            // had no parsable date two lines down -- keep the title
            // with its date joined if one follows, so the date still
            // binds to the role rather than floating alone.
            //
            // The trailing space before the tab is the same guard the
            // competencies grid needs: parsers that drop <w:tab/> would
            // otherwise glue "Software EngineerJan 2023".
            const next = (lines[i + 1] || '').trim();
            if (isDateLine(next)) {
              out.push(paragraph(
                run(t + ' ', { italic: true, color: C.BODY, sz: SZ.title })
                  + '<w:r><w:tab/></w:r>'
                  + run(prettyDateRange(next), { italic: true, color: C.MUTED, sz: SZ.date }),
                { tabs: [{ pos: 10106, val: 'right' }], spacingAfter: 30 }
              ));
              i++;                       // the date line is consumed
              roleState = 'inRole';
              continue;
            }
            out.push(paragraph(run(t, { italic: true, color: C.BODY, sz: SZ.title }), { spacingAfter: 20 }));
            roleState = 'inRole';
            continue;
          }
          // Anything else inside a role -> body
          out.push(paragraph(run(t, { color: C.BODY, sz: SZ.body }), { spacingAfter: 40 }));
          continue;
        }

        // EDUCATION: the entry line and its date share a line, right
        // aligned, exactly as a role and its dates do. A date on its own
        // line parses as a stray text item and binds to nothing.
        if (EDU_SECTIONS.has(currentSection)) {
          // A SECOND DEGREE NEEDS A VISIBLE GAP ABOVE IT.
          //
          // A live OpenResume parse returned ONE education entry for a CV
          // that lists two. Both degrees and both universities came back
          // as a single school + degree, with the other three lines
          // dumped into "descriptions".
          //
          // The cause is geometry, not wording. The four lines sat at
          // y=734, 720, 707, 693 -- gaps of 14, 13, 14. OpenResume splits
          // a section into subsections on a vertical gap noticeably
          // larger than the line pitch, and there wasn't one, so it saw
          // one block. Every degree after the first was invisible.
          //
          // A degree line that is not the first in the section gets real
          // space above it. This is the same signal a human reads as "new
          // entry", which is why the parser looks for it.
          // The degree line is bold, the way the company line is: it is
          // the field the reader scans for. The institution stays plain
          // beneath it -- bolding both would emphasise neither.
          const isDeg = _DEGREE_RE.test(t);
          const hon = isDeg ? t.match(_HONOURS_RE) : null;
          const degreeRuns = () => hon
            // Trailing space before the tab, same guard as the role
            // line: a parser that drops <w:tab/> would otherwise glue
            // "MachineLearningDistinction".
            ? run(hon[1].replace(/[,;\s]+$/, '') + ' ', { bold: true, color: C.BODY, sz: SZ.body })
              + '<w:r><w:tab/></w:r>'
              + run(hon[2], { bold: true, color: C.BODY, sz: SZ.body })
            : run(t, { bold: true, color: C.BODY, sz: SZ.body });
          if (isDeg && sawDegree) {
            out.push(paragraph(degreeRuns(),
              { spacingBefore: 200, spacingAfter: 20, keepNext: true, keepLines: true,
                tabs: hon ? [{ pos: 10106, val: 'right' }] : undefined }));
            continue;
          }
          if (isDeg) sawDegree = true;
          if (isEduDateLine(t)) {
            out.push(paragraph(run(prettyDateRange(t), { italic: true, color: C.MUTED, sz: SZ.date }),
              { spacingAfter: 40 }));
            continue;
          }
          const nextEdu = (lines[i + 1] || '').trim();
          if (nextEdu && isEduDateLine(nextEdu)) {
            // The date owns the right edge on this line, so a grade
            // stays inline in the text; the line is still bold when it
            // is a degree.
            // Trailing space before the tab, same guard the role line
            // needs: a parser that drops <w:tab/> would otherwise glue
            // "Imperial College London2021".
            out.push(paragraph(
              run(t + ' ', { bold: isDeg, color: C.BODY, sz: SZ.body })
                + '<w:r><w:tab/></w:r>'
                + run(prettyDateRange(nextEdu), { italic: true, color: C.MUTED, sz: SZ.date }),
              { tabs: [{ pos: 10106, val: 'right' }], spacingAfter: 40 }
            ));
            i++;                         // the date line is consumed
            continue;
          }
          if (isDeg) {
            out.push(paragraph(degreeRuns(),
              { spacingAfter: 20, keepNext: true, keepLines: true,
                tabs: hon ? [{ pos: 10106, val: 'right' }] : undefined }));
            continue;
          }
        }

        // LIST-SHAPED SECTIONS: a single line of 2+ comma-separated items
        // with no sentence punctuation, re-joined as one flowing line.
        // CERTIFICATIONS and AWARDS only -- the competencies are part of
        // the skills section now and take the ordinary body treatment,
        // which is what that section always used.
        if (LIST_SECTIONS.has(currentSection)) {
          const looksLikeList = /,/.test(t) && !/[.!?]\s/.test(t) && t.split(',').length >= 2;
          if (looksLikeList) {
            const items = t.split(/,\s*/)
              .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
              .filter((s) => s.length > 0);
            // ONE FLOWING LINE, NOT ONE ITEM PER LINE.
            //
            // These were a three-up TAB grid, which welded items together
            // on any parser that drops <w:tab/>, and were then changed to
            // one item per paragraph to fix that. It did fix it, and cost
            // a great deal: eight competencies became eight lines and
            // seven certifications seven more, each holding two or three
            // words on a line built for about a hundred characters.
            // Fifteen lines, over two inches, to say what fits in four.
            //
            // A comma is the delimiter this wanted all along. Unlike a
            // tab, no parser disagrees about what it means, and unlike
            // one-per-line it costs nothing: the paragraph wraps, so it
            // reflows on a phone instead of overflowing, and extracts as
            // "A, B, C" in reading order. It is what the skills section
            // has always done, and that section parses cleanly.
            const joined = items.join(', ');
            out.push(paragraph(run(joined, { color: C.BODY, sz: SZ.body }),
              { spacingAfter: SPACE.bullet, line: 276, lineRule: 'auto' }));
            continue;
          }
        }

        // A PROJECT TITLE AND ITS TECH STACK SHARE A LINE.
        //
        // A project cost seven rendered lines: title, tech stack, a
        // three-line description and a two-line link row. Three projects
        // was twenty-one lines, close to forty per cent of a page, for
        // three items.
        //
        // The stack goes right-aligned against its own title, on the same
        // right tab stop the role header and the education entry already
        // use -- the shape the parse report confirmed keeps two separate
        // text items landing in two separate fields. The title is still
        // the first item on the line, which is what a parser reads as the
        // project name, and the stack is still present in full, which is
        // where most of a project's keywords live.
        //
        // Only when they FIT. A long title plus a long stack would wrap,
        // and a wrapped right-aligned run lands back on top of the title,
        // which is worse than the line it saved.
        // AND EVERY PROJECT IN THE SECTION IS SHAPED THE SAME WAY.
        //
        // The decision above used to be taken per project, so a stack too
        // long to share its title's line put that one project on two
        // lines while its siblings stayed on one. A live CV shipped
        // exactly that: SignalDesk and LedgerLens tab-joined, DriftGuard
        // not. Feature-scoring parsers segment a section by the SHAPE of
        // its entries, so the odd one out is read as a continuation of
        // the entry above it and the project is lost. Uniform or not at
        // all -- see projectsTabbed.
        if (PROJECT_SECTIONS.has(currentSection)
            && !/^([-•*]|\d+\.)\s+/.test(t) && !/https?:\/\//.test(t)) {
          const nextT = (lines[i + 1] || '').trim();
          if (isStackLine(nextT) && projectsTabbed) {
            out.push(paragraph(
              run(t + ' ', { bold: true, color: C.BODY, sz: SZ.title })
                + '<w:r><w:tab/></w:r>'
                + run(nextT, { italic: true, color: C.MUTED, sz: SZ.date }),
              { tabs: [{ pos: 10106, val: 'right' }], spacingAfter: 30,
                keepNext: true, keepLines: true }
            ));
            i++;                        // the stack line is consumed
            continue;
          }
        }

        // Lines containing URLs (e.g. SELECTED PROJECTS "Live demo / Code"):
        // render each URL as a clickable hyperlink while keeping the full URL
        // visible as text, so it stays 100% ATS-parseable. Labels render as
        // plain body text.
        if (/https?:\/\//.test(t)) {
          out.push(paragraph(linkifyRuns(t, rels, { color: C.BODY, sz: SZ.body }),
            { spacingAfter: 40, line: 276, lineRule: 'auto' }));
          continue;
        }

        // Non-experience body. "Label: items" (skills) -> bold label.
        const labelMatch = t.match(/^([A-Z][A-Za-z &/]{1,28}):\s*(.+)$/);
        if (labelMatch) {
          // A RIGHT-TO-WORK CLAIM IS THE ONE ITEM A SCREENER HUNTS FOR.
          //
          // "EU Citizen" buried mid-line answers the knockout question
          // (visa? sponsorship?) before it is asked, but only if it is
          // seen. Bold it inside the plain items run. Bold is a run
          // property the text stream never carries, so extraction is
          // character-for-character unchanged.
          const RTW = /\b(?:EU|EEA|US|U\.S\.|UK|Irish|British)\s+Citizen(?:ship)?\b|\bGreen Card(?:\s+holder)?\b|\bStamp\s*4\b|\b[Rr]ight to [Ww]ork\b(?:\s+in\s+(?:the\s+)?[A-Z][A-Za-z ]{1,24})?/g;
          let items = '', last = 0, rtw;
          while ((rtw = RTW.exec(labelMatch[2])) !== null) {
            if (rtw.index > last) items += run(labelMatch[2].slice(last, rtw.index), { color: C.BODY, sz: SZ.body });
            items += run(rtw[0], { bold: true, color: C.BODY, sz: SZ.body });
            last = rtw.index + rtw[0].length;
          }
          if (last < labelMatch[2].length) items += run(labelMatch[2].slice(last), { color: C.BODY, sz: SZ.body });
          out.push(paragraph(
            run(labelMatch[1] + ': ', { bold: true, color: C.BODY, sz: SZ.body }) + items,
            { spacingAfter: 40 }
          ));
          continue;
        }
        out.push(paragraph(run(t, { color: C.BODY, sz: SZ.body }), { spacingAfter: 40, line: 276, lineRule: 'auto' }));
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

  // Does this CV text fit on a page, and at what density? Everything
  // fromCvText does up to the point of knowing, without building the ZIP.
  //
  // Exported because the audit needs the answer while it is still deciding
  // what the CV says. It used to carry its own line-count heuristic for
  // this and the two disagreed badly -- the audit cut a CV from 22 bullets
  // to 8 that the generator would have fitted at full size. Two estimators
  // for one question is one too many.
  function measureCv(cvText, opts = {}) {
    if (!cvText || typeof cvText !== 'string') {
      return { fitsOnePage: true, density: DENSITY[0].name, heightTwips: 0, pageHeightTwips: 0 };
    }
    const { bodyXml: baseXml } = buildBodyXml(cvText);
    const pg = pageTwipsFrom(opts);
    const usableH = Math.round((pg.h - 864 - 864) * 0.96);
    const usableW = pg.w - 900 - 900;
    let density = DENSITY[DENSITY.length - 1].name;
    let heightTwips = 0;
    for (let i = 0; i < DENSITY.length; i++) {
      heightTwips = estimateHeightTwips(applyDensity(baseXml, DENSITY[i]), usableW);
      density = DENSITY[i].name;
      if (heightTwips <= usableH) break;
    }
    return {
      fitsOnePage: heightTwips <= usableH,
      density, heightTwips, pageHeightTwips: usableH,
    };
  }

  function fromCvText(cvText, opts = {}) {
    try {
      if (!cvText || typeof cvText !== 'string') {
        return { success: false, error: 'empty CV text' };
      }
      const { bodyXml: baseXml, rels } = buildBodyXml(cvText);

      // FIT TO ONE PAGE, LOOSEST PROFILE FIRST.
      //
      // Content is not touched: the audit already chose which bullets
      // survive, knowing the posting, and this generator has no basis to
      // overrule that. Only spacing and the type scale move.
      //
      // The 4% margin covers the difference between these metrics and
      // Word's own. Filling the page to the last twip and then finding
      // Word disagrees by one line is the failure this exists to avoid,
      // and it costs a couple of points of density to rule out.
      const pg = pageTwipsFrom(opts);
      const usableH = Math.round((pg.h - 864 - 864) * 0.96);
      const usableW = pg.w - 900 - 900;

      let bodyXml = baseXml;
      let density = DENSITY[DENSITY.length - 1].name;
      let heightTwips = 0;
      for (let i = 0; i < DENSITY.length; i++) {
        const candidate = applyDensity(baseXml, DENSITY[i]);
        const h = estimateHeightTwips(candidate, usableW);
        bodyXml = candidate;
        density = DENSITY[i].name;
        heightTwips = h;
        if (h <= usableH) break;
      }

      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: ROOT_RELS_XML },
        { name: 'word/_rels/document.xml.rels', content: wordRelsXml(rels) },
        { name: 'word/document.xml', content: documentXml(bodyXml, pg) },
      ];
      const zipBytes = buildZip(files);
      const base64 = bytesToBase64(zipBytes);
      const baseName = (opts.name || 'Resume').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
      const filename = opts.filename || `${baseName}_CV.docx`;
      return {
        success: true, base64, filename, size: zipBytes.length,
        density, heightTwips, pageHeightTwips: usableH,
        fitsOnePage: heightTwips <= usableH,
      };
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
      const { bodyXml: baseXml, rels } = buildCoverLetterBodyXml(coverText);

      // A cover letter that runs to two pages does not get its second
      // page read, and unlike the CV there is nothing here worth losing
      // to prevent that -- every paragraph is argument. So only the
      // spacing moves, and only as far as it needs to.
      //
      // The type scale is deliberately left alone: shrinking the text of
      // a letter to buy a page is visible in a way that tightening the
      // gaps is not.
      const pg = pageTwipsFrom(opts);
      const usableH = Math.round((pg.h - 864 - 864) * 0.96);
      const usableW = pg.w - 900 - 900;
      let bodyXml = baseXml;
      for (const d of DENSITY) {
        bodyXml = applyDensity(baseXml, { sz: 0, space: d.space });
        if (estimateHeightTwips(bodyXml, usableW) <= usableH) break;
      }

      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: ROOT_RELS_XML },
        { name: 'word/_rels/document.xml.rels', content: wordRelsXml(rels) },
        { name: 'word/document.xml', content: documentXml(bodyXml, pg) },
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

  // normalizePhone is exported because the PDF formatters had their OWN
  // copy of this logic, with the same faults, and the DOCX got fixed
  // while the PDF stayed broken. One implementation, used by every path
  // that writes a contact line.
  // normalizeSections is exported for the same reason measureCv is: the
  // document the user READS in the panel and the document that gets
  // attached must be the same document. Section order, the canonical
  // headings and the single skills section were all decided here, inside
  // the renderer, so the preview showed the model's raw wording and
  // ordering while the file went out with something else. The audit calls
  // this as its last pass, so what is previewed is what is sent. Running
  // it twice changes nothing -- text already in this shape is returned
  // untouched.
  global.DocxGenerator = { fromCvText, fromCoverLetterText, buildFileBase,
    measureCv, normalizeSections: reorderSections,
    normalizePhone: normalizePhoneToken };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.DocxGenerator;
  }
  console.log(TAG, 'loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
