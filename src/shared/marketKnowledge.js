import { getMarketClaims, MARKET_IDS, MARKET_NAMES } from "../market/claimStore.js";

// Read-only compatibility view. Decision logic reads claim-level records directly.
export { MARKET_IDS };
export const MARKETS = Object.freeze(Object.fromEntries(MARKET_IDS.map((id) => [id, {
  id,
  name: MARKET_NAMES[id],
  sources: getMarketClaims(id, new Date("2026-07-23")).map((claim) => ({ label: claim.claimId, url: claim.sourceUrl }))
}])));
