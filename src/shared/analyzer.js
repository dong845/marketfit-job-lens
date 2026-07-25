import { analyzeJob } from "../analysis/analyzeJob.js";

// Compatibility entry point for the original side-panel integration.
export function analyzeJobFit({ profile, jobText, marketId, job }) {
  return analyzeJob({ profile, jobText, marketId, job });
}
