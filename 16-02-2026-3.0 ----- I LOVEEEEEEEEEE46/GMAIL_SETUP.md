# Gmail follow-up email — setup

You only do this once. The extension sends from **your own Gmail account**, so
the note lands in the recruiter's inbox as a normal personal email and appears
in your own Sent folder.

If anything fails, open the extension popup → **Application Follow-up Email** →
**Diagnose setup**. It checks every precondition below and names the exact fix,
so you never have to guess.

---

## Why not SMTP

A Chrome extension has no raw TCP sockets, so SMTP cannot work from the
browser — this isn't a limitation of the implementation, it's the browser
sandbox. A server relay would work, but it sends from a third-party domain,
which reads as bulk mail and lands in spam. The Gmail API sends from your real
mailbox, which is what you actually want for a job follow-up.

---

## Two ways to configure — pick one

**Option A — paste the client ID into the extension (recommended for a public
repo).** Nothing is committed; the ID lives in this browser's extension storage.
Works with any Google account, not just the one Chrome is signed into. Use a
**Web application** OAuth client. → jump to **Option A** below.

**Option B — client ID in `manifest.json`.** Slightly simpler, Chrome manages
the token cache, but the ID sits in your repo and auth is tied to the
signed-in Chrome profile. Use a **Chrome Extension** OAuth client. → Steps 1–4.

### Is the client ID a secret?

**No.** In both flows here there is no client *secret* at all — Google
validates the extension ID (Option B) or the registered redirect URI
(Option A), not a shared secret. An OAuth client ID is designed to ship
publicly inside client-side apps. Option A exists to keep a public repo tidy
and to free you from the Chrome-profile account, not because a leaked client
ID is dangerous.

What you must **never** commit is the **`.pem` private key** from the
ID-pinning step. (The `"key"` field in `manifest.json` is only the public
half — that one is safe.)

---

## Option A — paste the client ID (no repo changes)

1. **Enable the Gmail API**: <https://console.cloud.google.com/> → your project
   → **APIs & Services → Library** → **Gmail API** → **Enable**.
2. Extension popup → **Application Follow-up Email** → **Copy redirect URI**.
   It looks like `https://<your-extension-id>.chromiumapp.org/`.
3. **Credentials → Create credentials → OAuth client ID** → application type
   **Web application** → under **Authorised redirect URIs** paste the URI from
   step 2, exactly as copied.
4. **OAuth consent screen** → add the scope `.../auth/gmail.send`, and while the
   app is in **Testing** add your own Google account under **Test users**.
5. Paste the client ID into the extension's **Gmail client ID** field → **Save
   client ID** → **Connect Gmail**.

The status line will read *connected ✓ … [client ID on this device]*. **Clear**
removes it. Tokens are short-lived (about an hour) and re-issued silently; if
one expires you'll be asked to reconnect.

> If Google says `redirect_uri_mismatch`, the URI in the Cloud Console doesn't
> match byte-for-byte — re-copy it with the button and paste again. Note that
> the extension ID (and therefore the URI) changes if the extension is unpacked
> from a different folder, unless you pin it as in Step 1 below.

---

## Option B — client ID in the manifest

## Step 1 — Pin your extension ID (do this FIRST)

**This is the step that breaks most Gmail-API setups.** An unpacked extension
gets a **new ID every time it loads from a different path**, and the OAuth
client is registered against one specific ID. When the ID changes, Google
returns `bad client id` and nothing works.

Pin it permanently:

1. Package the extension once: `chrome://extensions` → **Pack extension** →
   select the extension folder. Chrome produces a `.crx` and a `.pem`.
2. Get the public key from the `.pem`:
   ```bash
   openssl rsa -in your-key.pem -pubout -outform DER 2>/dev/null | openssl base64 -A
   ```
3. Add it to `manifest.json` as a top-level `"key"`:
   ```json
   "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...(the base64 string)..."
   ```
4. Reload. Your extension ID is now stable forever. Note it from
   `chrome://extensions` — you need it in Step 3.

Keep the `.pem` somewhere safe and **out of git**.

> Skipping this works only if you never move the folder and re-register the ID
> in Google Cloud each time it changes. Pinning is far less painful.

---

## Step 2 — Enable the Gmail API

1. <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
   (Forgetting this yields `access_denied` even when OAuth itself is correct.)

---

## Step 3 — Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**

- Application type: **Chrome Extension** — *not* "Web application". This is the
  second most common mistake; a Web client will never work with
  `chrome.identity.getAuthToken`.
- Item ID: the extension ID from Step 1.

Copy the generated client ID and paste it into `manifest.json`:

```json
"oauth2": {
  "client_id": "123456789-abcdefg.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/gmail.send"]
}
```

Reload the extension.

---

## Step 4 — Consent screen and test user

**APIs & Services → OAuth consent screen**

- User type **External** is fine.
- While the app is in **Testing**, add your own Google account under
  **Test users**. If you skip this, you get `access_denied` at the consent
  prompt even though everything else is right.
- Add the scope `.../auth/gmail.send`.

`gmail.send` is a **restricted** scope, so Google shows an "unverified app"
warning. For personal use click **Advanced → Go to (unsafe)**. Verification is
only needed if you publish this for other people.

---

## Step 5 — Connect and test

1. Extension popup → **Application Follow-up Email** → **Connect Gmail** →
   complete the Google prompt.
2. Status should read **connected ✓**.
3. Click **Send test to me** — the exact email a recruiter would receive
   arrives in your own inbox, prefixed `[TEST]`.

---

## How it behaves day to day

- After you submit an application, the extension reads the posting for a
  **published** recruiter email and the job/requisition ID.
- Found → the composer pre-fills the recipient, subject and body. **Nothing
  sends until you click Send follow-up.**
- Not found → it says so, and suggests the company's published careers address
  or messaging the recruiter on LinkedIn. It does not look up private contact
  details.
- One follow-up per posting: a second attempt for the same job is refused, so
  you can't accidentally double-email a recruiter.

## Templates

Three presets ship built in:

| Preset | Use it when |
|---|---|
| **Standard follow-up** (default) | Most applications. States the application, gives the locators, one line of relevance. |
| **Concise (3 lines)** | Senior/busy recruiters, or high-volume applying. Just the facts. |
| **With relevance hook** | Roles you genuinely match — adds one line on your strongest relevant experience. |

Pick one from the **Template** dropdown. **New** starts a fresh template,
**Duplicate** copies the current one, **Delete** removes your own (presets
can't be deleted). Editing a preset automatically saves it as *your copy*, so
the originals are always there — **Reset** restores the presets and keeps your
own templates.

Keep it short. The purpose is to help a recruiter *locate your application*,
not to re-pitch your CV.

## Variables

Type these anywhere in the subject or body:

| Token | Fills with |
|---|---|
| `{{job_title}}` | Job title from the posting |
| `{{company}}` | Company name |
| `{{job_id}}` | Job / requisition ID |
| `{{greeting_name}}` | Contact's first name, else "Hiring Team" |
| `{{my_name}}` `{{my_email}}` `{{my_phone}}` `{{my_linkedin}}` | Your profile details |
| `{{headline}}` | One-line fit summary |
| `{{today}}` | Today's date |
| `{{job_location}}` | Role location (disambiguates a title open in several offices) |
| `{{job_department}}` | Team / department, when stated |
| `{{job_url}}` | Direct posting URL |
| `{{reference_block}}` | **All locators found**, as ready-to-paste lines (Role / Job ID / Location / Team / Posting) |
| `{{recipient_name}}` | Contact's full name, else "Hiring Team" |
| `{{recipient_first_name}}` | Contact's first name, else "Hiring Team" — used in the greeting |
| `{{recipient_email}}` | The address being written to |
| `{{company_name}}` | Same as `{{company}}` |
| `{{job_role}}` | Same as `{{job_title}}` |
| `{{highlight}}` | Your strongest relevant experience (used by the hook preset) |

Empty tokens collapse cleanly — no stray "(Job ID )" when a posting has none,
and no "Dear ," when no contact name was published.
