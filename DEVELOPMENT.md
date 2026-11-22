# Development Disclosure

MeaningLayer's underlying idea predates this event. The standalone implementation in this repository was developed during the event window.

Event-period work includes:

- A protected-span workflow that masks sender-selected source text before a model call and reconstructs it locally.
- Fail-closed checks for stale/overlapping selections and altered, missing, duplicated, or reordered markers.
- A prompt-output leakage guard and a lexical change ledger for negation, quantity, date/time, and modality/condition cues.
- A responsive browser interface, synthetic test cases, and the evaluation record in `EVALUATION_2026-11-22.md`.

The app is plain HTML, CSS, and JavaScript. It does not include code from Aura, Cogram, or another core project.
