/** Shared serializable contracts. No calculation, runtime schemas or SDK imports. */
export type Direction = "transport" | "ecology" | "social" | "safety" | "services";
export type DistrictId = "esil" | "almaty" | "saryarka" | "baikonur" | "nura";
export type IndicatorId = "T1" | "T2" | "E1" | "E2" | "S1" | "S2" | "B1" | "B2" | "C1" | "C2";
export type DistrictMeasureId = "M1" | "M3" | "M4" | "M5" | "M7" | "M8" | "M9" | "M10" | "M11" | "M13";
export type CityMeasureId = "M2" | "M6" | "M12" | "M14";
export type MeasureId = DistrictMeasureId | CityMeasureId;
export type Indicators = Readonly<Record<IndicatorId, number>>;
export type IndicatorEffects = Readonly<Partial<Record<IndicatorId, number>>>;

export interface IndicatorDefinition {
  readonly id: IndicatorId;
  readonly direction: Direction;
  readonly name: string;
  readonly description: string;
  readonly weight: number;
}

export interface District {
  readonly id: DistrictId;
  readonly name: string;
  readonly populationShare: number;
  readonly indicators: Indicators;
  readonly profile: string;
}

export interface MeasureBase {
  readonly direction: Direction;
  readonly name: string;
  readonly cost: number;
  readonly lagQuarters: number;
  readonly effects: IndicatorEffects;
}

export type Measure = MeasureBase & (
  | { readonly id: DistrictMeasureId; readonly scope: "district" }
  | { readonly id: CityMeasureId; readonly scope: "city" }
);

export type Decision =
  | { readonly measureId: DistrictMeasureId; readonly districtId: DistrictId }
  | { readonly measureId: CityMeasureId; readonly districtId?: never };

/** May be a partial draft. Exactly five is a runtime validation rule. */
export interface Scenario { readonly decisions: readonly Decision[] }

export interface Synergy {
  readonly pair: readonly [DistrictMeasureId, CityMeasureId];
  readonly target: "first-measure-district";
  readonly effects: IndicatorEffects;
}

export interface Incompatibility {
  readonly pair: readonly [MeasureId, MeasureId];
  readonly scope: "anywhere" | "same-district";
  readonly reason: string;
}

export interface SimulationRules {
  readonly budget: number;
  readonly requiredDecisions: number;
  readonly maxPerDirection: number;
  readonly horizonQuarters: number;
  readonly criticalThreshold: number;
  readonly criticalPenalty: number;
  readonly averageWeight: number;
  readonly weakestDistrictWeight: number;
}

export interface Dataset {
  readonly version: string;
  readonly indicators: readonly IndicatorDefinition[];
  readonly districts: readonly District[];
  readonly measures: readonly Measure[];
  readonly synergies: readonly Synergy[];
  readonly incompatibilities: readonly Incompatibility[];
  readonly rules: SimulationRules;
}

export type ValidationCode = "INVALID_SHAPE" | "UNKNOWN_MEASURE" | "UNKNOWN_DISTRICT"
  | "DECISION_COUNT" | "DUPLICATE_MEASURE" | "BUDGET_EXCEEDED"
  | "DISTRICT_REQUIRED" | "DISTRICT_FORBIDDEN" | "DIRECTION_LIMIT" | "INCOMPATIBLE_MEASURES";

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly message: string;
  readonly decisionIndexes?: readonly number[];
}

export interface BudgetSummary { readonly spent: number; readonly remaining: number }
export type ValidationResult =
  | {
      readonly valid: true;
      readonly scenario: Scenario;
      readonly budget: BudgetSummary;
      readonly validationErrors: readonly [];
    }
  | {
      readonly valid: false;
      readonly issues: readonly ValidationIssue[];
      readonly validationErrors: readonly ValidationIssue[];
    };

export interface DistrictScore {
  readonly districtId: DistrictId;
  readonly indicators: Indicators;
  readonly score: number;
}

export interface CriticalIndicator {
  readonly districtId: DistrictId;
  readonly indicatorId: IndicatorId;
  readonly value: number;
}

export interface ScoreSnapshot {
  readonly districts: readonly DistrictScore[];
  readonly populationWeightedAverage: number;
  readonly weakestDistrictScore: number;
  readonly criticalIndicators: readonly CriticalIndicator[];
  readonly score: number;
}

export interface DecisionContribution {
  readonly measureId: MeasureId;
  readonly direction: Direction;
  readonly cost: number;
  readonly lagQuarters: number;
  readonly realizedFraction: number;
  readonly districtIds: readonly DistrictId[];
  readonly fullEffects: IndicatorEffects;
  readonly realizedEffects: IndicatorEffects;
}

export interface FiredSynergy {
  readonly pair: readonly [MeasureId, MeasureId];
  readonly districtId: DistrictId;
  readonly effects: IndicatorEffects;
}

/** Realized indicator effects before clipping; not additive contributions to final Score. */
export interface EffectContribution {
  readonly source: { readonly kind: "measure"; readonly measureId: MeasureId }
    | { readonly kind: "synergy"; readonly pair: readonly [MeasureId, MeasureId] };
  readonly districtId: DistrictId;
  readonly effects: IndicatorEffects;
}

export interface DistrictDelta {
  readonly districtId: DistrictId;
  readonly indicators: Indicators;
  readonly score: number;
}

export interface SimulationResult {
  readonly valid: true;
  readonly validationErrors: readonly [];
  readonly datasetVersion: string;
  readonly scenario: Scenario;
  readonly budget: BudgetSummary;
  readonly totalCost: number;
  readonly remainingBudget: number;
  readonly baselineScore: number;
  readonly finalScore: number;
  readonly indicatorsBefore: readonly DistrictScore[];
  readonly indicatorsAfter: readonly DistrictScore[];
  readonly baseline: ScoreSnapshot;
  readonly after: ScoreSnapshot;
  readonly scoreDelta: number;
  readonly districtDeltas: readonly DistrictDelta[];
  readonly decisionContributions: readonly DecisionContribution[];
  readonly synergies: readonly FiredSynergy[];
  readonly contributions: readonly EffectContribution[];
}

export type EvaluationResult =
  | { readonly ok: true; readonly result: SimulationResult }
  | {
      readonly ok: false;
      readonly valid: false;
      readonly issues: readonly ValidationIssue[];
      readonly validationErrors: readonly ValidationIssue[];
    };

/** Pure deterministic domain engine. Invalid input must never produce a score. */
export interface SimulationEngine {
  validate(input: unknown): ValidationResult;
  evaluate(input: unknown): EvaluationResult;
  baseline(): ScoreSnapshot;
}

export interface AiAnalysis {
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly risks: readonly string[];
  readonly consequences: readonly string[];
  readonly recommendations: readonly string[];
}

/** Receives server-calculated facts only. The LLM does not calculate Score. */
export interface AnalysisService {
  analyze(result: SimulationResult): Promise<AiAnalysis>;
}

export interface AnalyzeRequest { readonly scenario: Scenario }
export type ApiErrorCode = "NOT_IMPLEMENTED" | "INVALID_REQUEST" | "INVALID_SCENARIO"
  | "AI_NOT_CONFIGURED" | "AI_UNAVAILABLE" | "INTERNAL_ERROR";

export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly issues?: readonly ValidationIssue[];
}

export type AnalyzeResponse =
  | { readonly ok: true; readonly result: SimulationResult; readonly analysis: AiAnalysis }
  | { readonly ok: false; readonly error: ApiError };
