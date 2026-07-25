# Migration Notes

The prior storage key `marketfit.profile.v1` contained a flat authorization value and no lifecycle metadata. On first v2 initialization, the extension removes that legacy key and `marketfit.lastAnalysis.v1` instead of attempting to present an old saved score as a current analysis.

The v2 local profile schema stores a nested `authorization` object with country, status type, future sponsorship need, restrictions extension point, expiry extension point, clearance, and licences. Legacy `workAuthorization` is accepted only for in-memory compatibility and normalised to the new status type.

The v0 weighted total score and labels such as `Low ROI` have been removed. Results now return application priority, blockers, uncertainties, evidence, gaps, next action, and an optional range only when the input quality permits it.
