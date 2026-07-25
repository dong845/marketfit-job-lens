# Privacy and Data Flow

## Default temporary flow

1. The user selects a text-based PDF resume. PDF.js reads its text locally in the side panel; the file and extracted text remain in memory only.
2. The user clicks **Analyze current job with AI** while viewing a job page. `activeTab` and `scripting` read the currently visible active page once, after that click. If Chrome does not carry that temporary grant into the side panel, the UI offers an explicit, per-site optional permission; only after the user accepts Chrome's prompt does it retry the capture.
3. PDF parsing and page capture run locally in the side panel. The UI deliberately does not expose manual CV/JD text boxes or a separate local rule-analysis action.
4. PDF-derived CV text, captured JD text, and analysis are not written to `chrome.storage.local`, and the default path has no network request.

## Local storage and clearing

The current UI stores only the chosen interface language and, after explicit CLI pairing, the loopback Bridge port/token in Chrome storage. The `tabs` permission lets the extension identify the URL of the active tab so that it can ask Chrome for access to that exact job-site origin; it does not itself read page content. It does not offer saved profiles, retention settings, or data export. **Clear local session** clears the in-memory PDF-derived profile, job, result, legacy profile keys, and Bridge pairing. The interface-language preference remains because it contains no CV/JD data.

## AI analysis

AI analysis is off unless the user selects a provider and clicks **Analyze current job with AI**. For **Codex CLI** and **Claude Code**, the user must first pair a local Bridge, then the extension sends the complete PDF-derived CV text plus captured job text to `http://127.0.0.1` with the paired Bridge token. For **OpenAI API key** and **Anthropic API key**, Chrome first asks for optional access to the selected provider API domain, then the extension sends the same current-request payload directly to that provider; no local Bridge runs in this path. No automatic provider fallback is allowed. Every accepted AI conclusion displayed in the panel must carry one or more verbatim CV/JD quotes that the shared validation code checks before rendering.

The extension saves the loopback port and Bridge token in trusted extension storage only for CLI paths; the Bridge token/pairing code are otherwise memory-only. The normal pairing path binds the extension origin. When Chrome omits that header, the Bridge additionally checks the extension's fixed runtime ID on the pairing request and all later requests; this fallback still requires the one-time code and bearer token, and it rejects web-page origins. A pasted OpenAI or Anthropic API key is placed in direct provider requests and remains only in the open side panel for reruns; it is never written to Chrome storage, files, logs, or task history, and disappears when the panel closes, the provider changes, or the local session is cleared. AI evidence remains in side-panel memory only. The redacted preview is informational, not the actual payload: reliable evidence matching requires the original CV/JD text.

Codex and Claude Code are local CLIs, but their model inference may use the provider's cloud services. The UI discloses this before the user starts a review. A public release still needs a fresh Chrome Web Store privacy review and an appropriate disclosure of the selected provider/data transfer.

The extension must not use CV/JD/page data for advertising, unrelated profiling, sale, or sharing.
