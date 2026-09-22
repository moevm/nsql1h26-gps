<script lang="ts">
  import { untrack } from "svelte";
  import Icon from "./Icon.svelte";
  import FilterTree from "./FilterTree.svelte";
  import type { ComplexNode, EntityConfig, ListState, SimpleFilter } from "../lib/filter";

  let {
    cfg,
    listState,
    searchLabel = "Search",
    searchField,
    dateField,
    dateLabel = "Period",
    orderLabel = "Order by",
    orderFields,
    onchange,
  }: {
    cfg: EntityConfig;
    listState: ListState;
    searchLabel?: string;
    searchField: string;
    dateField?: string;
    dateLabel?: string;
    orderLabel?: string;
    orderFields: string[];
    onchange: (s: ListState) => void;
  } = $props();

  function findFilter(field: string, op?: string): SimpleFilter | undefined {
    return listState.filters.find((f) => f.field === field && (!op || f.op === op));
  }

  function setFilter(field: string, op: string, value: string | null): void {
    const rest = listState.filters.filter((f) => f.field !== field);
    const filters = value !== null && value !== "" ? [...rest, { field, op, value }] : rest;
    onchange({ ...listState, filters, page: 1 });
  }

  function setRange(field: string, from: string, to: string): void {
    setFilter(field, "between", from && to ? `${from},${to}` : null);
  }

  let searchValue = $state(findFilter(searchField, "contains")?.value ?? "");
  $effect(() => {
    const v = findFilter(searchField, "contains")?.value ?? "";
    if (v !== untrack(() => searchValue)) searchValue = v;
  });

  function commitSearch(): void {
    setFilter(searchField, "contains", searchValue);
  }

  const PERIODS = [
    { chip: "Today", days: 1 },
    { chip: "Week", days: 7 },
    { chip: "Month", days: 30 },
  ];

  function expectedFrom(days: number): string {
    return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  }

  function periodChipMatches(chip: string): boolean {
    const p = PERIODS.find((p) => p.chip === chip);
    if (!p) return false;
    return findFilter(dateField!, "gte")?.value === expectedFrom(p.days) && !findFilter(dateField!, "between");
  }

  function initCustom(): { open: boolean; from: string; to: string } {
    if (!dateField) return { open: false, from: "", to: "" };
    const between = findFilter(dateField, "between");
    if (between) {
      const [a, b] = between.value.split(",");
      return { open: true, from: a ?? "", to: b ?? "" };
    }
    const gte = findFilter(dateField, "gte");
    if (gte && !PERIODS.some((p) => gte.value === expectedFrom(p.days))) {
      return { open: true, from: gte.value, to: "" };
    }
    return { open: false, from: "", to: "" };
  }

  let custom = $state(initCustom());

  function applyPeriod(chip: string): void {
    const p = PERIODS.find((p) => p.chip === chip);
    if (p && dateField) {
      setFilter(dateField, "gte", expectedFrom(p.days));
    }
    custom = { ...custom, open: false };
  }

  function clearPeriod(): void {
    if (dateField) setFilter(dateField, "gte", null);
    custom = { open: false, from: "", to: "" };
  }

  function applyCustomRange(): void {
    if (!dateField) return;
    if (custom.from && custom.to) setRange(dateField, custom.from, custom.to);
    else if (custom.from) setFilter(dateField, "gte", custom.from);
    else setFilter(dateField, "gte", null);
  }

  function numRangeValue(field: string, idx: 0 | 1): string {
    const f = findFilter(field, "between");
    if (!f) return "";
    return f.value.split(",")[idx] ?? "";
  }

  function toggleSort(field: string): void {
    const dir = listState.sortBy === field && listState.sortDir === "asc" ? "desc" : "asc";
    onchange({ ...listState, sortBy: field, sortDir: dir, page: 1 });
  }

  function commitComplex(node: ComplexNode): void {
    onchange({ ...listState, mode: "complex", complex: node, page: 1 });
  }

  function switchMode(mode: "simple" | "complex"): void {
    onchange({ ...listState, mode, page: 1 });
  }

  const enumFields = Object.entries(cfg.fields).filter(([, f]) => f.type === "enum");
  const numFields = Object.entries(cfg.fields).filter(([k, f]) => f.type === "number" && k !== searchField && k !== dateField);
  const strFields = Object.entries(cfg.fields).filter(([k, f]) => f.type === "string" && k !== searchField && k !== dateField);
</script>

<div class="panel selection">
  <div class="head">
    <h3>Selection &amp; ordering settings</h3>
    <div class="mode">
      <span class="mode-label">Mode:</span>
      <div class="chips">
        <button class="chip" class:active={listState.mode === "simple"} onclick={() => switchMode("simple")}>Simple</button>
        <button class="chip" class:active={listState.mode === "complex"} onclick={() => switchMode("complex")}>Complex</button>
      </div>
    </div>
  </div>

  {#if listState.mode === "simple"}
    <div class="search-wrap">
      <input
        type="text"
        placeholder={searchLabel}
        bind:value={searchValue}
        onkeydown={(e) => e.key === "Enter" && commitSearch()}
        onblur={commitSearch}
      />
      <span class="icon"><Icon name="search" /></span>
    </div>

    {#if dateField}
      <div class="field-label">{dateLabel}</div>
      <div class="chips">
        <button class="chip" class:active={!findFilter(dateField)} onclick={clearPeriod}>All</button>
        {#each PERIODS as p (p.chip)}
          <button class="chip" class:active={periodChipMatches(p.chip)} onclick={() => applyPeriod(p.chip)}>
            {p.chip}
          </button>
        {/each}
        <button class="chip" class:active={custom.open} onclick={() => (custom = { ...custom, open: true })}>Custom</button>
      </div>
      {#if custom.open}
        <div class="range-row">
          <input type="date" bind:value={custom.from} onchange={applyCustomRange} />
          <span class="dim">—</span>
          <input type="date" bind:value={custom.to} onchange={applyCustomRange} />
        </div>
      {/if}
    {/if}

    {#each enumFields as [k, f] (k)}
      <div class="field-label">{f.label}</div>
      <div class="chips">
        <button class="chip" class:active={!findFilter(k)} onclick={() => setFilter(k, "eq", null)}>All</button>
        {#each (f.enumValues ?? []) as v}
          <button class="chip" class:active={findFilter(k, "eq")?.value === v} onclick={() => setFilter(k, "eq", v)}>
            {v}
          </button>
        {/each}
      </div>
    {/each}

    {#each strFields as [k, f] (k)}
      <div class="field-label">{f.label}</div>
      <div class="search-wrap">
        <input
          type="text"
          placeholder={f.label}
          value={findFilter(k, "contains")?.value ?? ""}
          onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          onblur={(e) => setFilter(k, "contains", e.currentTarget.value)}
        />
      </div>
    {/each}

    {#each numFields as [k, f] (k)}
      <div class="field-label">{f.label}</div>
      <div class="range-row">
        <input
          type="number"
          placeholder="from"
          value={numRangeValue(k, 0)}
          onchange={(e) => setRange(k, e.currentTarget.value, numRangeValue(k, 1))}
        />
        <span class="dim">—</span>
        <input
          type="number"
          placeholder="to"
          value={numRangeValue(k, 1)}
          onchange={(e) => setRange(k, numRangeValue(k, 0), e.currentTarget.value)}
        />
      </div>
    {/each}

    <div class="field-label">{orderLabel}</div>
    <div class="chips">
      {#each orderFields as f (f)}
        <button class="chip" class:active={listState.sortBy === f} onclick={() => toggleSort(f)}>
          {cfg.fields[f]?.label ?? f}
          {listState.sortBy === f ? (listState.sortDir === "asc" ? " ↑" : " ↓") : ""}
        </button>
      {/each}
    </div>
  {:else}
    <div class="field-label">Complex query</div>
    <FilterTree cfg={cfg} node={listState.complex ?? { and: [] }} onchange={commitComplex} />
  {/if}
</div>

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 6px;
  }

  .head h3 {
    margin: 0;
  }

  .mode {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mode-label {
    font-size: 13px;
    color: var(--muted);
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .range-row input {
    flex: 1;
    min-width: 0;
  }
</style>
