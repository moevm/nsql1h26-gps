<script lang="ts">
  import Icon from "./Icon.svelte";
  import FilterTree from "./FilterTree.svelte";
  import {
    DEFAULT_OPS,
    LABEL_CONFIGS,
    REL_TYPES,
    groupChildren,
    groupKey,
    makeGroup,
    makeLeaf,
    makeRelNode,
    nodeIsGroup,
    nodeIsRel,
    type ComplexNode,
    type EntityConfig,
    type LeafValue,
  } from "../lib/filter";

  let {
    cfg,
    node,
    onchange,
  }: {
    cfg: EntityConfig;
    node: ComplexNode;
    onchange: (n: ComplexNode) => void;
  } = $props();

  const GROUP_ORDER: ("and" | "or" | "not")[] = ["and", "or", "not"];

  function isRoot(): boolean {
    return (node as { __root?: boolean }).__root === true;
  }

  function cycleGroup(): void {
    if (!nodeIsGroup(node)) return;
    const k = groupKey(node);
    const next = GROUP_ORDER[(GROUP_ORDER.indexOf(k) + 1) % 3]!;
    const children = groupChildren(node);
    onchange(makeGroup(next, children));
  }

  function addLeaf(): void {
    if (!nodeIsGroup(node)) return;
    const first = Object.keys(cfg.fields)[0]!;
    const fcfg = cfg.fields[first]!;
    const op = (fcfg.ops ?? DEFAULT_OPS[fcfg.type])[0] ?? "eq";
    const children = groupChildren(node);
    onchange(makeGroup(groupKey(node), [...children, makeLeaf(cfg, first, op, "")]));
  }

  function addGroup(): void {
    if (!nodeIsGroup(node)) return;
    const children = groupChildren(node);
    onchange(makeGroup(groupKey(node), [...children, { and: [] }]));
  }

  function addRel(): void {
    if (!nodeIsGroup(node)) return;
    const children = groupChildren(node);
    onchange(makeGroup(groupKey(node), [...children, makeRelNode(REL_TYPES[0], "out", Object.keys(LABEL_CONFIGS)[0]!)]));
  }

  function remove(): void {
    if (nodeIsGroup(node) && groupChildren(node).length === 0) {
      onchange({ and: [] });
    }
  }

  function removeChild(i: number): void {
    if (!nodeIsGroup(node)) return;
    const children = groupChildren(node);
    const rest = children.filter((_, j) => j !== i);
    onchange(rest.length === 0 ? { and: [] } : makeGroup(groupKey(node), rest));
  }

  function updateChild(i: number, child: ComplexNode): void {
    if (!nodeIsGroup(node)) return;
    const children = groupChildren(node);
    const next = children.map((c, j) => (j === i ? child : c));
    onchange(makeGroup(groupKey(node), next));
  }

  function leafField(leaf: ComplexNode): string {
    return (leaf as { field: string }).field;
  }

  function leafOp(leaf: ComplexNode): string {
    return (leaf as { op: string }).op;
  }

  function leafValue(leaf: ComplexNode): LeafValue {
    return (leaf as { value: LeafValue }).value;
  }

  function setLeafField(leaf: ComplexNode, field: string): ComplexNode {
    const fcfg = cfg.fields[field]!;
    const op = (fcfg.ops ?? DEFAULT_OPS[fcfg.type])[0] ?? "eq";
    return { field, op, value: defaultVal(fcfg.type, op) };
  }

  function setLeafOp(leaf: ComplexNode, op: string): ComplexNode {
    const fcfg = cfg.fields[leafField(leaf)]!;
    return { field: leafField(leaf), op, value: defaultVal(fcfg.type, op) };
  }

  function setLeafValue(leaf: ComplexNode, value: LeafValue): ComplexNode {
    return { field: leafField(leaf), op: leafOp(leaf), value };
  }

  function defaultVal(type: string, op: string): LeafValue {
    if (op === "between") return type === "number" ? [0, 0] : ["", ""];
    if (op === "in") return [];
    return type === "number" ? 0 : "";
  }

  function opsFor(leaf: ComplexNode): string[] {
    const fcfg = cfg.fields[leafField(leaf)];
    return fcfg?.ops ?? DEFAULT_OPS[fcfg?.type ?? "string"] ?? ["eq"];
  }

  function valAsStr(v: unknown): string {
    if (Array.isArray(v)) return v.join(",");
    return String(v ?? "");
  }

  function commitValue(leaf: ComplexNode, raw: string, idx?: number): void {
    const fcfg = cfg.fields[leafField(leaf)]!;
    const op = leafOp(leaf);
    if (op === "between") {
      const cur = Array.isArray(leafValue(leaf)) ? (leafValue(leaf) as unknown[]) : ["", ""];
      const next = [...cur];
      next[idx ?? 0] = fcfg.type === "number" ? Number(raw) : raw;
      updateLeafNode(leaf, setLeafValue(leaf, next as (string | number)[]));
    } else if (op === "in") {
      updateLeafNode(leaf, setLeafValue(leaf, raw.split(",").map((s) => s.trim()).filter(Boolean)));
    } else if (fcfg.type === "number") {
      updateLeafNode(leaf, setLeafValue(leaf, Number(raw)));
    } else {
      updateLeafNode(leaf, setLeafValue(leaf, raw));
    }
  }

  function updateLeafNode(leaf: ComplexNode, next: ComplexNode): void {
    if (!nodeIsGroup(node)) {
      onchange(next);
      return;
    }
    const children = groupChildren(node);
    const i = children.findIndex((c) => c === leaf);
    if (i >= 0) updateChild(i, next);
  }

  function inputType(leaf: ComplexNode): string {
    const t = cfg.fields[leafField(leaf)]?.type;
    return t === "number" ? "number" : t === "date" ? "date" : "text";
  }
</script>

{#snippet relRow(r: ComplexNode, onChange: (n: ComplexNode) => void)}
  {#if nodeIsRel(r)}
    {@const targetCfg = LABEL_CONFIGS[r.label]}
    <div class="rel-row">
      <span class="rel-arrow">(:{cfg.label})</span>
      <span class="sep">{r.dir === "out" ? "–[" : "<–["}</span>
      <select
        value={r.rel}
        onchange={(e) => onChange({ ...r, rel: e.currentTarget.value })}
      >
        {#each REL_TYPES as t (t)}
          <option value={t}>:{t}</option>
        {/each}
      </select>
      <select
        value={r.dir}
        onchange={(e) => onChange({ ...r, dir: e.currentTarget.value as "out" | "in" })}
      >
        <option value="out">→</option>
        <option value="in">←</option>
      </select>
      <span class="sep">]–>(</span>
      <select
        value={r.label}
        onchange={(e) => onChange({ ...r, label: e.currentTarget.value, where: { and: [] } })}
      >
        {#each Object.keys(LABEL_CONFIGS) as l (l)}
          <option value={l}>{l}</option>
        {/each}
      </select>
      <span class="sep">)</span>
      {#if targetCfg}
        <div class="rel-grow">
          <FilterTree cfg={targetCfg} node={r.where} onchange={(n) => onChange({ ...r, where: n })} />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#if nodeIsGroup(node)}
  {@const k = groupKey(node)}
  <div class="tree-group" class:root={isRoot()}>
    <div class="group-head">
      <div class="group-tabs">
        {#each GROUP_ORDER as g (g)}
          <button class="gtab" class:active={k === g} onclick={cycleGroup}>{g.toUpperCase()}</button>
        {/each}
      </div>
      <div class="group-actions">
        <button class="mini" onclick={addLeaf}>+ Attribute</button>
        <button class="mini" onclick={addRel}>+ Relationship</button>
        <button class="mini" onclick={addGroup}>+ Group</button>
        {#if !isRoot()}
          <button class="mini x" onclick={remove} title="Remove group"><Icon name="close" size="1em" /></button>
        {/if}
      </div>
    </div>

    {#each groupChildren(node) as child, i (i)}
      {#if nodeIsRel(child)}
        <div class="child-row">
          <button class="mini x" onclick={() => removeChild(i)} title="Remove"><Icon name="close" size="1em" /></button>
          <div class="child-grow">
            {@render relRow(child, (n) => updateChild(i, n))}
          </div>
        </div>
      {:else if nodeIsGroup(child)}
        <div class="child-row">
          <button class="mini x" onclick={() => removeChild(i)} title="Remove"><Icon name="close" size="1em" /></button>
          <div class="child-grow">
            <FilterTree cfg={cfg} node={child} onchange={(n) => updateChild(i, n)} />
          </div>
        </div>
      {:else}
        <div class="leaf-row">
          <button class="mini x" onclick={() => removeChild(i)} title="Remove"><Icon name="close" size="1em" /></button>
          <select value={leafField(child)} onchange={(e) => updateChild(i, setLeafField(child, e.currentTarget.value))}>
            {#each Object.entries(cfg.fields) as [k, f] (k)}
              <option value={k}>{f.label}</option>
            {/each}
          </select>
          <select class="op" value={leafOp(child)} onchange={(e) => updateChild(i, setLeafOp(child, e.currentTarget.value))}>
            {#each opsFor(child) as op (op)}
              <option value={op}>{op}</option>
            {/each}
          </select>

          {#if cfg.fields[leafField(child)]?.type === "enum"}
            <select value={valAsStr(leafValue(child))} onchange={(e) => commitValue(child, e.currentTarget.value)}>
              {#each (cfg.fields[leafField(child)]?.enumValues ?? []) as v (v)}
                <option value={v}>{v}</option>
              {/each}
            </select>
          {:else if leafOp(child) === "between"}
            <input
              type={inputType(child)}
              placeholder="from"
              value={Array.isArray(leafValue(child)) ? valAsStr((leafValue(child) as unknown[])[0]) : ""}
              onchange={(e) => commitValue(child, e.currentTarget.value, 0)}
            />
            <span class="sep">:</span>
            <input
              type={inputType(child)}
              placeholder="to"
              value={Array.isArray(leafValue(child)) ? valAsStr((leafValue(child) as unknown[])[1]) : ""}
              onchange={(e) => commitValue(child, e.currentTarget.value, 1)}
            />
          {:else}
            <input
              type={inputType(child)}
              placeholder="value"
              value={valAsStr(leafValue(child))}
              onchange={(e) => commitValue(child, e.currentTarget.value)}
            />
          {/if}
        </div>
      {/if}
    {/each}

    {#if groupChildren(node).length === 0}
      <div class="empty">No conditions — click "+ Attribute"</div>
    {/if}
  </div>
{:else if nodeIsRel(node)}
  <div class="child-row">
    <div class="child-grow">
      {@render relRow(node, (n) => onchange(n))}
    </div>
  </div>
{:else}
  <div class="leaf-row">
    <select value={leafField(node)} onchange={(e) => updateLeafNode(node, setLeafField(node, e.currentTarget.value))}>
      {#each Object.entries(cfg.fields) as [k, f] (k)}
        <option value={k}>{f.label}</option>
      {/each}
    </select>
    <select class="op" value={leafOp(node)} onchange={(e) => updateLeafNode(node, setLeafOp(node, e.currentTarget.value))}>
      {#each opsFor(node) as op (op)}
        <option value={op}>{op}</option>
      {/each}
    </select>
    <input type="text" placeholder="value" value={valAsStr(leafValue(node))} onchange={(e) => commitValue(node, e.currentTarget.value)} />
  </div>
{/if}

<style>
  .tree-group {
    background: var(--indigo-box);
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tree-group.root {
    border: 1px solid #3a336b;
  }

  .group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .group-tabs {
    display: flex;
    gap: 4px;
  }

  .gtab {
    background: transparent;
    border: none;
    color: #9a93d4;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .gtab.active {
    background: #3a336b;
    color: #fff;
  }

  .group-actions {
    display: flex;
    gap: 6px;
  }

  .mini {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: #cfc9f0;
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .mini:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .mini.x {
    padding: 4px 6px;
    color: #9a93d4;
    flex-shrink: 0;
  }

  .leaf-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .leaf-row select,
  .leaf-row input {
    flex: 1;
    min-width: 90px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #3a336b;
    color: #fff;
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 13px;
  }

  .leaf-row select.op {
    flex: 0 0 auto;
    min-width: 0;
  }

  .sep {
    color: #9a93d4;
    font-size: 13px;
  }

  .child-row {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }

  .child-grow {
    flex: 1;
    min-width: 0;
  }

  .rel-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid #3a336b;
    border-radius: 8px;
    padding: 6px 8px;
  }

  .rel-row select {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid #3a336b;
    color: #fff;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 13px;
    flex: 0 0 auto;
  }

  .rel-arrow {
    color: #9a93d4;
    font-size: 12px;
  }

  .rel-grow {
    flex: 1 1 100%;
    min-width: 0;
    margin-top: 4px;
  }

  .empty {
    color: #9a93d4;
    font-size: 13px;
    padding: 8px;
    text-align: center;
  }
</style>
