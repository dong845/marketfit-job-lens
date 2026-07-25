# Local AI Bridge (CLI providers only)

MarketFit uses an AI-first analysis flow. The local Bridge is the route for **Codex CLI** and **Claude Code** only. It reads the complete PDF-derived CV text and captured job text to explain the role, candidate positioning, requirements, strengths, gaps, role-fit risks, CV tailoring, interview preparation, and follow-up questions. Every accepted conclusion must cite supplied CV or job text verbatim.

## Start and pair

1. In this project directory, run `npm run bridge`.
2. The Bridge prints a random loopback port and a one-time pairing code.
3. In the MarketFit side panel, select a provider under **AI job analysis**.
4. For **Codex CLI** or **Claude Code**, the Bridge pairing section opens immediately. Enter the printed port/code and click **Pair bridge**.
5. Review the privacy notice and click **Analyze current job with AI** while the full job posting is active.

The Bridge listens only on `127.0.0.1`, selects a random port by default, and pairs once with the current Chrome extension origin. On Chrome paths that omit that `Origin` header, the extension sends its fixed runtime ID in a dedicated request header; the Bridge accepts that fallback only together with the one-time pairing code, then requires the same ID and Bridge bearer token on every later request. The extension stores only the paired loopback port and Bridge bearer token in Chrome's trusted extension storage. The Bridge keeps its token and pairing code only in memory. Restarting it requires a new pairing.

## Providers and credentials

| Provider | Authentication | What is sent |
| --- | --- | --- |
| Codex CLI | Existing local Codex CLI authentication | PDF-derived CV text and current captured job evidence to the local CLI; model inference may use OpenAI cloud services. |
| Claude Code | Existing local Claude Code authentication | PDF-derived CV text and current captured job evidence to the local CLI; model inference may use Anthropic cloud services. |
| OpenAI API | A session-only API key pasted into the panel | Direct extension request to OpenAI, after Chrome grants access to `api.openai.com` for that action. No Bridge is used. |
| Anthropic API | A session-only API key pasted into the panel | Direct extension request to Anthropic, after Chrome grants access to `api.anthropic.com` for that action. No Bridge is used. |

API keys are never written to Chrome storage, project files, Bridge logs, task history, or command arguments. They remain only in the currently open side panel so a user can rerun an analysis, and disappear when the panel closes, the provider changes, or the local session is cleared. API-provider calls use a 90-second timeout and request non-persistent OpenAI Responses storage (`store: false`).

The provider selector intentionally has two flows: local CLI choices foreground the Bridge because they use an existing CLI login; API choices foreground the session API-key field and do not show any Bridge controls. Chrome requests optional access to the selected provider's API domain only after the user clicks the analysis action.

When an API provider is selected, the panel also exposes provider-specific model choices: GPT-5 mini or GPT-5 for OpenAI, and Claude Sonnet 4.6 or Claude Opus 4.6 for Anthropic. The selected model is used only for the current request and is not stored.

Codex tasks use `codex exec --ephemeral` with a read-only sandbox. Claude Code tasks use `--no-session-persistence`. Both receive the payload on stdin, run in a temporary directory, and receive no file-writing or browser tools.

## Security limits and release status

This is a local development/power-user integration, not yet a production Native Messaging implementation. Its required host permission is limited to `http://127.0.0.1/*`; provider API domains are optional and requested only for the provider selected at analysis time. It does not auto-fallback from one provider to another, browse job boards, modify files, submit applications, or make legal/immigration/hiring decisions.

Use **Disconnect** to remove the extension's saved loopback token. To pair again after that, restart the Bridge and use its new one-time code.

## Pairing survives restarts

The bridge keeps its token, pairing code, and paired extension in
`~/.marketfit/bridge.json`, written `0600` inside a `0700` directory.

Before this existed, both secrets were generated per process and the paired
extension was forgotten on exit, so restarting the bridge silently invalidated a
pairing the user had already completed — and the code needed to repair it lived
only in the stdout of a terminal that may have been closed. The panel could only
report that the saved pairing was unavailable.

- Restarting the bridge keeps the pairing; the panel reconnects with no action.
- `npm run bridge` prints `Already paired with MarketFit` when that is the case.
- **Disconnect** in the panel clears the pairing *and* rotates both secrets, so a
  disconnected extension's token is dead even if it kept a copy.
- To reset by hand, delete `~/.marketfit/bridge.json` and start the bridge again.

The file holds a loopback-only bearer token and is handled like a CLI credential.
This is still a development-grade transport; see the Native Messaging note in the
implementation report before wide distribution.
