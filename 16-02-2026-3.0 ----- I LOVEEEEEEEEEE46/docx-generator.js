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
  function run(text, opts = {}) {
    return `<w:r>${rPr(opts)}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  }
  function runText(text, bold) {
    return run(text, { bold: !!bold, color: C.BODY, sz: 21 });
  }
  function paragraph(content, opts = {}) {
    const ppr = [];
    if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
    // Tab stops: opts.tabs is an array of integers (twips from left margin).
    // Used by the 3-column CORE COMPETENCIES layout -- a single-column
    // paragraph with tab-aligned items reads in linear order to every ATS
    // parser while LOOKING like a 3-column grid to the human eye.
    if (Array.isArray(opts.tabs) && opts.tabs.length) {
      const stops = opts.tabs.map((pos) => `<w:tab w:val="left" w:pos="${pos}"/>`).join('');
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
        pieces.push(`<w:hyperlink r:id="${id}">${run(seg, { color: C.LINK, sz: opts.sz || 19, underline: true })}</w:hyperlink>`);
      } else {
        pieces.push(run(seg, { color: C.BODY, sz: opts.sz || 19 }));
      }
    });
    return paragraph(pieces.join(''), { align: opts.align || 'left', spacingAfter: opts.spacingAfter != null ? opts.spacingAfter : 40 });
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
  function isDateLine(t) {
    return /^[A-Za-z]{3,9}\.?\s+\d{4}\s*[-–—]\s*(present|[A-Za-z]{3,9}\.?\s+\d{4})$/i.test(t) ||
      /^\d{4}\s*[-–—]\s*(present|\d{4})$/i.test(t) ||
      /^[A-Za-z]{3,9}\.?\s+\d{4}$/.test(t) && t.length < 22;
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

  function buildBodyXml(cvText) {
    const lines = cvText.split('\n');
    const out = [];
    const rels = []; // hyperlink relationships collected for the contact line

    // Experience sections where the company/title/date treatment applies.
    const EXPERIENCE_HEADERS = ['WORK EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT'];

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
      // Three-column sections: items render in a 3-up grid via tab stops.
      // Crucially this is a SINGLE-COLUMN paragraph layout under the hood
      // -- no tables, no Word columns -- so ATS parsers (Workday,
      // Greenhouse, Lever, Taleo, iCIMS) read the items in linear left-
      // to-right reading order, exactly as they would a normal list.
      const GRID_SECTIONS = new Set([
        'CORE COMPETENCIES', 'AREAS OF EXPERTISE',
      ]);
      // Tab-stop positions in twips, evenly spread across the content
      // area between left margin (900) and right margin (900) of an
      // A4 page (11906 twips wide -> 10106 content). Three stops at
      // 0, ~3370, ~6740 give clean visual thirds.
      const GRID_TABS = [0, 3370, 6740];
      // Navy bullet character used inline within each grid cell. We
      // build the runs by hand so a <w:tab/> can separate the cells.
      const gridCellRuns = (item) =>
        run('•  ', { color: C.NAVY, sz: 22 }) + run(item, { color: C.BODY, sz: 21 });
      // Render an array of competency strings as paragraphs of 3 columns.
      // Final row pads to 3 cells with empty strings so the trailing tab
      // alignment stays consistent for both human and parser.
      const emitGrid = (items) => {
        for (let r = 0; r < items.length; r += 3) {
          const row = [items[r], items[r + 1] || '', items[r + 2] || ''];
          const cells = row
            .map((it, idx) => (idx === 0 ? gridCellRuns(it) : `<w:r><w:tab/></w:r>${it ? gridCellRuns(it) : ''}`))
            .join('');
          out.push(paragraph(cells, { tabs: GRID_TABS, spacingAfter: 40, line: 276, lineRule: 'auto' }));
        }
      };
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
            out.push(paragraph(run(t, { italic: true, color: C.MUTED, sz: 19 }), { spacingAfter: 40 }));
            continue;
          }
          if (roleState === 'expectCompany') {
            out.push(paragraph(run(t, { bold: true, color: C.NAVY, sz: 21 }), { spacingBefore: 80, spacingAfter: 20 }));
            roleState = 'expectTitle';
            continue;
          }
          if (roleState === 'expectTitle') {
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
        // CORE COMPETENCIES / AREAS OF EXPERTISE -> 3-column tab-grid
        //   (single-column paragraphs underneath, ATS-safe).
        // CERTIFICATIONS / AWARDS              -> one bullet per line.
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
  function documentXml(bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<w:body>${bodyXml}` +
      `<w:sectPr>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="864" w:right="900" w:bottom="864" w:left="900" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>` +
      `</w:body></w:document>`;
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
        { name: 'word/document.xml', content: documentXml(bodyXml) },
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
        { name: 'word/document.xml', content: documentXml(bodyXml) },
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

  global.DocxGenerator = { fromCvText, fromCoverLetterText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.DocxGenerator;
  }
  console.log(TAG, 'loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
