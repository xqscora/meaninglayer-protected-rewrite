const SIGNALS = [
  ["Negation", /\b(?:no|not|never|without|cannot|can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't)\b|不会|不能|并非|从未|尚未|未能|禁止|不|没|未|无/giu],
  ["Quantity", /\b\d+(?:[.,]\d+)?\s*(?:%|minutes?|hours?|days?|items?|people|guests?|copies|files?|revisions?|names?|dollars?)?\b|[零〇一二两三四五六七八九十百千万亿]+(?:点[零〇一二三四五六七八九]+)?(?:份|个|天|小时|分钟|元|人|次|公里|千克|公斤|米|岁|%)/gu],
  ["Date / time", /\b(?:\d{1,2}[:/.]\d{1,2}(?:[:/.]\d{2,4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|(?:20\d{2}年)?\d{1,2}月\d{1,2}(?:日|号)|(?:周|星期)[一二三四五六日天]|(?:上午|下午|晚上|早上)?[零〇一二两三四五六七八九十\d]{1,3}点(?:[零〇一二两三四五六七八九十\d]{1,2}分)?/giu],
  ["Modality / condition", /\b(?:no more than|at least|at most|must|should|may|might|can|could|will|would|if|unless|only)\b|不超过|不少于|至少|至多|最多|不得|必须|应当|应该|可能|也许|可以|能够|不会|不能|如果|除非|只有|仅|需要|须|才|会|将/giu],
];

const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

function extract(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0].trim().toLocaleLowerCase());
}

function multisetDiff(before, after) {
  const remaining = new Map();
  for (const token of after) remaining.set(token, (remaining.get(token) ?? 0) + 1);
  const removed = [];
  for (const token of before) {
    const count = remaining.get(token) ?? 0;
    if (count) remaining.set(token, count - 1);
    else removed.push(token);
  }
  const added = [];
  for (const [token, count] of remaining) {
    for (let i = 0; i < count; i += 1) added.push(token);
  }
  return { removed, added };
}

export function auditRewrite({ source, candidate, constraints = [] }) {
  const candidateText = normalize(candidate);
  const checks = constraints.filter((item) => item.text.trim()).map((item) => {
    const phrase = normalize(item.text);
    const present = candidateText.includes(phrase);
    return { ...item, present, status: item.kind === "preserve" ? (present ? "matched" : "missing") : (present ? "present" : "clear") };
  });

  const signals = SIGNALS.map(([label, pattern]) => {
    const before = extract(source, pattern);
    const after = extract(candidate, pattern);
    const diff = multisetDiff(before, after);
    return { label, ...diff };
  }).filter((item) => item.removed.length || item.added.length);

  return {
    checks,
    signals,
    summary: {
      removed: signals.reduce((sum, item) => sum + item.removed.length, 0),
      added: signals.reduce((sum, item) => sum + item.added.length, 0),
      missing: checks.filter((item) => item.status === "missing").length,
      avoidFound: checks.filter((item) => item.status === "present").length,
    },
    limitation: "These are lexical review cues only. They do not determine scope, resolve paraphrases, or prove that meaning was preserved.",
  };
}

export function maskLockedSegments(source, locks = []) {
  const ordered = [...locks].sort((a, b) => a.start - b.start || a.end - b.end);
  const segments = [];
  let cursor = 0;
  for (const [index, lock] of ordered.entries()) {
    if (!Number.isInteger(lock.start) || !Number.isInteger(lock.end) || lock.start < cursor || lock.end <= lock.start) {
      throw new Error("Protected selections overlap or have invalid boundaries.");
    }
    const exactText = source.slice(lock.start, lock.end);
    if (!exactText || exactText !== lock.text) throw new Error("The source changed after a phrase was protected. Protect it again.");
    const marker = `[[LOCKED_SEGMENT_${index + 1}]]`;
    if (source.includes(marker)) throw new Error("The source contains a reserved protection marker.");
    segments.push({ start: lock.start, end: lock.end, text: exactText, marker });
    cursor = lock.end;
  }
  let maskedText = "";
  cursor = 0;
  for (const segment of segments) {
    maskedText += source.slice(cursor, segment.start) + segment.marker;
    cursor = segment.end;
  }
  maskedText += source.slice(cursor);
  return { maskedText, segments };
}

export function restoreLockedSegments(candidate, segments) {
  let restored = candidate;
  let previousPosition = -1;
  for (const segment of segments) {
    const occurrences = restored.split(segment.marker).length - 1;
    if (occurrences !== 1) throw new Error(`The model changed or duplicated ${segment.marker}; draft was not accepted.`);
    const position = restored.indexOf(segment.marker);
    if (position <= previousPosition) throw new Error("The model reordered protected text; draft was not accepted.");
    previousPosition = position;
    restored = restored.replace(segment.marker, segment.text);
  }
  if (/\[\[LOCKED_SEGMENT_\d+\]\]/u.test(restored)) throw new Error("The model returned an unexpected protection marker; draft was not accepted.");
  return restored;
}

export function assertDraftOnly(candidate) {
  const leaked = [
    /^rewrite the message for clarity\b/im,
    /^required markers in order:/im,
    /^original:\s*$/im,
    /^this is a draft for human review\b/im,
    /^do not send it\.?$/im,
  ].some((pattern) => pattern.test(candidate));
  if (leaked) throw new Error("The model included prompt instructions instead of only a draft; output was rejected.");
  return candidate;
}

export function buildPrompt({ source, markers = [] }) {
  return [
    "Rewrite the message for clarity without adding facts or commitments. Return only the rewritten message. Preserve every bracketed LOCKED_SEGMENT marker exactly once and in its original order; do not interpret or replace markers.",
    `Required markers in order: ${markers.join(", ") || "(none)"}`,
    `Original:\n${source.trim() || "(empty)"}`,
  ].join("\n\n");
}
