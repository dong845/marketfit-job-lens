# MarketFit Job Lens

English · [简体中文](README.zh-CN.md)

A Manifest V3 Chrome side panel that reads the job posting in your current tab, compares it against your PDF CV, and answers one question: **is this worth an evening?**

Interface and analysis both available in English and 中文.

It is not an interview prediction, a legal opinion, an immigration assessment, or an automated application tool.

## What you get

**The decision first.** A verdict — apply / worth applying / fix gaps first / probably skip — with the count behind it (`4 required areas · 1 evidenced · 1 partial · 2 missing`), what applying would cost you (half an hour of edits, one evening, more), and the single change that would most move the application.

**Screening separated from wishlist.** Postings write "required" on every line. A knockout is what a recruiter can check without judgement and that ends the application on its own — a licence, a clearance, a right-to-work condition. Everything else is weighted, and the verdict follows the knockouts rather than a box count.

**The employer's own conditions, quoted.** A sponsorship line decides an application before fit does, so it sits directly under the verdict. Where a stated condition conflicts with the work authorization you selected, the verdict is lowered and the card says so — a comparison of two stated facts, never a judgement about your legal status.

**A plan, not a list.** Actions are grouped by when to do them and numbered, and everything the analysis asks of you appears there exactly once.

**Tailoring that stays honest.** It may reorder and sharpen evidence your CV already contains. It may not add a skill, upgrade "contributed to" into "led", restate a team result as yours, or supply a number you did not.

### Deliberately absent

- **Immigration advice.** No visa routes, quotas, or processing times. There is no policy data here and no way to verify what a model recalls; a confident wrong answer about eligibility is worse than none. It reports what the employer wrote and leaves you to check it.
- **Predictions.** No interview odds, no hiring probability.
- **Invented evidence.** Every claim cites a block of your CV or the posting, and references that do not resolve are dropped rather than shown.

## Providers

Choose one and paste its API key into the panel. The key stays in that open panel, is never written to storage, and Chrome asks for access to that one provider domain before the first request.

| Provider | Models | Get a key |
| --- | --- | --- |
| OpenAI | GPT-5 mini, GPT-5 | [platform.openai.com](https://platform.openai.com/) → API keys |
| Anthropic | Claude Opus 5, Claude Sonnet 5, Claude Opus 4.6, Claude Sonnet 4.6 | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) |
| DeepSeek | DeepSeek V4 Flash, DeepSeek V4 Pro | [platform.deepseek.com](https://platform.deepseek.com/) → API keys |

The step that stops people is not creating the key — it is billing. **A new key on an account with no credit fails on the first call**, with an error that reads like the extension is broken. Top up first. Keys are shown once at creation; if you lose one, make another.

## Run locally

```bash
npm install          # pdfjs-dist, the only runtime dependency
npm run vendor:pdfjs # copies the PDF runtime into vendor/
npm run check        # lint + tests + audit
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this directory.

Open a full job page, click the extension, choose a text-based PDF CV and your target market and work-authorisation status, select an AI provider, then click **Analyze current job with AI**. If Chrome asks to allow the current site, approve that single-site prompt and MarketFit retries automatically.

The panel header shows the loaded version. If it does not match `manifest.json` after a change, the extension has not been reloaded — Chrome keeps running the previous code until you press reload.

## Data handling

- PDF files and their extracted text stay in side-panel memory and are never written to Chrome storage. Scanned or image-only PDFs are rejected, because no reliable text can be extracted locally.
- The current job is captured from the active tab only after you click **Analyze current job with AI**. A manual editor is the fallback when a page cannot be read, and pasted text is never overwritten by a re-capture.
- Page furniture — navigation, cookie banners, similar-job rails, application forms — is filtered out before anything is sent. The panel reports how many lines were removed and lists them on hover, because a filter you cannot inspect is one you cannot catch being wrong.
- The default flow makes no provider request. AI analysis is explicitly initiated and sends the PDF-derived CV text plus the captured posting **only to the provider you selected** — no backend, no telemetry, no relay.
- API-key and model fields appear only after an API-key provider is selected, which is when Chrome asks for access to that specific domain.
- **Clear local session** removes the in-memory CV, job, result, API key, and every stored report.
- Persisted across sessions: interface language and how long past runs took. Reports live for the browser session and carry no CV text — source quotes are stripped before storage.

**Preview optional AI payload** in the panel shows exactly what a run would send, with obvious PII redacted.

## Development

No build step and no dev dependencies — plain ES modules throughout.

```bash
npm run check   # the gate: lint + tests + audit
npm test        # unit, integration, and page-capture tests
npm run audit   # cross-file checks a unit test cannot see
```

The audit covers what spans files: a manifest pointing at a deleted icon, an element id renamed in HTML but not JS, a string added in one language only, an unescaped `innerHTML`, a network host that is not one of the three provider APIs, a rendered CSS class with no rule in either stylesheet, an error code with no translation, visible markup with no `data-i18n`, and a `const` in the injected page extractor that would sit in a temporal dead zone.

Most of those exist because the corresponding bug shipped once. Several failure modes here are silent by construction — `t()` renders a missing key as the key name; a filter that drops a requirement looks identical to a posting that never had one — so the guardrails are mechanical rather than advisory, and each was verified by reintroducing the bug and watching the check fail.

### Verification status

What has actually been exercised against live APIs:

| Provider | Status |
| --- | --- |
| OpenAI | Verified — repeated end-to-end runs against the real API |
| DeepSeek | Verified working |
| Anthropic | **Unverified** — code-complete and unit-tested, never run against the live endpoint |

## Further reading

[docs/analysis-model.md](docs/analysis-model.md) · [docs/privacy-data-flow.md](docs/privacy-data-flow.md) · [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md)

## Licence

MIT — see [LICENSE](LICENSE).
