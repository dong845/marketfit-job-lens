# MarketFit Job Lens

English · [简体中文](README.zh-CN.md)

A Chrome side panel that reads the job posting in your current tab, compares it
against your PDF CV, and answers one question: **is this worth an evening?**

Interface and analysis both in English and 中文.

It is not an interview prediction, a legal opinion, an immigration assessment, or an
automated application tool.

---

## Install

Download the latest `marketfit-job-lens-*.zip` from
[Releases](https://github.com/dong845/marketfit-job-lens/releases), unzip it, then:

`chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the
unzipped folder.

The panel opens from the extension icon. Its header shows the loaded version — if
that does not match the release you just installed, Chrome is still running the old
code and needs a reload.

## Set up, once

1. **Upload a PDF CV.** It must be a text PDF, not a scan — the text is extracted in
   your browser, and an image has none to extract.
2. **Say whether you can work where the job is.** One dropdown. Left on *Unknown* it
   changes nothing; set truthfully, the employer's stated conditions get checked
   against it.
3. **Choose a provider and paste an API key.** See the table below. The key lives in
   the open panel only.

## Using it

Open a job posting, click **Analyze current job with AI**, and read down:

| What you see | What it is telling you |
| --- | --- |
| **The verdict word** | Apply / Worth applying / Fix gaps first / Probably skip |
| **The bar under it** | Your required-area coverage, drawn: met, partial, missing |
| **The cost tag** | What applying takes — wording only, an evening, more, or not closable |
| **What would change this** | The single edit that moves the application furthest |
| **Conditions the employer states** | Their own sentence, plus the question that settles it — send that sentence as written |
| **Requirements** | Each tagged required/preferred and met/partial/not met, hard filters first |
| **Gaps to close** | With *how* to close each, and which cannot be closed before applying |
| **Do this next** | The whole plan, grouped by when and numbered. Everything asked of you appears here once |
| **What to ask them** / **What your CV leaves unanswered** | Two different jobs — the second is one only you can do |

**Open full report** gives the same analysis as a full-width page you can print or
keep. Reports last for the browser session.

If a page cannot be read — a login wall, a heavy single-page app — use **Edit job
text** and paste the posting. Pasted text is never overwritten by a re-capture.

---

## How it works

Worth understanding, because it is what makes the output checkable rather than
merely confident.

**1 · The page is read once, and trimmed.** One click, `activeTab`, the tab you are
looking at. Navigation, cookie banners, similar-job rails and application forms are
removed before anything is sent; the panel reports how many lines went and lists
them on hover. A screening condition — sponsorship, a licence, a clearance — is
never removed by any filter rule, because dropping one silently would flip the
verdict.

**2 · Both documents are cut into addressable blocks.** Your CV becomes `CV-001`,
`CV-002`… and the posting `JD-001`, `JD-002`… roughly a paragraph each. The model
may only cite blocks that exist; every reference is resolved back to the real text
on arrival, and any that does not resolve is dropped. That is what stops invented
evidence. It is a plausibility bound, not a proof — it guarantees a claim points at
something real, not that the claim follows from it.

**3 · The answer has a fixed shape.** A JSON schema travels with every request,
including to models that cannot enforce it and on the fallback path where
enforcement is stripped. A reply that overruns a limit is trimmed rather than
refused, and a missing section is treated as empty, because discarding an analysis
you already paid for is the worse failure.

**4 · Some things are decided in code, not by the model.**

| Decided by the model | Decided in code |
| --- | --- |
| What the role is, and how your CV compares | Whether a stated condition conflicts with what you declared |
| Which requirements screen you out | The coverage count under the verdict |
| What to change, and what to ask | Stripping block IDs out of prose |
| Which list an item belongs in | What counts as page furniture |

Anything whose failure would be both invisible and decisive sits on the right. The
model is asked not to write `JD-001` into a sentence and mostly complies — mostly is
not enough, so the parser removes them.

**5 · What it will not do.** No visa routes, quotas or processing times: there is no
policy data here and no way to verify what a model recalls, and a confident wrong
answer about your eligibility is worse than none. No interview odds. **No match
percentage** — collapsing met, partial and missing into one score needs a weight for
a partial match, and any weight would be invented. No salary or market figures,
because nothing here measures them.

**Tailoring stays honest.** It reorders and sharpens evidence your CV already
contains. It will not add a skill, upgrade "contributed to" into "led", restate a
team result as yours, or supply a number you did not.

---

## Providers

You bring the key; usage is billed by that provider to your own account.

| Provider | Models | Get a key |
| --- | --- | --- |
| OpenAI | GPT-5 mini, GPT-5 | [platform.openai.com](https://platform.openai.com/) → API keys |
| Anthropic | Claude Opus 5, Claude Sonnet 5, Claude Opus 4.6, Claude Sonnet 4.6 | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) |
| DeepSeek | DeepSeek V4 Flash, DeepSeek V4 Pro | [platform.deepseek.com](https://platform.deepseek.com/) → API keys |

All three are verified working end to end.

The step that stops people is not creating the key — it is billing. **A new key on
an account with no credit fails on the first call**, with an error that reads like
the extension is broken. Top up first. Keys are shown once; if you lose one, make
another.

## Privacy

No backend, no account, no analytics, no telemetry. Nothing is transmitted until you
click Analyze.

- The PDF is parsed **in your browser**; the file is never uploaded.
- Running an analysis sends the CV text and the filtered posting **only to the
  provider you chose** — there is no relay in between.
- Chrome asks before reaching a provider's domain, and before reading a site.
- **Never stored:** the PDF, its text, your API key.
- **Stored:** interface language, and how long past runs took. Reports live for the
  browser session and contain no CV text — quoted passages are stripped first.
- **Clear local session** wipes the in-memory state and every stored report.

**Preview optional AI payload** in the panel shows exactly what a run would send,
with obvious PII redacted. Full detail in [PRIVACY.md](PRIVACY.md).

---

## Development

No build step, no dev dependencies, plain ES modules.

```bash
npm install && npm run vendor:pdfjs   # pdfjs-dist is the only runtime dependency
npm run check                         # lint + tests + audit — the gate
```

The audit covers what spans files and no unit test can see: a manifest pointing at a
deleted icon, an id renamed in HTML but not JS, a string added in one language only,
an unescaped `innerHTML`, a network host that is not one of the three provider APIs,
a rendered CSS class with no rule in either stylesheet, an error code with no
translation, visible markup with no `data-i18n`, a README model table that has
drifted from the registry, and a `const` in the injected page extractor that would
sit in a temporal dead zone.

Most exist because the corresponding bug shipped once. Several failure modes here
are silent by construction — `t()` renders a missing key as the key name; a filter
that drops a requirement looks identical to a posting that never had one — so the
guardrails are mechanical, and each was verified by reintroducing the bug and
watching the check fail.

[docs/analysis-model.md](docs/analysis-model.md) ·
[docs/privacy-data-flow.md](docs/privacy-data-flow.md) ·
[docs/chrome-store-submission.md](docs/chrome-store-submission.md)

## Licence

MIT — see [LICENSE](LICENSE).
