import { createEvidenceRef } from "../analysis/schemas.js";

// Interface only: this local MVP never queries an employer registry or remote service.
export function employerEvidenceFromJob(job, sponsorship) {
  return {
    employerSponsorshipEligibility: { status: "unknown", evidenceRefs: [], reason: "No employer registry lookup is performed locally." },
    roleSponsorshipWillingness: { status: sponsorship.state, evidenceRefs: sponsorship.evidenceRefs },
    candidateVisaEligibility: { status: "unknown", evidenceRefs: [createEvidenceRef("profile", "Requires current official-rule verification")] }
  };
}
