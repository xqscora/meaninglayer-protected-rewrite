# Event-v1 lexical cue check — 2026-11-22

## Protocol

- Thirty authored English/Chinese source-candidate pairs changed at least one targeted lexical cue. Each test specifies expected removed and/or added cue strings.
- Nine additional checks cover cue order and counts, exact phrase cues, lock masking/restoration, fail-closed marker and order handling, stale/overlapping selections, prompt leakage, and prompt contents.
- Run: `node --test audit.test.js` (Node.js test runner).

## Result

- **30/30** authored pairs exposed every expected cue token in the removal/addition ledger.
- **9/9** additional behavior checks passed.
- Total: **39/39 tests passed**.
- Browser verification confirmed the app loads the example, displays protected text, and separates removed/added lexical cues.
- Chrome 157 exposed `LanguageModel`; `availability()` returned `available` for English text input/output without requesting or starting a model download. Availability is device/profile-specific.
- One synthetic English smoke input produced: “I anticipate completing the report by Friday, though final submission isn't guaranteed.” For source “I may finish the report by Friday, but I cannot promise submission,” the ledger flagged `may` as removed, `isn't` as added, and the user-specified exact phrase `may finish` as missing. This shows the review path can surface at least one paraphrased wording change; it does **not** establish semantic correctness. The phrase-only avoid check did not match the paraphrase “isn't guaranteed,” demonstrating a known blind spot.
- A separate five-case synthetic English prompt stress check supplied 12 required literal phrase spans. Under the prompt version that explicitly requested exact copying, 4/12 spans appeared exactly in the generated outputs. At least one output also leaked instruction text into the candidate. This is a small authored stress check, not a representative model benchmark; paraphrases may preserve meaning, and exact-string misses do not prove semantic loss. It does show that the current prompt and review flow do not reliably enforce literal constraints and that the output still needs close human review. The five-case result is separate from the earlier single smoke test, which used a different prompt protocol.
- The prompt-only failure led to an event-period design change: the sender can select exact source spans to protect; `maskLockedSegments` replaces them with ordered markers before any model call, and `restoreLockedSegments` fails closed if a marker is changed, missing, duplicated, or reordered. The model receives the unprotected context but not the selected literal text. A prompt-output guard rejects known instruction leakage. Automated checks cover the masking, exact restoration, stale/overlapping selections, marker failure, and known prompt leakage paths.
- Four live Chrome Prompt API examples were then run through the protected-span flow. Each returned the selected span exactly after local reconstruction. In one example, the model moved an `if` clause after an offer; the cue ledger marked a modality change but cannot determine whether the reordering changed the promise's scope. In another, the model mostly retained the input wording. These examples show a working mechanism and a concrete limitation, not a semantic-quality estimate.

## Interpretation and limits

This evaluates exact lexical cue handling on authored cases, not meaning preservation. The cases are not a representative corpus, independent annotation study, model benchmark, or user study. The detector can miss context and paraphrase, and it can flag harmless changes. It does not infer semantic scope or certify a rewrite. The four live examples are failure-finding demonstrations, not a model-quality estimate; one showed a potentially consequential condition-order change despite exact restoration of the protected clause. Semantic preservation, user value, and a controlled comparison with a plain rewrite workflow remain unmeasured. Chinese is not passed to the currently documented Chrome model languages; the separate copy-prompt option can invoke a provider chosen by the user, subject to that provider's terms.

## Event-work boundary

The MeaningLayer idea predates the event. The `event-v1/` implementation, interface, tests, and this evaluation were created after the official window opened. No private message, account data, or external service was used in the demo.
