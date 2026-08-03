export {
  createEngine,
  buildDeck,
  isEligible,
  cartTotal,
  FREE_DELIVERY_THRESHOLD,
  STAGE_SLOTS,
  stageFromCounts,
  timeWindowFromDate,
} from "./engine.js";
export { expandCandidates } from "../lib/expandCandidates.js";
export { rankScore } from "./allocator.js";
export {
  pickProbeCard,
  needsProbeSlot,
  goalAffinity,
  placeProbeInHand,
} from "./probe.js";
