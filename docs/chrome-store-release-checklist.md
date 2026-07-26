# Chrome Web Store Release Checklist

The filled-in submission — listing copy, permission justifications, data disclosures
and the known review risks — is in [chrome-store-submission.md](chrome-store-submission.md).

- [ ] Reconfirm all manifest permissions have a user-visible purpose: `activeTab`, `tabs` (identify the active job-site URL), `scripting`, `storage`, `sidePanel`, plus user-approved optional access per provider domain and per job site. No host permissions are requested at install time.
- [ ] Confirm the extension has no direct provider host permissions, remote code, hidden page capture, batch apply, or outreach.
- [ ] Publish a privacy policy that exactly matches local PDF extraction, current-tab capture, clear-session behaviour, and optional provider-specific AI transfer.
- [ ] Complete Chrome Web Store Privacy Practices and Limited Use declarations truthfully.
- [ ] Verify Clear local session removes the PDF-derived state, the captured job, the result, and the API key in a fresh Chrome profile.
- [ ] Manually test text-based, password-protected, image-only, and oversized PDF resumes plus JSON-LD, Greenhouse, Lever, Workday, generic SPA, and noisy-page capture.
- [ ] Run the full test suite and static checks on the release commit.
- [ ] Conduct accessibility keyboard/focus/contrast review and Chinese/English content review.
- [ ] Obtain legal/privacy review before enabling public provider access. The extension makes no immigration-related claims and embeds no policy data; if that ever changes, this line becomes a blocker rather than a review item.
