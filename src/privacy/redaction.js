export function redactPiiPreview(value) {
  return String(value ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone removed]")
    .replace(/\bhttps?:\/\/[^\s]+/gi, "[link removed]");
}

export function buildRemoteTransmissionPreview({ profile, job, provider = "selected provider", transport = "provider_not_selected" }) {
  const route = transport === "direct_provider_api"
    ? `directly to ${provider}`
    : transport === "local_cli_bridge"
      ? `to ${provider} through the paired Local AI Bridge`
      : "after an AI provider is selected";
  return {
    profile: redactPiiPreview(profile?.cvText),
    job: redactPiiPreview(job?.sourceText || job?.jobText),
    transport,
    note: `Preview only. Running AI analysis would send the current CV and job payload ${route}.`
  };
}
