# MeaningLayer: Protected Rewrite Review

An event-period, standalone browser prototype seeded by the pre-event MeaningLayer idea. It lets a sender protect exact parts of a message before asking an on-device model to rewrite the remaining text, then inspect a lexical change ledger before using the draft.

## Run

Requires Node.js 18+ for tests. The app itself is static:

```powershell
node --test audit.test.js
python -m http.server 8521
```

Open `http://127.0.0.1:8521/` from this directory.

## What it does

- Uses Chrome's built-in Prompt API for English-only drafts when `LanguageModel.availability()` reports `available`; the app never starts a model download.
- The sender selects exact spans to protect. The app replaces them with markers before the model call and restores the original spans locally. It rejects a draft if any marker is missing, duplicated, altered, reordered, or stale.
- A live model-input preview shows the exact prompt text, including markers in place of protected spans, before the local model call.
- Rejects known prompt-instruction leakage instead of placing that output into the candidate field.
- Compares source and candidate for changed lexical cues in negation, quantity, date/time, and modality/condition groups.
- Reports removed and added cues separately, independent of word order.
- Optional preserve/avoid phrases are exact-string review cues only; they are not semantic judgments or enforcement rules.
- Keeps text in the current browser tab; the app does not store or transmit messages. The built-in model runs on-device; nothing is auto-sent.
- Offers a manual prompt-copy path for another provider; pasted text is then subject to that provider's own privacy terms.

## Limits

This is not semantic parsing. It cannot determine negation scope, distinguish every contextual use, reliably match paraphrases, or establish equivalence. A cue can be harmless or misleading in context; a locked span can remain verbatim while surrounding text changes its implication. One observed model output moved a condition after an offer, and the ledger only showed a changed modality cue. The sender must inspect the full original and candidate; the report is a checklist, not a safety certification. The documented Chrome model languages currently do not include Chinese; Chinese input uses the manual prompt path. The local model may be unavailable on other devices, and this app will not trigger a download.

The project comes from a pre-event MeaningLayer/ClarityIME concept. This independent implementation, protected-span protocol, tests, interface, and evaluation are event-period work. Do not claim the seed concept itself was created during the event. The 30-case evaluation measures lexical cue detection only; it is not a user study or semantic-accuracy benchmark. An earlier prompt-only stress check retained 4 of 12 required phrases verbatim and leaked instruction text. The current app instead withholds protected spans and validates markers, but only four live local-model examples have been checked; one showed a condition-order drift. These small checks are not representative benchmarks and establish neither semantic accuracy nor product advantage.

## Rights and disclosures

See [AI_DISCLOSURE.md](AI_DISCLOSURE.md), [DEVELOPMENT.md](DEVELOPMENT.md), and [RIGHTS.md](RIGHTS.md). The public repository grants no reuse license.
