import { assertDraftOnly, auditRewrite, buildPrompt, maskLockedSegments, restoreLockedSegments } from "./audit.js";

const sourceText = document.querySelector("#sourceText");
const candidateText = document.querySelector("#candidateText");
const constraints = document.querySelector("#constraints");
const template = document.querySelector("#constraintTemplate");
const results = document.querySelector("#results");
const lockedList = document.querySelector("#lockedList");
let lockedSegments = [];

function renderLocks() {
  lockedList.replaceChildren();
  if (!lockedSegments.length) {
    const hint = document.createElement("span");
    hint.className = "lock-hint";
    hint.textContent = "Select a commitment, condition, date, or quantity in the original, then protect it.";
    lockedList.append(hint);
    return;
  }
  for (const [index, segment] of lockedSegments.entries()) {
    const item = document.createElement("div");
    item.className = "locked-item";
    const text = document.createElement("span");
    text.textContent = `${index + 1}. ${segment.text}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.title = "Remove protection";
    remove.setAttribute("aria-label", "Remove protection");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      lockedSegments = lockedSegments.filter((entry) => entry !== segment);
      renderLocks();
    });
    item.append(text, remove);
    lockedList.append(item);
  }
}

function addConstraint(kind = "preserve", text = "") {
  const fragment = template.content.cloneNode(true);
  const row = fragment.querySelector(".constraint-row");
  row.querySelector("select").value = kind;
  row.querySelector("input").value = text;
  row.querySelector(".remove-button").addEventListener("click", () => row.remove());
  constraints.append(fragment);
}

function readConstraints() {
  return [...constraints.querySelectorAll(".constraint-row")].map((row, index) => ({
    id: `constraint-${index + 1}`,
    kind: row.querySelector("select").value,
    text: row.querySelector("input").value.trim(),
  })).filter((item) => item.text);
}

function row(label, detail, status, markerText = status.toUpperCase()) {
  const element = document.createElement("div");
  element.className = "ledger-row";
  const name = document.createElement("strong");
  name.textContent = label;
  const value = document.createElement("span");
  value.textContent = detail;
  const marker = document.createElement("b");
  marker.className = status;
  marker.textContent = markerText;
  element.append(name, value, marker);
  return element;
}

function render(result) {
  const constraintList = document.querySelector("#constraintResults");
  const riskList = document.querySelector("#riskResults");
  constraintList.replaceChildren();
  riskList.replaceChildren();
  document.querySelector("#resultSummary").textContent = `${result.summary.removed} removed cue(s) · ${result.summary.added} added cue(s) · ${result.summary.missing} required exact phrase(s) not found · ${result.summary.avoidFound} avoid phrase(s) found`;
  for (const check of result.checks) {
    const matched = check.status === "matched" || check.status === "clear";
    const marker = check.kind === "preserve"
      ? (matched ? "EXACT PHRASE FOUND" : "EXACT PHRASE NOT FOUND")
      : (matched ? "AVOID PHRASE NOT FOUND" : "AVOID PHRASE FOUND");
    constraintList.append(row(check.kind === "preserve" ? "Must preserve exactly" : "Must not imply", check.text, matched ? "unchanged" : "removed", marker));
  }
  for (const signal of result.signals) {
    if (signal.removed.length) riskList.append(row(signal.label, signal.removed.join(" · "), "removed"));
    if (signal.added.length) riskList.append(row(signal.label, signal.added.join(" · "), "added"));
  }
  if (!result.signals.length && !result.checks.some((item) => item.status === "missing" || item.status === "present")) {
    riskList.append(row("Checked cues", "No lexical change detected in these groups.", "unchanged"));
  }
  results.hidden = false;
}

document.querySelector("#addConstraintButton").addEventListener("click", () => addConstraint());
sourceText.addEventListener("input", () => {
  if (!lockedSegments.length) return;
  lockedSegments = [];
  renderLocks();
  document.querySelector("#promptStatus").textContent = "Original text changed. Protected selections were cleared; select them again.";
});
document.querySelector("#lockSelectionButton").addEventListener("click", () => {
  const start = sourceText.selectionStart;
  const end = sourceText.selectionEnd;
  if (start === end) {
    document.querySelector("#promptStatus").textContent = "Select the exact text to protect first.";
    return;
  }
  const segment = { start, end, text: sourceText.value.slice(start, end) };
  const overlaps = lockedSegments.some((item) => start < item.end && end > item.start);
  if (overlaps) {
    document.querySelector("#promptStatus").textContent = "That selection overlaps text already protected.";
    return;
  }
  lockedSegments = [...lockedSegments, segment].sort((a, b) => a.start - b.start);
  renderLocks();
  document.querySelector("#promptStatus").textContent = "Protected locally. This exact text is replaced by a marker before the AI call.";
});
document.querySelector("#auditButton").addEventListener("click", () => {
  if (!sourceText.value.trim() || !candidateText.value.trim()) {
    document.querySelector("#resultSummary").textContent = "Enter both the original and candidate rewrite first.";
    results.hidden = false;
    return;
  }
  render(auditRewrite({ source: sourceText.value, candidate: candidateText.value, constraints: readConstraints() }));
});
document.querySelector("#localAIButton").addEventListener("click", async () => {
  const status = document.querySelector("#promptStatus");
  if (!sourceText.value.trim()) {
    status.textContent = "Add an original message first.";
    return;
  }
  if (/[\u3400-\u9fff]/u.test(`${sourceText.value}\n${readConstraints().map((item) => item.text).join(" ")}`)) {
    status.textContent = "Chrome's documented on-device Prompt API languages do not currently include Chinese. Use the copy-prompt flow for Chinese text.";
    return;
  }
  if (!globalThis.LanguageModel) {
    status.textContent = "This Chrome profile does not expose the on-device Prompt API. Your text has not been sent anywhere.";
    return;
  }

  const options = {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
  };
  try {
    status.textContent = "Checking local model availability…";
    const availability = await LanguageModel.availability(options);
    if (availability !== "available") {
      status.textContent = availability === "downloading"
        ? "Chrome is still preparing its local model. This app will not start or manage the download."
        : "The on-device model is not ready. This app will not start a model download; use the copy-prompt option instead.";
      return;
    }
    const { maskedText, segments } = maskLockedSegments(sourceText.value, lockedSegments);
    status.textContent = "Drafting on this device… Protected text stays in this tab.";
    const session = await LanguageModel.create(options);
    try {
      const maskedDraft = await session.prompt(buildPrompt({ source: maskedText, markers: segments.map((item) => item.marker) }));
      candidateText.value = assertDraftOnly(restoreLockedSegments(maskedDraft, segments));
    } finally {
      session.destroy();
    }
    render(auditRewrite({ source: sourceText.value, candidate: candidateText.value, constraints: readConstraints() }));
    status.textContent = "Local draft ready. Inspect every flagged change before using it; the model can still alter meaning.";
  } catch (error) {
    status.textContent = `Local draft failed (${error.name || "unknown error"}). The original remains unchanged; no external request was made.`;
  }
});
document.querySelector("#copyPromptButton").addEventListener("click", async () => {
  let prompt;
  try {
    const { maskedText, segments } = maskLockedSegments(sourceText.value, lockedSegments);
    prompt = buildPrompt({ source: maskedText, markers: segments.map((item) => item.marker) });
  } catch (error) {
    document.querySelector("#promptStatus").textContent = error.message;
    return;
  }
  try {
    await navigator.clipboard.writeText(prompt);
    document.querySelector("#promptStatus").textContent = "Prompt copied. If you paste it into another AI, that provider's privacy rules apply.";
  } catch {
    window.prompt("Copy this prompt into your chosen AI:", prompt);
  }
});
document.querySelector("#sampleButton").addEventListener("click", () => {
  sourceText.value = "I may finish at most three copies by Friday; if the data is not confirmed, I will not submit.";
  candidateText.value = "";
  const protectedText = "if the data is not confirmed, I will not submit";
  const start = sourceText.value.indexOf(protectedText);
  lockedSegments = [{ start, end: start + protectedText.length, text: protectedText }];
  renderLocks();
  constraints.replaceChildren();
  addConstraint("preserve", "if the data is not confirmed");
  addConstraint("preserve", "I will not submit");
  addConstraint("avoid", "I will submit");
  results.hidden = true;
});
addConstraint("preserve");
addConstraint("avoid");
renderLocks();
