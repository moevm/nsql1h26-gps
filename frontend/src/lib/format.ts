export function levelFromExp(exp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, exp) / 100)) + 1;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function fmtKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`;
}

export function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-US");
}

export function questProgressText(rules: TriggerRuleLike[] | string | null, progress: string | null): string | null {
  if (progress == null) return null;
  try {
    const parsed: TriggerRuleLike[] = typeof rules === "string" ? JSON.parse(rules) : (rules ?? []);
    const total = targetOf(parsed);
    return total ? `${progress}/${total}` : progress;
  } catch {
    return progress;
  }
}

type TriggerRuleLike = { type: string; count?: number; distanceKm?: number; poiType?: string; poiId?: number; questId?: number };

function targetOf(rules: TriggerRuleLike[]): number | null {
  for (const r of rules) {
    if (r.count != null) return r.count;
    if (r.distanceKm != null) return r.distanceKm;
  }
  return null;
}

export function ruleText(rules: TriggerRuleLike[]): string {
  if (!rules || rules.length === 0) return "";
  return rules
    .map((r) => {
      switch (r.type) {
        case "POI_TYPE_COUNT":
          return `find ${r.count ?? 0} ${r.poiType} POI${(r.count ?? 0) === 1 ? "" : "s"}`;
        case "POI_ID":
          return `find POI #${r.poiId}`;
        case "DISTANCE_KM":
          return `walk ${r.distanceKm} km`;
        case "CELL_COUNT":
          return `visit ${r.count ?? 0} map cell${(r.count ?? 0) === 1 ? "" : "s"}`;
        case "QUEST_COMPLETED":
          return `complete quest #${r.questId}`;
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join(" and ");
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export { plural };
