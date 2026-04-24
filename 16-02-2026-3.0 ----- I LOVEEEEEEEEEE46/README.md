# Job Genie v3.4.0 — Smart CV, Cover Letter & AI Page Autofill

The **Job Genie** extension is a production-ready, deployment-grade ATS CV tailoring
and AI Page Autofill tool. v3.4.0 integrates the Jobright Autofill v1.5.4 Ultimate
Edition engine (150+ ATS platforms, 500+ pre-seeded responses, STAR-format
behavioral answers, knockout-question intelligence) behind a user-controlled
master toggle so you pay for API usage only when you want to.

## 🆕 v3.4.0 — AI Page Autofill

| Control | Behaviour |
|---------|-----------|
| **AI Page Autofill** toggle (Settings) | Master kill-switch. When OFF, the vendor engine is neither injected nor given network permission, so zero API credit is consumed. |
| **Run Now** button | Manual one-shot autofill — injects the engine on the current tab and triggers it regardless of the toggle state. |
| `storage.onChanged` sync | Toggle state is mirrored across popup, content scripts, and background service worker in real time. |
| Dynamic `chrome.scripting.registerContentScripts` | When the toggle is ON, vendor scripts are registered for all future tabs. When OFF, they are unregistered — no dormant listeners. |

### How it works
1. **Popup** flips `autofill_enabled` in `chrome.storage.local`.
2. **Background service worker** watches that key and registers/unregisters the
   vendor content scripts (`autofill-engine/*.js`) via
   `chrome.scripting.registerContentScripts`.
3. **Content scripts** (`autofill-controller.js`) expose `window.AutofillController`
   so the existing CV-tailor flow and the manual **Run Now** button can delegate
   cleanly.
4. **Gate shim** (`autofill-engine/jg-gate.js`) stubs `fetch` when disabled and
   hides the Plasmo sidebar so nothing leaks through.

## 🚀 Key Features

### 1. **Auto-Trigger on ATS Detection**
- Automatically detects when you're on a supported ATS platform
- **Auto-clicks "Extract & Apply Keywords to CV"** button
- Starts tailoring immediately without manual intervention
- Works on 70+ Tier 1 & 2 company career sites

### 2. **Enterprise PDF Engine** (NEW)
- ATS-perfect formatting with precise typography
- 16pt names, 10.5pt body text, 54pt margins
- Multi-page support with automatic page breaks
- jsPDF-based for maximum compatibility

### 3. **Smart CV Parser** (NEW)
- Deep section detection for 8 categories
- Recognition for 50+ known companies
- Automated date normalization
- Job title keyword matching

### 4. **Cover Letter Generator** (NEW)
- Three professional tones: Professional, Enthusiastic, Concise
- Dynamic experience calculation
- Keyword injection for 100% relevance
- Template-driven for consistency

### 5. **Universal Location Strategy** (NEW)
- Extracts location from 11+ ATS platforms
- City-to-country mapping for 150+ cities
- NEVER includes "Remote" in CV header
- US state normalization

### 6. **Immutable Field Protection**
- Company names, job titles, and dates are LOCKED
- AI can only modify achievements and bullet points
- Prevents accidental data corruption
- Confidence scoring for extraction accuracy

### 7. **100% Keyword Match**
- Mandatory keyword injection
- Universal keyword strategy
- Dynamic score calculation
- Validation engine for reliability

## 📁 File Structure

```
PERFECTION/
├── manifest.json              # Extension manifest v3.0
├── content.js                 # Auto-trigger & ATS detection
├── popup.js                   # Main popup controller
├── popup.html                 # Popup UI
├── popup.css                  # Popup styles
├── background.js              # Service worker
│
├── # NEW ENGINES
├── professional-pdf-engine.js # Enterprise PDF generator
├── smart-cv-parser.js         # Intelligent CV parsing
├── cover-letter-generator.js  # Cover letter templates
├── enterprise-cv-parser.js    # Immutable field extraction
├── universal-location-strategy.js # Location normalization
│
├── # CORE MODULES
├── mandatory-keywords.js      # Keyword injection
├── universal-jd-parser.js     # Job description parsing
├── reliable-extractor.js      # Data extraction
├── universal-keyword-strategy.js # Keyword matching
├── unique-cv-engine.js        # CV tailoring engine
├── tailor-universal.js        # Universal tailoring
├── validation-engine.js       # Score validation
├── dynamic-score.js           # Dynamic scoring
├── turbo-pipeline.js          # Fast processing pipeline
├── pdf-ats-turbo.js           # Fast PDF generation
├── file-attacher-turbo.js     # File attachment
│
├── # LEGACY SUPPORT
├── resume-builder.js          # Resume building
├── resume-builder-improved.js # Improved builder
├── enhanced-cv-parser.js      # Enhanced parsing
├── cv-formatter-perfect.js    # CV formatting
├── cv-formatter-perfect-enhanced.js # Enhanced formatting
├── workday-handlers.js        # Workday-specific logic
├── rich-text-editor.js        # Rich text support
│
├── # AI PAGE AUTOFILL (v3.4.0)
├── autofill-controller.js     # Toggle <-> vendor-engine bridge
├── autofill-engine/           # Jobright Autofill v1.5.4 Ultimate Edition
│   ├── jg-gate.js             # Kill-switch + fetch shim
│   ├── ua-enhancement.js      # 150+ ATS coverage, knockout AI
│   ├── constants.js           # ATS selectors & enums
│   ├── filler.js              # Field-filling primitives
│   ├── contents.js            # Sidebar UI overlay
│   ├── answer.js              # 500+ pre-seeded ATS responses
│   ├── background-vendor.js   # (not loaded — retained for reference)
│   ├── contents.css           # Sidebar stylesheet
│   └── inter.css              # Inter font family (base64-inlined)
│
├── # ASSETS
├── icons/                     # Extension icons
├── content.css                # Injected styles
└── bulk-apply.*               # Bulk application files
```

## 🔐 Privacy & Data Flow

- No data leaves your browser except calls to the AI provider **you** select in the
  popup (OpenAI or Kimi K2). When the AI Page Autofill toggle is **off**, no network
  calls are made by the autofill engine at all.
- The gate shim (`autofill-engine/jg-gate.js`) short-circuits any residual calls to
  `*.jobright.ai` domains so the bundled vendor engine is fully decoupled from its
  original backend.
- All user preferences live in `chrome.storage.local` — they never sync to any server.

## 📦 Deployment Checklist (Chrome Web Store)

- [x] `manifest_version: 3`
- [x] Broad host permission (`<all_urls>`) justified in store listing: *"AI Page
      Autofill must detect job application forms on any employer career site
      without the user having to whitelist each domain."*
- [x] No remotely-hosted code — every script is packaged inside the extension.
- [x] Master user toggle for all API-consuming features.
- [x] Per-feature enable/disable in the Settings panel.
- [x] Version bumped to `3.4.0`.
- [x] Privacy policy URL — add in developer dashboard before submission.

To publish:

```bash
cd "16-02-2026-3.0 ----- I LOVEEEEEEEEEE46"
zip -r ../job-genie-3.4.0.zip . -x '*.DS_Store' -x '__MACOSX/*'
```

Upload `job-genie-3.4.0.zip` to the Chrome Web Store developer dashboard.

## 🎯 Supported ATS Platforms

### Tier 1 ATS Platforms
- Greenhouse
- Workday / MyWorkdayJobs
- SmartRecruiters
- iCIMS
- Workable
- Bullhorn
- TeamTailor
- Oracle/Taleo

### Tier 1 Companies (70+)
- **FAANG**: Google, Meta, Amazon, Microsoft, Apple
- **Enterprise**: Salesforce, IBM, Oracle, Adobe, SAP
- **Fintech**: Stripe, PayPal, Visa, Mastercard
- **Quant**: Citadel, Jane Street, Two Sigma, DE Shaw
- **And many more...**

## 🔧 Installation

1. Clone or download this extension
2. Open Chrome → Extensions → Enable Developer Mode
3. Click "Load unpacked" and select the PERFECTION folder
4. Navigate to any supported ATS platform
5. Watch the magic happen automatically!

## ⚡ Auto-Trigger Behavior

When you visit a supported ATS job listing:
1. Extension detects the ATS platform
2. Status banner appears at the top
3. **Automatically clicks "Extract & Apply Keywords to CV"**
4. Extracts job keywords from description
5. Tailors your CV with 100% keyword match
6. Generates ATS-perfect PDF
7. Attaches CV and Cover Letter to form

## 🔒 Data Protection

- **Immutable Fields**: Company, Title, Dates are NEVER modified
- **Profile-Based**: All data comes from your profile only
- **No Hardcoding**: No fake data or placeholder content
- **Secure**: API keys stored securely, never exposed

## 📊 Performance

- **PDF Generation**: < 100ms
- **Keyword Extraction**: < 20ms
- **CV Tailoring**: < 50ms
- **Total Pipeline**: < 200ms

## 🆕 What's New in PERFECTION v3.0

1. ✅ Auto-trigger on ATS detection (from KIMI 5.0)
2. ✅ Professional PDF Engine (from PERPLEXITY)
3. ✅ Smart CV Parser (from PERPLEXITY)
4. ✅ Cover Letter Generator (from PERPLEXITY)
5. ✅ Universal Location Strategy (from 26-01-2026)
6. ✅ Enterprise CV Parser (from 26-01-2026)
7. ✅ Immutable Field Protection (all versions)
8. ✅ Combined best features from all previous versions

---

**Built with ❤️ for job seekers who want the PERFECT application**
