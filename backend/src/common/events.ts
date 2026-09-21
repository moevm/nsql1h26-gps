export type GameEvent =
  | { type: "user:visited_cell"; userId: number; cellIndex: string; isNewCell: boolean; latitude: number; longitude: number }
  | { type: "user:discovered_poi"; userId: number; poiId: number; poiName: string; poiType: string }
  | { type: "quest:completed"; userId: number; questId: number; questName: string }
  | { type: "achievement:unlocked"; userId: number; achievementId: number; achievementName: string };

export type ProgressReport =
  | { kind: "quest_progress"; questId: number; name: string; status: "IN_PROGRESS"; progress: string }
  | { kind: "quest_completed"; questId: number; name: string; reward: string }
  | { kind: "achievement_unlocked"; achievementId: number; name: string };

type Handler<T extends GameEvent["type"]> = (
  e: Extract<GameEvent, { type: T }>,
) => Promise<ProgressReport[]>;

class EventBus {
  private handlers = new Map<string, Handler<any>[]>();

  on<T extends GameEvent["type"]>(type: T, h: Handler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(h);
    this.handlers.set(type, list);
  }

  async emit(events: GameEvent[]): Promise<ProgressReport[]> {
    const reports: ProgressReport[] = [];
    for (const e of events) {
      for (const h of this.handlers.get(e.type) ?? []) {
        const res = await Promise.allSettled([h(e)]);
        if (res[0].status === "fulfilled") reports.push(...res[0].value);
        else console.error(`[event-bus] handler failed for ${e.type}`, res[0].reason);
      }
    }
    return reports;
  }
}

export const bus = new EventBus();
