import { AppError } from "../../common/errors";
import { t } from "elysia";

export type TriggerRule =
  | { type: "POI_TYPE_COUNT"; poiType: string; count: number }
  | { type: "POI_ID"; poiId: number }
  | { type: "DISTANCE_KM"; distanceKm: number }
  | { type: "CELL_COUNT"; count: number }
  | { type: "QUEST_COMPLETED"; questId: number };

export interface UserStatsSnapshot {
  poiTypeCounts: Record<string, number>;
  poiIds: number[];
  totalDistanceKm: number;
  cellCount: number;
  completedQuestIds: number[];
  unlockedAchievementIds: number[];
}

export const triggerRuleSchema = t.Union([
  t.Object({ type: t.Literal("POI_TYPE_COUNT"), poiType: t.String(), count: t.Number() }),
  t.Object({ type: t.Literal("POI_ID"), poiId: t.Number() }),
  t.Object({ type: t.Literal("DISTANCE_KM"), distanceKm: t.Number() }),
  t.Object({ type: t.Literal("CELL_COUNT"), count: t.Number() }),
  t.Object({ type: t.Literal("QUEST_COMPLETED"), questId: t.Number() }),
]);

export interface Evaluation {
  satisfied: boolean;
  progress: string;
}

function fmt(value: number, target: number, suffix = ""): string {
  const v = Math.min(value, target);
  return `${v.toFixed(suffix === " km" ? 1 : 0)}/${target}${suffix}`;
}

export function evaluate(rules: TriggerRule[], s: UserStatsSnapshot): Evaluation {
  const parts: string[] = [];
  let satisfied = true;

  for (const rule of rules) {
    switch (rule.type) {
      case "POI_TYPE_COUNT": {
        const got = s.poiTypeCounts[rule.poiType] ?? 0;
        parts.push(fmt(got, rule.count));
        if (got < rule.count) satisfied = false;
        break;
      }
      case "POI_ID": {
        const got = s.poiIds.includes(rule.poiId) ? 1 : 0;
        parts.push(fmt(got, 1));
        if (got < 1) satisfied = false;
        break;
      }
      case "DISTANCE_KM": {
        parts.push(fmt(s.totalDistanceKm, rule.distanceKm, " km"));
        if (s.totalDistanceKm < rule.distanceKm) satisfied = false;
        break;
      }
      case "CELL_COUNT": {
        parts.push(fmt(s.cellCount, rule.count));
        if (s.cellCount < rule.count) satisfied = false;
        break;
      }
      case "QUEST_COMPLETED": {
        const got = s.completedQuestIds.includes(rule.questId) ? 1 : 0;
        parts.push(fmt(got, 1));
        if (got < 1) satisfied = false;
        break;
      }
    }
  }

  return { satisfied, progress: parts.join(", ") || "0/1" };
}

export function validateTriggerRules(x: unknown): TriggerRule[] {
  if (!Array.isArray(x)) throw new AppError(400, "INVALID_TRIGGER_RULES", "trigger_rules must be an array");
  const rules: TriggerRule[] = [];
  for (const item of x) {
    if (typeof item !== "object" || item === null)
      throw new AppError(400, "INVALID_TRIGGER_RULES", "rule must be an object");
    const r = item as Record<string, unknown>;
    switch (r.type) {
      case "POI_TYPE_COUNT":
        if (typeof r.poiType !== "string" || typeof r.count !== "number")
          throw new AppError(400, "INVALID_TRIGGER_RULES", "POI_TYPE_COUNT: poiType string + count number");
        rules.push({ type: "POI_TYPE_COUNT", poiType: r.poiType, count: r.count });
        break;
      case "POI_ID":
        if (typeof r.poiId !== "number") throw new AppError(400, "INVALID_TRIGGER_RULES", "POI_ID: poiId number");
        rules.push({ type: "POI_ID", poiId: r.poiId });
        break;
      case "DISTANCE_KM":
        if (typeof r.distanceKm !== "number")
          throw new AppError(400, "INVALID_TRIGGER_RULES", "DISTANCE_KM: distanceKm number");
        rules.push({ type: "DISTANCE_KM", distanceKm: r.distanceKm });
        break;
      case "CELL_COUNT":
        if (typeof r.count !== "number") throw new AppError(400, "INVALID_TRIGGER_RULES", "CELL_COUNT: count number");
        rules.push({ type: "CELL_COUNT", count: r.count });
        break;
      case "QUEST_COMPLETED":
        if (typeof r.questId !== "number")
          throw new AppError(400, "INVALID_TRIGGER_RULES", "QUEST_COMPLETED: questId number");
        rules.push({ type: "QUEST_COMPLETED", questId: r.questId });
        break;
      default:
        throw new AppError(400, "INVALID_TRIGGER_RULES", `unknown rule type: ${String(r.type)}`);
    }
  }
  return rules;
}
