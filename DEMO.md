# ScamGuard: 3-minute demo script

Goal: show that ScamGuard ignores normal chat, catches a scam and a malicious APK, explains why, and protects the user. Total time: about 3 minutes.

## Before you go on stage (2 minutes, not part of the 3)

1. `npm run dev` from the repo root. Wait for all three prefixes: `[server]`, `[client]`, `[mock]`.
2. Chrome: `chrome://extensions/`, Developer mode on, **Load unpacked**, pick `client\dist`. Pin the ScamGuard icon.
3. Open http://localhost:5500/whatsapp-mock.html in one tab. Open the popup once and check the status light is green.
4. Open DevTools (F12) on the mock tab, Console tab, and dock it to the side so the audience can read it.
5. In `server\.env`: `USE_STUB=false` for the real AI, or `USE_STUB=true` for the safe fallback. Restart the server after changing it.
6. Click the popup **Reset** link so the counters start at 0.

## The script

| Time | Say | Do | They should see |
| --- | --- | --- | --- |
| 0:00 | "Scams on WhatsApp hurt people who can't tell a real bank message from a fake one. ScamGuard sits on top of WhatsApp Web and protects them automatically." | Show the mock chat. | 11 messages, safe and scam mixed. |
| 0:20 | "First, privacy. Ordinary chat never leaves the browser." | Point at TC-01 "are we meeting at 5 pm?" and TC-11 `Invoice_March.pdf`. | Console: `skipped (safe)`. No outline. |
| 0:40 | "A message with a link or money words is checked, but personal details are masked first." | Point at TC-08 and the console line starting `payload:`. | `Hi [NAME], your a/c [NUMBER] is blocked, call [PHONE]...` The real name and numbers appear nowhere. |
| 1:10 | "Now a fake bank KYC message." | Point at TC-03. | An outline and a banner with a plain-English reason. **With the real AI this one is red ("Malicious") or amber ("Suspicious, be careful"); it can differ from run to run, because the AI judges a borderline message each time. Both are fine: say "flagged".** With `USE_STUB=true` it is always amber. |
| 1:30 | Red: "And the link is dead." Amber: "A suspicious link asks before opening." | Click the link in TC-03. | Red: nothing opens. Amber: a confirm box "Open this link anyway?" (press Cancel). |
| 1:45 | "Scammers also send fake bank apps. Banks never send an APK on WhatsApp." | Click **Add APK attachment**. | A "Checking..." badge, then a red outline and banner. Click the download button: nothing downloads. |
| 2:15 | "If a bubble is wrongly flagged, the user stays in control." | Click **Dismiss** on one banner. | That bubble goes back to normal, the others stay. |
| 2:30 | "The popup shows what happened." | Open the popup. | Scanned, flagged and blocked counters; backend status; the on/off switch. |
| 2:50 | "Everything is JavaScript, with a stateless Cline SDK agent behind it." | Stop. | |

Optional live segment (+1 minute, only if WhatsApp Web has been validated, see Phase 14 of `roadmap.md`): repeat the KYC message and the APK file name from a second phone to a test account. Use a test account only, never a real chat.

## Fallback plan

| If this fails | Do this |
| --- | --- |
| Wi-Fi or the AI provider is down, or answers are slow | Set `USE_STUB=true` in `server\.env`, restart `[server]`, reload the mock tab. The same script works with instant, deterministic verdicts. The stub flags `lottery` and `.apk` as Malicious and `kyc` as Suspicious, so TC-03 shows amber (and its link asks first) while TC-05 and the APK show red. Say so out loud. Also note the stub marks fewer messages (for example TC-04 and TC-07 come back Safe), so do not point at those. |
| Backend is not running | The popup shows a red light and bubbles show a grey "Could not verify" badge. Run `npm run dev:server`. |
| Mock page shows no outlines | Check the extension is loaded from `client\dist` and reload the tab. If the extension was reloaded while the tab was open, the console says so: reload the tab. |
| Port already in use | Close the old terminal, or stop the process on 5000, 5173 or 5500. |
| Everything is broken | Show the unit tests passing: `npm --prefix client test`. |

## Rehearsal record (Step 111)

The whole script was rehearsed twice, end to end, on the production build, in a real Chrome with a test script doing the clicking:

| Run | Backend | Network | Result | Machine time for every action |
| --- | --- | --- | --- | --- |
| 1 | real AI agent (`USE_STUB=false`) | online | all checks pass (TC-03 came back Malicious, so its link was dead) | 17.2 s |
| 2 | stub (`USE_STUB=true`) | internet blocked (only localhost reachable, `example.com` unreachable) | all checks pass (TC-03 amber, its link asked first) | 7.8 s |

What this does and does not prove:

- It proves every step of the script works in both modes, including with no internet. Run 2 had no network at all.
- The machine time is just the clicking. The 3 minutes is **your speaking time**, which a script cannot measure. The table above sums to 2:50, so rehearse it once out loud with a stopwatch.
- The real AI took a few seconds per answer, so the first screen takes longer to settle than with the stub: wait until no grey "Checking..." badges are left before you start talking.
