# Testing and Evaluation

`npm test` runs the unit suite plus an end-to-end smoke test over the shipping
path: captured snapshot -> normalized job -> validated provider request -> parsed
evidence.

`npm run lint` (`scripts/static-check.mjs`) parses every extension module and
asserts the invariants that are cheaper to enforce than to re-discover: the exact
permission set, no host permissions at install time, a locally bundled PDF.js
parser and worker, only the three provider domains in network-capable code, no
reintroduced local scoring path, and field ceilings that come from `FIELD_LIMITS`
rather than literals in either the schema or the parser.

`npm run audit` (`scripts/audit.mjs`) covers what spans files and no unit test
sees: a manifest pointing at a deleted asset, an element id renamed in HTML but
not in JS, a string added in one language only, an unescaped `innerHTML` write, an
unexpected network host, an orphaned module.

Two checks exist because their absence previously produced silent failures:

- `tests/sidepanelBoot.test.mjs` imports the panel against a DOM built from the
  real markup, so a stale element id fails the suite instead of blanking the panel.
- `tests/reportOpen.test.mjs` fires the registered click handlers, because a test
  that only imports the module proved the button existed and never that pressing
  it did anything.
