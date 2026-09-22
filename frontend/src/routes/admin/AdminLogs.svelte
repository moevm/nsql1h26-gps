<script lang="ts">
  import SelectionPanel from "../../components/SelectionPanel.svelte";
  import Pager from "../../components/Pager.svelte";
  import Modal from "../../components/Modal.svelte";
  import Icon from "../../components/Icon.svelte";
  import {
    ADMIN_ENTITY_CONFIGS,
    listStateFromQuery,
    listStateToQuery,
    type ListState,
  } from "../../lib/filter";
  import { client, qsToObj, unwrap } from "../../lib/api";
  import { current, setQuery } from "../../lib/router.svelte";
  import { fmtDateTime } from "../../lib/format";
  import type { LogEntry } from "../../lib/types";

  const cfg = ADMIN_ENTITY_CONFIGS.logs;

  const listState: ListState = $derived(listStateFromQuery(cfg, current.query));

  let items = $state<LogEntry[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let rawModal = $state<LogEntry | null>(null);
  let rawLoading = $state(false);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const q = listStateToQuery(cfg, listState);
      const res = await unwrap(await client.admin.logs.get({ query: qsToObj(q) }));
      items = res.items as LogEntry[];
      total = res.total;
    } catch (e) {
      error = e instanceof Error ? e.message : "Ошибка загрузки";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });

  function updateState(s: ListState): void {
    setQuery(listStateToQuery(cfg, s));
  }

  function resetFilters(): void {
    setQuery(new URLSearchParams());
  }

  async function viewRaw(l: LogEntry): Promise<void> {
    rawLoading = true;
    rawModal = l;
    try {
      const raw = await unwrap(await client.admin.logs({ id: l.id }).raw.get());
      rawModal = raw as LogEntry;
    } catch {
    } finally {
      rawLoading = false;
    }
  }

  const priorityTag = (p: LogEntry["priority"]) =>
    p === "High" ? "tag-red" : p === "Medium" ? "tag-orange" : "tag-green";
</script>

<div class="logs-page">
  <div class="logs-filters">
    <SelectionPanel
      {cfg}
      listState={listState}
      searchLabel="Message text, entity id, log id…"
      searchField="description"
      dateField="timestamp"
      dateLabel="Time range"
      orderFields={["id", "timestamp", "priority"]}
      onchange={updateState}
    />
  </div>

  <div class="panel table-panel">
    <div class="table-head">
      <h3>Event log</h3>
      <div class="head-btns">
        <button class="btn btn-ghost" onclick={resetFilters}><Icon name="refresh" /> Reset filters</button>
      </div>
    </div>

    {#if loading}
      <div class="empty-state"><span>Loading…</span></div>
    {:else if error}
      <div class="empty-state">
        <span class="big" style="color:var(--red)">Ошибка</span>
        <span>{error}</span>
      </div>
    {:else}
      <table class="tbl">
        <thead>
          <tr>
            <th>ID</th>
            <th>Priority</th>
            <th>Entity type</th>
            <th>Description</th>
            <th>Timestamp</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each items as l (l.id)}
            <tr>
              <td class="dim mono">#{l.id}</td>
              <td><span class="tag {priorityTag(l.priority)}"><span class="dot"></span>{l.priority}</span></td>
              <td>{l.entity_type}</td>
              <td>{l.description}</td>
              <td class="dim mono nowrap">{fmtDateTime(l.timestamp)}</td>
              <td class="nowrap">
                <button class="raw-btn" onclick={() => viewRaw(l)}>view raw</button>
              </td>
            </tr>
          {/each}
          {#if items.length === 0}
            <tr><td colspan="6" class="muted" style="text-align:center">Nothing found</td></tr>
          {/if}
        </tbody>
      </table>
      <Pager page={listState.page} pageSize={listState.pageSize} {total} onchange={(p) => updateState({ ...listState, page: p })} />
    {/if}
  </div>
</div>

{#if rawModal}
  <Modal title={`Raw log #${rawModal.id}`} onclose={() => (rawModal = null)}>
    {#if rawLoading}
      <div class="empty-state"><span>Loading…</span></div>
    {:else}
      <pre class="raw">{JSON.stringify(rawModal, null, 2)}</pre>
    {/if}
  </Modal>
{/if}

<style>
  .logs-page {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .logs-filters {
    grid-column: 1 / span 4;
    min-width: 0;
  }

  .table-panel {
    grid-column: 5 / span 8;
    overflow-x: auto;
    position: relative;
  }

  .table-panel::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 20px;
    pointer-events: none;
    background: linear-gradient(270deg, rgba(31, 31, 31, 0.85), rgba(31, 31, 31, 0));
  }

  .table-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .table-head h3 {
    margin: 0;
  }

  .head-btns {
    display: flex;
    gap: 8px;
  }

  table.tbl {
    min-width: 760px;
  }

  td.nowrap {
    white-space: nowrap;
  }

  .raw-btn {
    white-space: nowrap;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font: inherit;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    cursor: pointer;
  }

  .raw-btn:hover {
    color: var(--text);
  }

  .raw {
    background: #151515;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    overflow: auto;
    max-height: 60vh;
    font-size: 12px;
    line-height: 1.5;
    color: #d0d0d0;
  }

  @media (max-width: 1100px) {
    .logs-filters,
    .table-panel {
      grid-column: 1 / -1;
    }
  }
</style>
