// Cleans the text of an email before it becomes a ticket or a reply:
// removes quoted old messages, signatures and legal disclaimers.
// The ORIGINAL text is always kept separately (raw_body). If cleaning would leave nothing,
// the original text is used instead ("fail safe").

// Control characters (Postgres cannot store the NUL character at all)
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Line breaks fixed, control characters removed, trimmed and cut to a maximum length. */
export function sanitizeBody(s: string, max: number): string {
  return s.replace(/\r\n?/g, '\n').replace(CTRL, '').trim().slice(0, max);
}

/** A ticket title from an email subject: no [HD-n] tags, no "Re:" / "Fwd:" prefixes, one line, max 200. */
export function cleanSubject(subject: string): string {
  let s = subject.replace(/[\r\n\t]+/g, ' ').replace(CTRL, '').replace(/\[HD-\d+\]/gi, ' ');
  for (;;) {
    const next = s.replace(/^\s*(re|fw|fwd|aw|sv|vs|ref)\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export interface CleanOptions {
  /**
   * Names of the sender (the account name and the name in the From header).
   * After some real text, a line that is exactly one of these names starts the signature.
   */
  names?: string[];
}

// ---------- small helpers ----------

/** Removes leading junk (quote marks, bullets, asterisks) so '"This email ...' is still recognized. */
function stripLead(line: string): string {
  return line.replace(/^[\s"'“”‘’*_|•·]+/, '').trim();
}

/** Lowercase letters and digits only, single spaces: "Aqil  Mustaqim." -> "aqil mustaqim" */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- what marks the start of "old stuff" ----------

const REPLY_INTRO = /^on\s.+\swrote:\s*$/i; // "On Mon, 12 Oct 2026 at 3:04 PM Ali <ali@x.com> wrote:"
const REPLY_INTRO_OTHER = /^(pada|am|le|el)\s.+(menulis|schrieb|a écrit|escribió):\s*$/i;
const ORIGINAL_MESSAGE = /^-{2,}\s*(original message|forwarded message|mesej asal)\s*-{2,}$/i;
const OUTLOOK_RULE = /^_{10,}$/;
const SENT_FROM = /^(sent from my |get outlook for |sent via |sent from outlook|sent from mail for windows)/i;
const DISCLAIMER =
  /^(disclaimer\b|confidentiality notice|confidential(ity)? (notice|statement)|this (e-?mail|message|communication|transmission)\b.{0,200}\b(confidential|privileged|intended|proprietary)|the information (contained )?(in|within|transmitted)|if you are not the intended (recipient|addressee)|please consider the environment|think before you print)/i;
const CLOSING =
  /^(thanks|thank you|thanks and regards|many thanks|regards|best regards|kind regards|warm regards|best|cheers|sincerely|yours sincerely|yours faithfully|terima kasih|salam)[,.!]?$/i;

/** "On ... wrote:" can wrap over two or three lines in some mail programs. */
function isReplyIntro(lines: string[], i: number): boolean {
  const first = lines[i].trim();
  if (REPLY_INTRO.test(first) || REPLY_INTRO_OTHER.test(first)) return true;
  if (!/^(on|pada|am|le|el)\s/i.test(first)) return false;
  let joined = first;
  for (let k = 1; k <= 2 && i + k < lines.length; k++) {
    joined += ` ${lines[i + k].trim()}`;
    if (REPLY_INTRO.test(joined) || REPLY_INTRO_OTHER.test(joined)) return true;
  }
  return false;
}

/** An Outlook-style block:  From: ...  Sent: ...  To: ...  Subject: ... */
function isHeaderBlock(lines: string[], i: number): boolean {
  if (!/^from:\s/i.test(lines[i].trim())) return false;
  const next = lines.slice(i + 1, i + 7).map((l) => l.trim());
  return next.some((l) => /^(sent|date):\s/i.test(l)) && next.some((l) => /^(to|subject):\s/i.test(l));
}

// ---------- recognizing a signature block (name, job title, phone, company, address) ----------

// STRONG signs: things that almost only appear in signatures
const MAILTO = /mailto:/i;
const LABEL = /^(e|m|t|w|f|tel|telephone|phone|mobile|mob|hp|fax|email|e-mail|web|website|address)\s*[.:)\-]\s*\S/i;
const COMPANY = /\b(sdn\.?\s*bhd|berhad|bhd|pte\.?\s*ltd|ltd|llc|gmbh|corporation)\b/i;
const REG_NO = /\(\s*\d{4,}\s*-\s*[A-Za-z]\s*\)/; // (949294-W)

// WEAK signs: also found in normal messages, so they only count together with a strong one
const PHONE = /(\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]?\d{3,4}/;
const URL_RE = /\b(https?:\/\/|www\.)\S+/i;
const EMAIL_ADDR = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/;
const ADDRESS = /\b(jalan|jln|lorong|suite|tingkat|menara|wisma|bangunan)\b|\b\d{5}\s+[A-Z][a-z]+/;

function signal(line: string): { strong: boolean; weak: boolean } {
  const t = stripLead(line);
  return {
    strong: MAILTO.test(t) || LABEL.test(t) || COMPANY.test(t) || REG_NO.test(t),
    weak: PHONE.test(t) || URL_RE.test(t) || EMAIL_ADDR.test(t) || ADDRESS.test(t),
  };
}

/** The index of the first line that starts old stuff, a signature or a disclaimer; lines.length when none. */
function findCut(lines: string[], names: Set<string>): number {
  let seenContent = false;
  let hard = lines.length;

  // Pass 1: clear markers (quotes, disclaimers, "Sent from my", "Regards,", the sender's own name)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('>')) continue; // blank and quoted lines are not new content
    const norm = stripLead(line);

    if (
      isReplyIntro(lines, i) ||
      ORIGINAL_MESSAGE.test(line) ||
      OUTLOOK_RULE.test(line) ||
      isHeaderBlock(lines, i) ||
      /^--$/.test(line) // the standard signature separator "-- "
    ) {
      hard = i;
      break;
    }

    if (seenContent) {
      if (SENT_FROM.test(norm) || DISCLAIMER.test(norm) || names.has(normName(norm))) {
        hard = i;
        break;
      }
      // A closing like "Thanks," starts a signature only when little follows
      if (CLOSING.test(norm)) {
        const after = lines.slice(i + 1).filter((l) => l.trim() !== '').length;
        if (after <= 8) {
          hard = i;
          break;
        }
      }
    }
    seenContent = true;
  }

  // Pass 2: a block of contact lines (even without "Regards," or the sender's name above it)
  const idx: number[] = []; // positions of the real (non-blank, non-quoted) lines before the cut
  for (let i = 0; i < hard; i++) {
    const t = lines[i].trim();
    if (t !== '' && !t.startsWith('>')) idx.push(i);
  }
  const sig = idx.map((i) => signal(lines[i]));

  for (let k = 1; k < idx.length; k++) {
    if (!sig[k].strong) continue; // the block must START with a strong sign (E.  M.  Tel:  company ...)

    // at least two signature-looking lines in the next 8 lines
    let signalLines = 0;
    for (let w = k; w < Math.min(idx.length, k + 8); w++) {
      if (sig[w].strong || sig[w].weak) signalLines++;
    }
    if (signalLines < 2) continue;

    // Include up to two short lines just above (the name and the job title),
    // but ALWAYS keep the first line of real text.
    let start = k;
    for (let back = 1; back <= 2 && k - back >= 1; back++) {
      const t = lines[idx[k - back]].trim();
      if (t.length <= 60 && !/[.!?:;]$/.test(t)) start = k - back;
      else break;
    }
    return idx[start];
  }

  return hard;
}

/** The new text of an email, without quotes, signature or disclaimer. */
export function cleanBody(raw: string, opts: CleanOptions = {}): string {
  const original = raw.replace(/\r\n?/g, '\n').replace(/\[cid:[^\]]*\]/gi, '');
  const names = new Set((opts.names ?? []).map(normName).filter((n) => n.length >= 3));
  const lines = original.split('\n');
  const cut = findCut(lines, names);

  const kept = lines
    .slice(0, cut)
    .filter((l) => !/^\s*>/.test(l)) // drop quoted lines
    .join('\n')
    .replace(/<mailto:[^>]*>/gi, '') // link clutter from Outlook
    .replace(/<(https?:\/\/[^>\s]+)>/gi, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return kept || original.trim(); // fail safe: never end up with nothing when there was something
}