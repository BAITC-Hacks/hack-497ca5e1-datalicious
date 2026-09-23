import { simulationEngine } from "@/domain";

/** Calculated by the same public engine used for previews and server analysis. */
export const baselineSnapshot = simulationEngine.baseline();
