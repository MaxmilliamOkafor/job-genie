# Real-browser checks

Everything in `tests/` runs the product's modules under jsdom. That proves
the logic and proves nothing about whether Chromium ever *runs* it — a
manifest match pattern that does not cover a host makes a perfectly correct
module dead on that site, and no jsdom test can see it.

These two load the real unpacked extension into real Chromium and drive it
over real `https://` origins.

```
node tests/browser/platforms.browser.cjs     # detection, JD, gate, email harvest
node tests/browser/attach.browser.cjs        # CV + cover letter into a real file input
node tests/browser/easyapply.browser.cjs     # LinkedIn Easy Apply, toggle ON
node tests/browser/twopage.browser.cjs       # posting -> Apply -> form, on every ATS
node tests/browser/linkedin-list.browser.cjs # LinkedIn search results, whole list
```

Both skip cleanly (exit 0) when Playwright or a Chromium build is missing,
so they are safe to run anywhere.

## What they check

`platforms.browser.cjs` — one case per **host fragment** of every platform in
`ats-platforms.js` (63 today, not 33: a vendor's second domain —
`myworkdaysite.com`, `icims.eu`, `theresumator.com`, `ukg.com` — is where
coverage silently stops). For each it asserts, inside the extension's own
isolated world:

- `ats-platforms.js`, `jd-contact-sources.js` and `jd-contact-extractor.js`
  all injected
- `detect()` returns that platform
- the JSON-LD `JobPosting` parses to a full description, company, location
- the platform's **own** CSS description selector matches — fixtures are
  generated *from* `PLATFORMS[key].description`, so a selector typo fails here
- `jobIdFromUrl()` finds the requisition ID
- the recognition gate answers `supportedHost: true` (asked via
  `CHECK_READY_STATUS`; content.js returns before registering its listener
  when the host is unsupported, so "no receiver" is the rejection signal)
- an address written in plain text in the JD body is harvested

Then the excluded platforms — Lever, Ashby, Rippling, Indeed, Glassdoor,
Wellfound, Otta — plus two lookalike hosts (`myworkdayjobs.com.evil.example`,
`greenhouse.io.phish.example`) must be detected as nothing and blocked by the
gate.

`attach.browser.cjs` sends the same `attachDocument` message `popup.js` sends
and reads back `input.files`, on every platform.

`easyapply.browser.cjs` — LinkedIn is **not** a tailoring target. The heavy
engine is denylisted on `linkedin.com` in both `background.js` and
`autofill-controller.js` because it crashes the SPA. What LinkedIn needs is
Easy Apply autofill, and none of that is visible to a manifest test: the
filler is registered at *runtime* (`jg-linkedin-autofill`), so whether it
fires depends on service-worker state and the toggle defaults. This drives a
four-step Easy Apply modal end to end — registration, contact step, custom
questions, the Yes/No screening surface, and submit — and confirms the heavy
engine is absent from the page.

`twopage.browser.cjs` — most ATS are **two pages**: the description at one
URL, the form at another. It navigates the way a user does (open the
posting, press Apply, land on the form) and then asks whether the extension
still has a description to extract keywords from, a company to address an
email to, and the address printed in the JD body. It asserts both halves:
that the apply page genuinely has none of them in its own DOM, and that
`jd-context.js` supplies them anyway — matched by requisition id, tab
lineage or path lineage, never by guesswork.

`linkedin-list.browser.cjs` — the LinkedIn **search-results list**. Everything
else acts on the job that is already open; on `/jobs/search-results/` none is,
because the right pane is a skeleton until a card is clicked. This drives a
six-job split-pane list (two of them external-apply, which must be skipped)
under a continuous mutation storm, and asserts the bounds as hard as the
feature: each role applied to exactly once, nothing re-applied to on a second
visit, and nothing submitted at all with auto-submit off.

## LinkedIn: what is deliberate

- The tailoring engine must NOT load on `linkedin.com`. It crashes the SPA.
- Easy Apply autofill must fire with the toggle untouched (it ships ON).
- Contact sources DO load, for the hiring-team card.

`platforms.browser.cjs` and `attach.browser.cjs` therefore hold LinkedIn to
the detection-and-harvest half only; `easyapply.browser.cjs` covers the rest.

## Two traps worth knowing about

Both produced convincing false failures before being understood:

1. **`page.route()` fulfilment does not trigger content-script injection.**
   Pages must be served over a real navigation. A local HTTPS server plus
   `--host-resolver-rules=MAP * 127.0.0.1:<port>` means Chromium's own match
   patterns are what decide, which is the whole point.

2. **`page.evaluate()` runs in the page's MAIN world.** Content-script globals
   live in the extension's ISOLATED world and are invisible from there — the
   harness reads "nothing injected" while everything is fine. Probing goes
   through `chrome.scripting.executeScript` from the service worker, the same
   path `popup.js` uses in production.

One more, smaller: the extension's CSP forbids `new Function()`, so the probe
is declared as a real function and handed to `chrome.scripting` to serialise.

This container also exports `HTTPS_PROXY`, which Chromium honours on Linux;
the proxy truncates the local server's responses, hence `--no-proxy-server`.
