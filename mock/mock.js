// Mock WhatsApp Web page script (plain JavaScript). It only imitates how new messages arrive after
// page load. It does NOT contain any ScamGuard logic: the extension's content script does the scanning.
(function () {
  'use strict';

  var pane = document.getElementById('chat-pane');
  var initialHTML = pane.innerHTML; // the original TC-01 to TC-11 bubbles, restored by "Reset chat"
  var counter = 0; // makes every dynamic message unique

  var SCAM_TEXTS = [
    'Dear customer, your HDFC account is suspended. Verify KYC immediately: http://hdfc-kyc-verify.top/login',
    'URGENT: Your electricity will be disconnected tonight. Pay Rs 10 now at http://bit.ly/pay-bill-now',
    'Congratulations! You won the KBC lottery of Rs 50,00,000. Send your bank details to claim the prize.',
    'Your parcel is held at customs. Pay a Rs 49 fee to release it: http://india-post-fee.xyz/pay',
    'Share the OTP you just received to confirm your refund of Rs 2,499.'
  ];
  var SAFE_TEXTS = [
    'Good morning! Did you reach home safely?',
    'Can you send me the photos from yesterday?',
    'Lunch at 1 pm works for me.',
    'Happy birthday! Have a wonderful day.',
    'I will call you after the meeting.'
  ];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function nowParts() {
    var d = new Date();
    return {
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      date: pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear()
    };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Builds an incoming text bubble with the same structure as the static ones.
  function buildTextBubble(text) {
    var t = nowParts();
    var row = el('div', 'message-in');
    row.setAttribute('data-dynamic', '1');
    var bubble = el('div', 'bubble');
    var copyable = el('div', 'copyable-text');
    copyable.setAttribute('data-pre-plain-text', '[' + t.time + ', ' + t.date + '] Mock Sender: ');
    var span = el('span', 'selectable-text copyable-text');
    // Turn any http(s) URL into a real <a href>, like WhatsApp does.
    var parts = text.split(/(https?:\/\/\S+)/g);
    parts.forEach(function (part) {
      if (/^https?:\/\//.test(part)) {
        var a = el('a', '', part);
        a.setAttribute('href', part);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        span.appendChild(a);
      } else if (part) {
        span.appendChild(document.createTextNode(part));
      }
    });
    copyable.appendChild(span);
    bubble.appendChild(copyable);
    bubble.appendChild(el('span', 'timestamp', t.time));
    row.appendChild(bubble);
    return row;
  }

  // Builds an incoming file-attachment bubble (no span.selectable-text), like TC-10.
  function buildAttachmentBubble(fileName, kind, meta) {
    var t = nowParts();
    var row = el('div', 'message-in');
    row.setAttribute('data-dynamic', '1');
    var bubble = el('div', 'bubble');
    var doc = el('div', 'document-attachment');
    var icon = el('span', 'attachment-icon', kind);
    icon.setAttribute('aria-hidden', 'true');
    var info = el('div', 'attachment-info');
    info.appendChild(el('span', 'attachment-filename', fileName));
    info.appendChild(el('span', 'attachment-meta', meta));
    var download = el('a', 'attachment-download', '\u21E9');
    download.setAttribute('href', '#mock-download-' + fileName);
    download.setAttribute('download', fileName);
    download.setAttribute('aria-label', 'Download');
    doc.appendChild(icon);
    doc.appendChild(info);
    doc.appendChild(download);
    bubble.appendChild(doc);
    bubble.appendChild(el('span', 'timestamp', t.time));
    row.appendChild(bubble);
    return row;
  }

  function append(row) {
    pane.appendChild(row);
    pane.scrollTop = pane.scrollHeight;
  }

  function nextFrom(list) {
    var text = list[counter % list.length];
    counter += 1;
    return text + ' (#' + counter + ')';
  }

  function addScam() { append(buildTextBubble(nextFrom(SCAM_TEXTS))); }
  function addSafe() { append(buildTextBubble(nextFrom(SAFE_TEXTS))); }

  // Mixed burst of 5 messages in the same tick, to exercise batching in the scanner.
  function addBurst() {
    var fragment = document.createDocumentFragment();
    [SCAM_TEXTS, SAFE_TEXTS, SCAM_TEXTS, SAFE_TEXTS, SCAM_TEXTS].forEach(function (list) {
      fragment.appendChild(buildTextBubble(nextFrom(list)));
    });
    pane.appendChild(fragment);
    pane.scrollTop = pane.scrollHeight;
  }

  function addApk() {
    counter += 1;
    append(buildAttachmentBubble('SBI_Rewards_Update_' + counter + '.apk', 'APK', 'APK, 12 MB'));
  }

  function resetChat() {
    pane.innerHTML = initialHTML;
    pane.scrollTop = 0;
  }

  // Step 33: remove one static bubble and put an identical FRESH node in the same place.
  // The replacement is built from the pristine initial HTML, not cloned from the live node, so
  // attributes, outlines and banners added by the extension are NOT carried over. That is what
  // real WhatsApp does when it re-creates message nodes while scrolling.
  function rerenderBubble() {
    var id = document.getElementById('rerender-target').value;
    var current = pane.querySelector('[data-testcase="' + id + '"]');
    if (!current) return; // the bubble is not in the chat right now (for example it was never restored)
    var template = document.createElement('template');
    template.innerHTML = initialHTML;
    var fresh = template.content.querySelector('[data-testcase="' + id + '"]');
    if (!fresh) return;
    current.replaceWith(fresh);
  }

  function on(id, handler) {
    document.getElementById(id).addEventListener('click', handler);
  }

  on('btn-add-scam', addScam);
  on('btn-add-safe', addSafe);
  on('btn-add-burst', addBurst);
  on('btn-add-apk', addApk);
  on('btn-reset', resetChat);
  on('btn-rerender', rerenderBubble);
})();
