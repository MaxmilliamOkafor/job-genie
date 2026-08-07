/**
 * Shared setup for the real-browser checks.
 *
 * WHY THESE EXIST AT ALL
 *   Every other test in tests/ runs the product's modules under jsdom. That
 *   proves the logic, and proves nothing about whether Chromium ever runs
 *   it: a manifest match pattern that does not cover a host makes a
 *   perfectly correct module dead on that site, and no jsdom test can see
 *   it. That is exactly how LinkedIn ended up detected, selector-complete
 *   and never tailored.
 *
 *   These load the real unpacked extension into real Chromium and drive it
 *   over real https:// origins.
 *
 * TWO TRAPS, both of which produced convincing false failures:
 *   - page.route() fulfilment does NOT trigger content-script injection.
 *     Pages must be served by a real server over a real navigation, which
 *     is what --host-resolver-rules is for here.
 *   - page.evaluate() runs in the page's MAIN world. Content-script
 *     globals live in the extension's ISOLATED world and are invisible
 *     there. Probing goes through chrome.scripting.executeScript from the
 *     service worker -- the same path popup.js uses in production.
 *
 * Requires playwright and a Chromium build. Skips cleanly without them.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const EXT = path.resolve(__dirname, '..', '..');

function requirePlaywright() {
  for (const p of [
    'playwright',
    process.env.PLAYWRIGHT_PATH,
    '/tmp/claude-0/-home-user-job-genie/3a02a090-a415-561d-b38d-f679167eccd8/scratchpad/harness/node_modules/playwright',
  ]) {
    if (!p) continue;
    try { return require(p); } catch (e) { /* try the next */ }
  }
  return null;
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(root)) {
      if (!/^chromium-/.test(d)) continue;
      const exe = path.join(root, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) { /* fall through */ }
  return null;
}

/** A throwaway self-signed cert; the browser is told to ignore cert errors. */
function certs() {
  const dir = path.join(os.tmpdir(), 'jg-browser-certs');
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert, '-days', '30', '-subj', '/CN=localhost'], { stdio: 'ignore' });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/** Load one of the extension's browser modules in node. */
function loadCjs(file) {
  const Module = require('module');
  const f = path.join(EXT, file);
  const m = new Module(f, null);
  m.filename = f;
  m.paths = Module._nodeModulePaths(EXT);
  m._compile(fs.readFileSync(f, 'utf8'), f);
  return m.exports;
}

/**
 * The launch arguments that make extension testing work here. The proxy
 * bypass matters: this container exports HTTPS_PROXY, Chromium honours it
 * on Linux, and the proxy truncates the local server's responses.
 */
function launchOptions(port, profile) {
  return {
    executablePath: chromiumPath(),
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-sandbox',
      `--host-resolver-rules=MAP * 127.0.0.1:${port}`,
      '--ignore-certificate-errors',
      '--no-proxy-server',
    ],
    proxy: { server: 'direct://' },
  };
}

/**
 * The extension's service worker, once its chrome.* APIs are actually
 * bound. The worker context becomes evaluable BEFORE that happens -- a
 * first evaluate can see a `chrome` carrying only loadTimes and csi -- so
 * touching chrome.storage immediately fails with a misleading
 * "Cannot read properties of undefined".
 */
async function serviceWorker(ctx, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 20000);
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: deadline - Date.now() });
  for (;;) {
    const ready = await sw.evaluate(
      () => typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.scripting && !!chrome.tabs
    ).catch(() => false);
    if (ready) return sw;
    if (Date.now() > deadline) throw new Error('service worker chrome APIs never became available');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function skipUnlessReady(name) {
  const pw = requirePlaywright();
  if (!pw) { console.log('SKIP ' + name + ': playwright not installed'); process.exit(0); }
  if (!chromiumPath()) { console.log('SKIP ' + name + ': no chromium build found'); process.exit(0); }
  return pw;
}

module.exports = { EXT, requirePlaywright, chromiumPath, certs, loadCjs, launchOptions, skipUnlessReady, serviceWorker };
