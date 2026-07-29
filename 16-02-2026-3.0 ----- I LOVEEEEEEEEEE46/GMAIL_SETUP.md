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

## Editing the template

Edit subject/body directly in the panel and press **Save** (**Reset** restores
the default). Available tokens:

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

Empty tokens collapse cleanly — no stray "(Job ID )" when a posting has none.

Keep it short. The purpose is to help a recruiter *locate your application*,
not to re-pitch your CV.
