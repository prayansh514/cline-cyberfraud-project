# ScamGuard client (Chrome extension)

React 18 + Vite + `@crxjs/vite-plugin` + Tailwind CSS v3, written in **standard JavaScript only** (`.js` and `.jsx`; no TypeScript files, configs or dependencies).

## Commands

Run from `/client`:

- `npm run dev` starts Vite with hot reload for the extension. Vite listens on port 5173 (pinned in `vite.config.js`, because extension pages cannot infer the HMR WebSocket port).
- `npm run build` creates the production extension in `dist/`.
- Load it in Chrome: open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked** and select `client/dist`.

## Layout

- `manifest.json`: Manifest V3 (plain JSON, read by `vite.config.js`).
- `src/popup/`: the toolbar popup (React).
- `src/background/`: the service worker.
- `src/content/`: the content script that runs on WhatsApp Web and on the local mock page.
- `src/styles/tailwind.css`: Tailwind entry file.

## Styling strategy

Two surfaces need styling, and they follow different rules.

1. **Popup UI** (`src/popup/`): uses Tailwind utility classes directly. The popup is its own document, so `src/styles/tailwind.css` (with Tailwind's base reset) is imported in `src/popup/main.jsx` and affects nothing else.
2. **Banners and badges injected into WhatsApp Web** (content script): each injected element is rendered inside a **Shadow DOM** host (`element.attachShadow({ mode: 'open' })`), and the compiled Tailwind CSS is loaded into that shadow root only.
   - WhatsApp's own CSS cannot restyle our banner, because styles do not cross the shadow boundary into it.
   - Our Tailwind CSS cannot leak out and restyle WhatsApp. This matters because Tailwind's base reset (`preflight`) is global and would otherwise change WhatsApp's layout.
   - The red/amber **outline** on a message bubble is the one thing that must touch WhatsApp's own element. It is applied as a small inline style or a single namespaced attribute (`data-scamguard-verdict`), never through global Tailwind classes.

How it is verified: Phase 11 of `roadmap.md` injects a banner on the mock page and checks that it lives inside a shadow root and keeps its Tailwind look, and that the surrounding page styles are unchanged.

