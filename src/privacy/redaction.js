import { format, t } from "../ui/i18n.js";

/**
 * What "run AI analysis" would actually send, shown before anyone runs it.
 *
 * This is user-facing text, so it takes a locale like every other surface. It used
 * to be assembled from English fragments — including a note about routing through
 * "the paired Local AI Bridge", a route that no longer exists — and dumped into the
 * panel verbatim, so a Chinese reader got an English paragraph describing a feature
 * that had been removed.
 */
export function redactPiiPreview(value, locale = "en") {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, t(locale, "redactedEmail"))
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, t(locale, "redactedPhone"))
    .replace(/\bhttps?:\/\/[^\s]+/gi, t(locale, "redactedLink"));
}

export function buildRemoteTransmissionPreview({ profile, job, provider = "", transport = "provider_not_selected", locale = "en" }) {
  return {
    profile: redactPiiPreview(profile?.cvText, locale),
    job: redactPiiPreview(job?.sourceText || job?.jobText, locale),
    transport,
    note: transport === "direct_provider_api"
      ? format(locale, "previewNoteDirect", { provider })
      : t(locale, "previewNotePending")
  };
}
