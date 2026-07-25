# Chrome Web Store Release Checklist

- [ ] Reconfirm all manifest permissions have a user-visible purpose: `activeTab`, `tabs` (identify the active job-site URL), `scripting`, `storage`, `sidePanel`, loopback-only `http://127.0.0.1/*`, and user-approved per-site optional web access.
- [ ] Confirm the extension has no direct provider host permissions, remote code, hidden page capture, batch apply, or outreach.
- [ ] Publish a privacy policy that exactly matches local PDF extraction, current-tab capture, clear-session behaviour, and optional provider-specific AI transfer.
- [ ] Complete Chrome Web Store Privacy Practices and Limited Use declarations truthfully.
- [ ] Verify Clear local session removes PDF-derived memory state, Bridge pairing, and legacy profile data in a fresh Chrome profile.
- [ ] Verify every market claim links to a dated official source, is scoped, and has a refresh owner.
- [ ] Check all seven markets with current official sources before launch.
- [ ] Manually test text-based, password-protected, image-only, and oversized PDF resumes plus JSON-LD, Greenhouse, Lever, Workday, generic SPA, and noisy-page capture.
- [ ] Run the full test suite and static checks on the release commit.
- [ ] Conduct accessibility keyboard/focus/contrast review and Chinese/English content review.
- [ ] Replace the development loopback Bridge with a reviewed Native Messaging design before broad public release.
- [ ] Obtain legal/privacy review before enabling public provider access or making immigration-related product claims.
