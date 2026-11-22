# AI Disclosure

## AI in the product

- The prototype optionally calls Chrome's built-in Prompt API when the browser reports that its on-device model is available.
- The project does not download or train a model. The sample uses English. Chinese text is not sent to this API because it is outside the language set documented by Chrome for this feature.
- The user can select exact text spans to protect. Those selected characters are replaced with markers before the model call and restored locally afterward. The app rejects outputs that alter, omit, duplicate, or reorder those markers, or that match known prompt-instruction leakage patterns.
- No message is automatically sent, stored, or transmitted by the app. The manual copy-prompt route is optional and would be subject to the selected provider's own privacy terms.

## AI used during development

An AI coding assistant contributed to brainstorming, implementation drafting, and debugging. The submitted code was checked with automated tests and local Chrome browser runs; this disclosure does not claim that the entrant independently reviewed every generated line. No model training was performed.

## Limits

Marker integrity is a deterministic string-level guarantee for selected spans only. It is not a guarantee that the surrounding rewrite preserves the same meaning. The lexical ledger is a review aid, not a semantic verifier or safety certification.
