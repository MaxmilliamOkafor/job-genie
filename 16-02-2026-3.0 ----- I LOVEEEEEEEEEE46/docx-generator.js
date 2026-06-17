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

  // ---- XML helpers -----------------------------------------------------
  function xmlEscape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  function runText(text, bold) {
    const rpr = bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '';
    return `<w:r>${rpr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  }
  function paragraph(content, opts = {}) {
    const ppr = [];
    if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
    if (opts.spacingAfter != null) ppr.push(`<w:spacing w:after="${opts.spacingAfter}"/>`);
    if (opts.align) ppr.push(`<w:jc w:val="${opts.align}"/>`);
    if (opts.indent) ppr.push(`<w:ind w:left="${opts.indent}" w:hanging="${opts.hanging || 0}"/>`);
    const pprXml = ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : '';
    return `<w:p>${pprXml}${content}</w:p>`;
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
    'WORK EXPERIENCE', 'EXPERIENCE', 'EMPLOYMENT',
    'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'CERTIFICATIONS', 'PROJECTS',
  ];

  function buildBodyXml(cvText) {
    const lines = cvText.split('\n');
    const out = [];

    // First non-empty line is the name; second/third are contact/links.
    let firstNonEmpty = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { firstNonEmpty = i; break; }
    }

    if (firstNonEmpty >= 0) {
      // Name -- center, bold, larger
      out.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr>` +
        `<w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t xml:space="preserve">${xmlEscape(lines[firstNonEmpty].trim())}</w:t></w:r></w:p>`);
      // Walk subsequent contact/links lines until first SECTION header
      let i = firstNonEmpty + 1;
      for (; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        const upper = t.toUpperCase().replace(/:$/, '');
        if (SECTION_HEADERS.includes(upper)) break;
        out.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>` +
          `<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xmlEscape(t)}</w:t></w:r></w:p>`);
      }

      // Rest of the document
      let inBulletList = false;
      for (; i < lines.length; i++) {
        const raw = lines[i];
        const t = raw.trim();
        if (!t) {
          // Empty line acts as a spacer.
          out.push(`<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>`);
          inBulletList = false;
          continue;
        }
        const upper = t.toUpperCase().replace(/:$/, '');
        if (SECTION_HEADERS.includes(upper)) {
          // Section heading -- bold uppercase, larger, with bottom border
          out.push(`<w:p><w:pPr><w:spacing w:before="200" w:after="80"/>` +
            `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="333333"/></w:pBdr></w:pPr>` +
            `<w:r><w:rPr><w:b/><w:caps/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${xmlEscape(upper)}</w:t></w:r></w:p>`);
          inBulletList = false;
          continue;
        }
        if (/^([\-*•]|\d+\.)\s+/.test(t)) {
          // Bullet
          const item = t.replace(/^([\-*•]|\d+\.)\s+/, '');
          out.push(`<w:p><w:pPr><w:ind w:left="360" w:hanging="220"/><w:spacing w:after="40"/></w:pPr>` +
            `<w:r><w:t xml:space="preserve">• ${xmlEscape(item)}</w:t></w:r></w:p>`);
          inBulletList = true;
          continue;
        }
        // Company / title / date line heuristic: short line, no period.
        // Render as bold if it's the line just before a bullet list.
        const isLikelyHeader = t.length < 80 && !/[.;]$/.test(t) && !inBulletList;
        out.push(paragraph(runText(t, isLikelyHeader), { spacingAfter: 40 }));
      }
    }

    return out.join('');
  }

  // ---- Word document XML ----------------------------------------------
  function documentXml(bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body>${bodyXml}` +
      // sectPr at end controls page size + margins; A4 + 0.6in margins
      `<w:sectPr>` +
      `<w:pgSz w:w="11906" w:h="16838"/>` +
      `<w:pgMar w:top="864" w:right="864" w:bottom="864" w:left="864" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>` +
      `</w:body></w:document>`;
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
  const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

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

  function fromCvText(cvText, opts = {}) {
    try {
      if (!cvText || typeof cvText !== 'string') {
        return { success: false, error: 'empty CV text' };
      }
      const bodyXml = buildBodyXml(cvText);
      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: ROOT_RELS_XML },
        { name: 'word/_rels/document.xml.rels', content: WORD_RELS_XML },
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

  global.DocxGenerator = { fromCvText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.DocxGenerator;
  }
  console.log(TAG, 'loaded');
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
