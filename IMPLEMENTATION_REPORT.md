# Implementation Report

## Architecture

The extension is AI-first: it captures a job page, sends it with the PDF-derived
CV to a model the user chooses, validates the reply, and renders it. There is no
local scoring path.

| Module | Responsibility |
| --- | --- |
| `src/extraction` | Self-contained page extractor, JSON-LD / semantic / text fallbacks, and the quality gate that decides whether text is a usable job description |
| `src/profile` | Locally bundled PDF.js extraction with size, page, and text limits |
| `src/ai` | Direct provider calls from the panel, and the permission handling they require |
| `src/bridge` | Client for the loopback bridge used by the CLI providers |
| `src/ui` | English/Chinese strings and the pure analysis view |
| `src/privacy` | Redaction preview for the optional payload |
| `bridge/src` | Bridge server, provider adapters, model registry, prompt construction, and the evidence schema both callers validate against |

`bridge/src/models.js` is the single registry of selectable models and their
output budgets, read by both the in-panel client and the bridge, so the two paths
cannot drift.

## Guarantees worth knowing

- **Nothing sensitive is persisted.** Only the interface language and the bridge
  pairing (port plus token) reach `chrome.storage`. CV text, the captured job, and
  API keys live in the open panel and disappear with it. Asserted in
  `tests/privacy.test.mjs`.
- **The model cannot invent quotes.** It receives addressable `CV-nnn` / `JD-nnn`
  evidence blocks and may cite only their IDs. Refs are resolved back to real
  blocks during validation; unresolvable ones are dropped. The quotes are not
  displayed — this constraint is about what the model is allowed to assert, not
  about what the page shows.
- **Provider replies are untrusted.** Enum states, list sizes, and string lengths
  are re-checked after parsing, independent of whatever schema the provider was
  given.
- **Job text is data, not instructions.** It is fenced and labelled as untrusted
  in the prompt, and the system policy forbids acting on it.

## Verification

`npm test` runs the unit suite plus an end-to-end smoke test over the shipping
path: snapshot → normalized job → validated request → parsed evidence.
`npm run lint` runs syntax checks and the manifest/permission/endpoint assertions
in `scripts/static-check.mjs`. `npm run audit` runs the cross-file checks that no
unit test covers: a manifest pointing at a deleted file, an element id renamed in
HTML but not in JS, a string added in one language only, an unescaped innerHTML
write, an unexpected network host, or a module nothing imports any more.

Two checks exist because their absence previously produced silent failures rather
than test failures:

- `tests/sidepanelBoot.test.mjs` imports the panel against a DOM built from the
  real markup, so a stale element id fails the suite instead of blanking the panel.
- `static-check.mjs` scans every source file for a reintroduced local scoring path.

## Known limits

- The Claude 5 structured-output path and the OpenAI strict-schema path have not
  been exercised against live provider APIs from this repository. Both fall back
  to plain prompted JSON if a provider rejects the schema.
- Chrome grants `activeTab` per invocation, so switching tabs after opening the
  panel requires either re-invoking the extension or granting the per-site
  permission the panel offers.

## Recommended next steps

1. Run one real analysis against each provider to confirm the structured-output
   paths, then remove the fallback if it proves unnecessary.
2. Validate extraction against anonymised real postings and tighten site adapters.
3. Replace the development loopback Bridge with Native Messaging before broad
   public distribution, then complete privacy/legal review.
4. Run a small consented beta before Chrome Web Store publication.
