<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { TriggerRule } from "../lib/types";

  let { rules = [] as TriggerRule[], onchange }: { rules?: TriggerRule[]; onchange: (r: TriggerRule[]) => void } = $props();

  const RULE_TYPES: { value: TriggerRule["type"]; label: string }[] = [
    { value: "POI_TYPE_COUNT", label: "Найти N POI типа" },
    { value: "POI_ID", label: "Найти конкретный POI" },
    { value: "DISTANCE_KM", label: "Пройти дистанцию (км)" },
    { value: "CELL_COUNT", label: "Посетить N ячеек" },
    { value: "QUEST_COMPLETED", label: "Завершить квест" },
  ];

  function add(): void {
    onchange([...rules, { type: "POI_TYPE_COUNT", poiType: "", count: 1 }]);
  }

  function remove(i: number): void {
    onchange(rules.filter((_, j) => j !== i));
  }

  function patch(i: number, r: TriggerRule): void {
    onchange(rules.map((old, j) => (j === i ? r : old)));
  }

  function buildRule(type: TriggerRule["type"]): TriggerRule {
    switch (type) {
      case "POI_ID":
        return { type, poiId: 1 };
      case "QUEST_COMPLETED":
        return { type, questId: 1 };
      case "DISTANCE_KM":
        return { type, distanceKm: 1 };
      case "CELL_COUNT":
        return { type, count: 1 };
      case "POI_TYPE_COUNT":
        return { type, poiType: "", count: 1 };
    }
  }
</script>

<div class="rules">
  {#each rules as r, i (i)}
    <div class="rule">
      <button class="x" onclick={() => remove(i)} title="Remove rule"><Icon name="close" size="1em" /></button>
      <select
        value={r.type}
        onchange={(e) => patch(i, buildRule(e.currentTarget.value as TriggerRule["type"]))}
      >
        {#each RULE_TYPES as t (t.value)}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>

      {#if r.type === "POI_TYPE_COUNT"}
        <input type="text" placeholder="тип (museum, park…)" value={r.poiType} onchange={(e) => patch(i, { ...r, poiType: e.currentTarget.value })} />
        <input class="num" type="number" min="1" value={r.count} onchange={(e) => patch(i, { ...r, count: Number(e.currentTarget.value) })} />
      {:else if r.type === "POI_ID"}
        <input class="num" type="number" min="1" placeholder="poi id" value={r.poiId} onchange={(e) => patch(i, { ...r, poiId: Number(e.currentTarget.value) })} />
      {:else if r.type === "DISTANCE_KM"}
        <input class="num" type="number" min="0" step="0.1" placeholder="км" value={r.distanceKm} onchange={(e) => patch(i, { ...r, distanceKm: Number(e.currentTarget.value) })} />
      {:else if r.type === "CELL_COUNT"}
        <input class="num" type="number" min="1" placeholder="ячеек" value={r.count} onchange={(e) => patch(i, { ...r, count: Number(e.currentTarget.value) })} />
      {:else if r.type === "QUEST_COMPLETED"}
        <input class="num" type="number" min="1" placeholder="quest id" value={r.questId} onchange={(e) => patch(i, { ...r, questId: Number(e.currentTarget.value) })} />
      {/if}
    </div>
  {/each}

  <button class="add" onclick={add}>+ Add condition</button>
</div>

<style>
  .rules {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rule {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rule select {
    flex: 0 0 auto;
    max-width: 200px;
  }

  .rule input {
    flex: 1;
    min-width: 0;
  }

  .rule input.num {
    flex: 0 0 90px;
  }

  .x {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 4px;
    display: flex;
  }

  .x:hover {
    color: var(--red);
  }

  .add {
    background: var(--indigo-box);
    border: 1px solid #3a336b;
    color: #cfc9f0;
    font: inherit;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    align-self: flex-start;
  }

  .add:hover {
    background: #322a6e;
  }
</style>
