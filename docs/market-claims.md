# Market Claims

`src/market/claimStore.js` holds individual `MarketClaim` records with a claim ID, jurisdiction, category, official source URL, effective/retrieval/expiry dates, confidence, and applicability. Market claims are context only: they never prove employer sponsorship willingness or candidate visa eligibility.

| Market | Rule source examples | Separate employer check |
| --- | --- | --- |
| US | DOL LCA and H-1B worker guidance | Specific role sponsorship and clearance/export controls |
| UK | GOV.UK Skilled Worker guidance and sponsor register | Register presence does not prove this role is sponsored |
| Canada | Canada foreign-worker and employer-specific permit guidance | LMIA/exception path and role willingness |
| Australia | Home Affairs Skills in Demand guidance | Nomination and occupation/role-specific conditions |
| Netherlands | IND Highly Skilled Migrant and recognised-sponsor guidance | Register presence and role-level willingness are different |
| Singapore | MOM Employment Pass and work-pass guidance | Employer assessment and current pass conditions |
| China | Government foreign work-permit sources | Employer support and local work/residence process |

Market statistics expire more quickly than official-rule pointers. A stale claim is displayed as stale with its source rather than treated as current fact. Refresh the store from the linked official source before public release, at least at every expiry and after any material rule change.

The local MVP has an employer-evidence interface but deliberately performs no registry lookup or network request. It reports employer eligibility, role willingness, and candidate eligibility as separate statuses.
