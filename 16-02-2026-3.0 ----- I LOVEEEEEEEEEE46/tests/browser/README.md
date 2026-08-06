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
