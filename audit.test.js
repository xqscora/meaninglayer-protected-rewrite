import test from "node:test";
import assert from "node:assert/strict";
import { assertDraftOnly, auditRewrite, buildPrompt, maskLockedSegments, restoreLockedSegments } from "./audit.js";

const pairs = [
  ["I may finish 3 items by Friday.", "I will finish 4 items by Saturday.", ["may", "3 items", "friday"], ["will", "4 items", "saturday"]],
  ["我可能周五前完成最多三份。", "我会周六前完成四份。", ["可能", "最多", "周五", "三份"], ["会", "周六", "四份"]],
  ["I cannot submit unless the data is checked.", "I can submit after the data is checked.", ["cannot", "unless"], ["can"]],
  ["The meeting may last 20 minutes on May 22.", "The meeting will last 20 minutes on May 22.", ["may"], ["will"]],
  ["我不会在周一提交两份。", "我会在周一提交两份。", ["不会"], ["会"]],
  ["Send at most 5 copies before 4 pm.", "Send at least 5 copies before 4 pm.", ["at most"], ["at least"]],
  ["If approved, we could publish on June 3.", "We will publish on June 3.", ["if", "could"], ["will"]],
  ["我至少需要两天，才可能完成。", "我需要两天，会完成。", ["至少", "才", "可能"], ["会"]],
  ["Do not add 2 names.", "Add 2 names.", ["not"], []],
  ["最多3人可参加。", "至少3人可参加。", ["最多"], ["至少"]],
  ["I should send the draft on June 4.", "I must send the draft on June 4.", ["should"], ["must"]],
  ["We could meet at 10:30.", "We will meet at 11:30.", ["could", "10:30"], ["will", "11:30"]],
  ["I won't share the file unless approved.", "I will share the file when approved.", ["won't", "unless"], ["will"]],
  ["Keep it below 8 people.", "Keep it below 12 people.", ["8 people"], ["12 people"]],
  ["我也许周二后回复。", "我会周三前回复。", ["也许", "周二"], ["会", "周三"]],
  ["仅限两人参加。", "三人可以参加。", ["仅", "两人"], ["三人", "可以"]],
  ["No more than 2 revisions are allowed.", "At least 2 revisions are allowed.", ["no", "no more than"], ["at least"]],
  ["The event starts at 9 am on December 1.", "The event starts at 9 am on December 2.", ["december 1"], ["december 2"]],
  ["I might send 1 or 2 files.", "I will send 2 files.", ["might", "1"], ["will"]],
  ["如果对方同意，我可以加入。", "对方同意后，我会加入。", ["如果", "可以"], ["会"]],
  ["We need 30 minutes, not 45.", "We need 45 minutes, not 30.", ["30 minutes", "45"], ["45 minutes", "30"]],
  ["The price may be under $20.", "The price will be over $20.", ["may"], ["will"]],
  ["I have not replied by 6 pm.", "I have replied by 6 pm.", ["not"], []],
  ["至少需要7天。", "最多需要7天。", ["至少"], ["最多"]],
  ["We can cancel before March 10.", "We cannot cancel after March 10.", ["can"], ["cannot"]],
  ["She may bring 2 guests on Friday.", "She may bring 3 guests on Friday.", ["2 guests"], ["3 guests"]],
  ["最多五份，不能超过周四。", "最多五份，可以延至周五。", ["不能", "周四"], ["可以", "周五"]],
  ["If the test passes, we may release version 2.", "We will release version 3 if the test passes.", ["may", "2"], ["will", "3"]],
  ["I don't need a reply today.", "I do need a reply today.", ["don't"], []],
  ["会议不得晚于下午三点。", "会议应当在下午四点结束。", ["不得", "下午三点"], ["应当", "下午四点"]],
];

for (const [index, [source, candidate, removed, added]] of pairs.entries()) {
  test(`case ${index + 1}: exposes expected changed cues`, () => {
    const result = auditRewrite({ source, candidate });
    const tokens = (key) => result.signals.flatMap((signal) => signal[key]);
    for (const token of removed) assert.ok(tokens("removed").includes(token), `missing removed cue ${token}`);
    for (const token of added) assert.ok(tokens("added").includes(token), `missing added cue ${token}`);
  });
}

test("cue order changes do not create a false alarm", () => {
  const result = auditRewrite({ source: "I may finish 3 items on Friday.", candidate: "On Friday, I may finish 3 items." });
  assert.deepEqual(result.signals, []);
});

test("duplicate cue counts remain visible", () => {
  const result = auditRewrite({ source: "I may, and may not, attend.", candidate: "I may attend." });
  assert.deepEqual(result.signals.find((item) => item.label === "Negation").removed, ["not"]);
  assert.deepEqual(result.signals.find((item) => item.label === "Modality / condition").removed, ["may"]);
});

test("self-advocacy example exposes request-wording changes without making a semantic verdict", () => {
  const source = "Please include my name in the acknowledgements and credit me for that contribution.";
  const candidate = "If there is room, I would appreciate a brief mention.";
  const result = auditRewrite({ source, candidate });
  const requestCues = result.signals.find((item) => item.label === "Request / recognition wording");
  assert.deepEqual(requestCues.removed, ["please", "include my name", "credit me"]);
  assert.deepEqual(requestCues.added, ["i would appreciate"]);
  assert.match(result.limitation, /do not determine scope/);
});

test("constraint phrases are review prompts, not semantic verdicts", () => {
  const result = auditRewrite({ source: "I cannot send it yet.", candidate: "I will send it.", constraints: [
    { id: "keep", kind: "preserve", text: "cannot send" },
    { id: "avoid", kind: "avoid", text: "will send" },
  ] });
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.avoidFound, 1);
  assert.match(result.limitation, /do not determine scope/);
});

test("locked text is replaced with a marker before model input and restored exactly", () => {
  const source = "I may finish by Friday; I will not submit without approval.";
  const phrase = "I will not submit without approval";
  const start = source.indexOf(phrase);
  const masked = maskLockedSegments(source, [{ start, end: start + phrase.length, text: phrase }]);
  assert.equal(masked.maskedText, "I may finish by Friday; [[LOCKED_SEGMENT_1]].");
  assert.ok(!masked.maskedText.includes(phrase));
  assert.equal(restoreLockedSegments("I expect to finish by Friday; [[LOCKED_SEGMENT_1]].", masked.segments), "I expect to finish by Friday; I will not submit without approval.");
});

test("locked marker is fail-closed when missing, duplicated, or changed", () => {
  const source = "A locked phrase.";
  const masked = maskLockedSegments(source, [{ start: 0, end: source.length, text: source }]);
  for (const output of ["No marker.", "[[LOCKED_SEGMENT_1]] [[LOCKED_SEGMENT_1]]", "[[LOCKED_SEGMENT_2]]"]) {
    assert.throws(() => restoreLockedSegments(output, masked.segments));
  }
});

test("locked markers must remain in original order", () => {
  const source = "First clause. Second clause.";
  const first = "First clause.";
  const second = "Second clause.";
  const masked = maskLockedSegments(source, [
    { start: source.indexOf(first), end: source.indexOf(first) + first.length, text: first },
    { start: source.indexOf(second), end: source.indexOf(second) + second.length, text: second },
  ]);
  assert.throws(() => restoreLockedSegments("[[LOCKED_SEGMENT_2]] [[LOCKED_SEGMENT_1]]", masked.segments), /reordered/);
});

test("prompt instruction leakage is rejected instead of entering the candidate", () => {
  assert.equal(assertDraftOnly("I may reply on Friday."), "I may reply on Friday.");
  assert.throws(() => assertDraftOnly("I will reply Friday.\n\nDo not send it."), /output was rejected/);
  assert.throws(() => assertDraftOnly("Required markers in order: (none)"), /output was rejected/);
});

test("stale and overlapping selections are rejected", () => {
  const source = "alpha beta gamma";
  assert.throws(() => maskLockedSegments(source, [{ start: 0, end: 5, text: "other" }]));
  assert.throws(() => maskLockedSegments(source, [
    { start: 0, end: 10, text: "alpha bet" },
    { start: 6, end: 10, text: "beta" },
  ]));
});

test("prompt contains masked source and marker instructions, not protected text", () => {
  const source = "I may reply Friday; I will not disclose the draft.";
  const phrase = "I will not disclose the draft";
  const start = source.indexOf(phrase);
  const masked = maskLockedSegments(source, [{ start, end: start + phrase.length, text: phrase }]);
  const prompt = buildPrompt({ source: masked.maskedText, markers: masked.segments.map((item) => item.marker) });
  assert.ok(!prompt.includes(phrase));
  assert.match(prompt, /Preserve every bracketed LOCKED_SEGMENT marker exactly once/);
  assert.ok(!prompt.includes("This is a draft for human review"));
});
