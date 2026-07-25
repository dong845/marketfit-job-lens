# MarketFit Job Lens

MarketFit is a Manifest V3 Chrome side-panel MVP for an AI-first CV-to-job analysis workflow. It reads a user-selected PDF resume locally, captures the visible current job page when the user starts AI analysis, and asks the selected model to return an evidence-cited role and candidate analysis for the United States, United Kingdom, Canada, Australia, Netherlands, Singapore, or China.

It is not an interview prediction, legal opinion, immigration assessment, or automated application tool.

## Two ways to run analysis

**Free — Codex CLI or Claude Code.** Uses the CLI login you already have on this
machine, with no API key and no per-analysis cost. Start the local bridge:

```
npm run bridge -- --port 8765
```

It prints a one-time pairing code. Paste that and the port into the side panel's
provider section. Keep the terminal open while you use MarketFit.

**API key — OpenAI or Anthropic.** Paste a key into the panel. It lives in that
open panel only, is never written to storage, and Chrome asks for access to that
one provider domain before the first request.

## Run locally

1. Run `npm test` and `npm run lint`.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select this project directory.
4. Open a full job page, click the extension, choose a text-based PDF resume and target market/work-authorisation status, select an AI provider, then click **Analyze current job with AI**. If Chrome asks to allow the current site, approve that single-site prompt and MarketFit retries automatically.

## Data handling

- PDF files and their extracted resume text stay in side-panel memory and are never written to Chrome storage. Scanned/image-only PDFs are rejected because no reliable text can be extracted locally.
- The current job is captured from the active tab only after clicking **Analyze current job with AI**; a manual editor is available as a fallback when a page cannot be read.
- **Clear local session** removes current in-memory resume/job/result data, legacy profile keys, and any saved CLI Bridge pairing. The selected interface language remains as a non-sensitive preference.
- The default flow has no provider request. AI analysis is explicitly initiated and sends the complete PDF-derived CV text plus the captured current job only to the selected provider. **Codex CLI** and **Claude Code** use a paired `127.0.0.1` local Bridge; API-key providers connect directly only after Chrome grants access to that provider's API domain. It returns cited job understanding, evidence-backed strengths, gaps, risks, resume-tailoring suggestions, interview topics, and questions to verify.
- API-key and model fields are not visible in the initial UI; they appear only after an API-key provider is selected. Chrome asks for direct access to that specific provider domain at that selection time. API keys are session-only and never stored. The extension has no batch actions or hidden job-board APIs.

Read [analysis-model.md](docs/analysis-model.md), [privacy-data-flow.md](docs/privacy-data-flow.md), [local-ai-bridge.md](docs/local-ai-bridge.md), and [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) before public testing.
