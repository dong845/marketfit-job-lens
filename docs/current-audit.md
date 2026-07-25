# Current audit (v0)

Audited on 2026-07-23 before the productisation refactor. The original local test command passed, but it only covered two happy-path examples and did not exercise safety or evidence semantics.

| Required reproduction | Observed v0 behaviour | Risk |
| --- | --- | --- |
| Empty CV and JD | Returned total score `57` and `Stretch` | Missing inputs were presented as a recommendation. |
| Target role stuffing | `Senior ML Engineer Python AWS Kubernetes` raised skill score from `42` to `60` and domain score from `48` to `70` | Aspirational text was mistaken for candidate evidence. |
| Negated skill | `I do not have Kubernetes experience` counted as Kubernetes and Python overlap; skill score was `69` | Negative statements were treated as proof. |
| Positive and negative sponsorship wording | `Visa sponsorship available` plus `We will not sponsor` produced eligibility score `74` and hid the conflict | Positive wording bypassed restrictive wording. |
| Active clearance | A candidate without TS/SCI received `Tailor Then Apply` with total score `75` | A confirmed clearance condition was merely a score deduction. |
| Student/graduate route | It received a `Work authorization is unknown` gap | A real route type was collapsed into unknown. |
| Dutch preferred | It reduced constraint score to `52` and created a language gap | A preference was handled like a requirement. |
| Long CV clarity | Repeated filler text scored `73`; a short quantified CV scored `57` | Length, rather than clarity and outcomes, dominated the result. |

Other audit observations:

- Candidate CV text, target role, and JD keywords were mixed in the same scoring paths.
- Requirements, responsibilities, preferences, and benefits were not structured separately.
- Page capture could combine navigation, suggested jobs, and footer text.
- The only persisted profile schema was `marketfit.profile.v1`; analysis ran after automatically saving it and had no expiry, export, delete-all, or consent model.
- Market information was a static narrative without individual claim dates, applicability, freshness state, or source-level findings.

The refactor keeps visible-page capture and the minimal MV3 permission model, but treats absent or low-confidence evidence as `insufficient` or `needs_confirmation` instead of averaging it into a score.
