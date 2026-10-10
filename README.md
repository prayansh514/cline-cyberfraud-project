# ScamGuard

A privacy-first Chrome extension that watches WhatsApp Web for scam messages and malicious APK attachments. It checks messages locally, masks personal details, asks a small stateless AI agent for a verdict, and then outlines dangerous messages in red and disables their links.

- **Extension (`client/`)**: React 18, Vite, `@crxjs/vite-plugin`, Tailwind CSS v3.
- **Backend (`server/`)**: Node.js, Express, CORS, and the Cline SDK (`@cline/sdk`).
- **Mock WhatsApp page (`mock/`)**: a local page that imitates WhatsApp Web's message bubbles, for testing without a real account.

## JavaScript only

This whole project is standard JavaScript: `.js` and `.jsx` files only.

- Do not add `.ts` or `.tsx` files, a `tsconfig*.json`, `typescript`, `typescript-eslint` or any `@types/*` package.
- To check, run this from the repo root. It must print nothing:

  ```
  dir /s /b *.ts *.tsx tsconfig*.json 2>nul | findstr /v /i "node_modules"
  ```

## Prerequisites

- **Node.js 22 or newer** (the Cline SDK requires it). Check with `node --version`.
- **npm** (installed with Node).
- **Google Chrome**.
- For real AI verdicts: an API key for an LLM provider supported by the Cline SDK (see https://docs.cline.bot/sdk/overview). You can skip this and use stub mode (below).

## Install

Run these from the repo root. There are three separate `package.json` files, so there are three installs:

```
npm install
npm --prefix server install
npm --prefix client install
```

## Configure the backend (`.env`)

1. Copy the example file:

   ```
   copy server\.env.example server\.env
   ```

2. Open `server\.env` and fill in the values. Never commit this file (it is git-ignored).

   | Variable | Meaning |
   | --- | --- |
   | `PORT` | Backend port. Default `5000`. |
   | `CLINE_PROVIDER_ID`, `CLINE_MODEL_ID`, `CLINE_API_KEY` | Your LLM provider, model and key. Needed when `USE_STUB=false`. |
   | `USE_STUB` | `true` returns deterministic fake verdicts and never calls the LLM (for offline demos and tests). `false` uses the real agent. |
   | `LOG_TEXT` | `false` (default) logs only the verdict and message length. `true` also logs the anonymized text, which is handy for checking that nothing personal is sent. |
   | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | Per-IP limit for `POST /api/analyze`. Default 60 requests per 60 000 ms. |
   | `STUB_DELAY_MS` | Testing only: delay before a stub answer, to see the "Checking..." badge. |

## Run everything

From the repo root:

```
npm run dev
```

This starts three processes together, each prefixed in the log:

| Prefix | What | Address |
| --- | --- | --- |
| `[server]` | Express backend (nodemon, restarts on change) | http://localhost:5000/api/health |
| `[client]` | Vite dev server for the extension (hot reload) | port 5173 |
| `[mock]` | Static server for the mock WhatsApp page | http://localhost:5500/whatsapp-mock.html |

You can also run them one at a time: `npm run dev:server`, `npm run dev:client`, `npm run dev:mock`.

## Load the extension in Chrome

1. Start `npm run dev`, or run `npm --prefix client run build` for a one-off build. Either one writes the extension to `client\dist`.
2. Open `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the `client\dist` folder.
5. Pin the ScamGuard icon. Its popup has the on/off switch, the backend URL, the backend status light and the scanned, flagged and blocked counters.

While `npm run dev` is running, edits to the extension code hot-reload without touching `chrome://extensions/`. Pages that were already open keep the old script, so reload the tab after big changes.

## Try it on the mock page

1. With `npm run dev` running and the extension loaded, open http://localhost:5500/whatsapp-mock.html.
2. Open DevTools (F12) and look at the Console. You should see `ScamGuard active`.
3. The page has 11 test bubbles (TC-01 to TC-11) and a legend with the expected result for each. Use the buttons on the right to add a scam message, a safe message, a burst of five, or an `.apk` attachment while the page is open.
4. A malicious bubble gets a red outline, a warning banner with the explanation, and links that no longer open. A suspicious one gets an amber outline and asks before opening a link.

By default the console never prints an original message, only the masked text that is sent. To see the original text while debugging, run `localStorage.setItem('scamguard:debug', '1')` in the page console and reload.

## How it works

1. A content script watches the chat for incoming messages (outgoing ones are ignored). For a file attachment it reads only the file name.
2. A local regex pre-filter ignores messages with no link, financial keyword, `.apk` name or phone number. Ignored messages never leave the page.
3. Flagged messages are anonymized (`[NAME]`, `[PHONE]`, `[EMAIL]`, `[UPI]`, `[NUMBER]`).
4. The extension's service worker sends the masked text to the backend, which asks a stateless Cline SDK agent for a verdict (Safe, Suspicious or Malicious) and a short explanation.
5. The content script applies the verdict to the message bubble.

Rule baked into the agent: banks, government agencies and legitimate enterprises in India never distribute official apps through WhatsApp APKs, so a message urging an APK install is Malicious.

## Tests

| What | Command |
| --- | --- |
| Client unit tests (pre-filter, anonymizer, cache, limiter) | `npm --prefix client test` |
| Server unit tests (verdict parser, prompt, rate limiter) | `cd server`, then `node --test "agent/*.test.js" "middleware/*.test.js"` |
| Backend regression against every fixture | `cd server`, then `node scripts\run-fixtures.js` (backend running) |
| Real agent smoke test | `cd server`, then `node scripts\agent-smoke-test.js` (needs the provider settings) |

Note: on Node 22, `node --test <folder>` fails with `Cannot find module`. Use quoted globs as shown.

## Project layout

```
client/     extension (manifest.json, src/content, src/background, src/popup, src/shared, src/styles)
server/     Express backend (index.js, routes/, agent/, middleware/, scripts/)
mock/       mock WhatsApp page (whatsapp-mock.html, mock.js, mock.css, fixtures/messages.json)
project.md  blueprint
roadmap.md  build checklist
```

## Known limitations

- **Live WhatsApp Web is not validated yet.** Everything was tested on the mock page. WhatsApp's real page uses obfuscated markup, so the selectors in `client/src/content/selectors.js` are the mock page's. Replace them as described in Phase 14 of `roadmap.md` before relying on it for real chats, and test only with a test account.
- **Attachments are judged by file name only.** A scam APK renamed to something harmless, or sent inside a zip, will not be caught. The file's contents are never read.
- **Local use only.** The backend allows any origin (CORS) and has no authentication, so run it on localhost and do not expose it to the internet.

