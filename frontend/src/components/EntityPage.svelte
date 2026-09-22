<script lang="ts" generics="T extends { id: number }">
  import { client, qsToObj, unwrap, type TreatyResult } from "../lib/api";
  import {
    listStateFromQuery,
    listStateToQuery,
    type EntityConfig,
    type ListState,
  } from "../lib/filter";

  interface ListSection {
    get(args: { query?: import("../lib/api").ListQueryParams }): Promise<TreatyResult<AdminListResponse<unknown>>>;
    (args: { id: number }): { get: () => Promise<TreatyResult<unknown>> };
  }

  const LIST_SECTIONS: Record<string, ListSection> = {
    "/admin/users": client.admin.users as unknown as ListSection,
    "/admin/quests": client.admin.quests as unknown as ListSection,
    "/admin/pois": client.admin.pois as unknown as ListSection,
    "/admin/achievements": client.admin.achievements as unknown as ListSection,
    "/admin/logs": client.admin.logs as unknown as ListSection,
  };
  import { current, navigate, setQuery } from "../lib/router.svelte";
  import SelectionPanel from "./SelectionPanel.svelte";
  import Pager from "./Pager.svelte";
  import type { AdminListResponse } from "../lib/types";
  import type { Snippet } from "svelte";

  let {
    cfg,
    apiPrefix,
    title,
    searchLabel,
    searchField,
    dateField = undefined,
    dateLabel = "Period",
    orderFields,
    columns,
    emptyTitle,
    emptySub,
    createTitle = null,
    detail,
    actions,
    onCreate = null,
    cell = null,
    refreshTick = 0,
  }: {
    cfg: EntityConfig;
    apiPrefix: string;
    title: string;
    searchLabel: string;
    searchField: string;
    dateField?: string;
    dateLabel?: string;
    orderFields: string[];
    columns: { key: string; label: string }[];
    emptyTitle: string;
    emptySub: string;
    createTitle?: string | null;
    detail: Snippet<[T, () => Promise<void>]>;
    actions?: Snippet<[T, () => Promise<void>]>;
    onCreate?: (() => void) | null;
    cell?: Snippet<[T, string]> | null;
    refreshTick?: number;
  } = $props();

  const listState: ListState = $derived(listStateFromQuery(cfg, current.query));

  let items = $state<T[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let listError = $state<string | null>(null);

  let selectedId = $state<number | null>(null);
  let detailItem = $state<T | null>(null);
  let detailLoading = $state(false);
  let detailError = $state<string | null>(null);

  $effect(() => {
    void refreshTick;
    void loadList();
  });

  $effect(() => {
    void refreshTick;
    if (selectedId != null) void select(selectedId);
  });

  async function loadList(): Promise<void> {
    loading = true;
    listError = null;
    try {
      const q = listStateToQuery(cfg, listState);
      const section = LIST_SECTIONS[apiPrefix];
      if (!section) throw new Error(`no eden section for ${apiPrefix}`);
      const res = (await unwrap(await section.get({ query: qsToObj(q) }))) as AdminListResponse<T>;
      items = res.items;
      total = res.total;
      if (res.items.length === 0 && res.page > 1) {
        navigate(current.path, { ...Object.fromEntries(current.query), page: String(res.page - 1) });
      }
    } catch (e) {
      listError = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading = false;
    }
  }

  function updateState(s: ListState): void {
    setQuery(listStateToQuery(cfg, s));
  }

  function changePage(p: number): void {
    updateState({ ...listState, page: p });
  }

  async function select(id: number): Promise<void> {
    selectedId = id;
    detailLoading = true;
    detailError = null;
    try {
      const section = LIST_SECTIONS[apiPrefix];
      detailItem = (await unwrap(await section({ id }).get())) as T;
    } catch (e) {
      detailError = e instanceof Error ? e.message : "Failed to load";
      detailItem = null;
    } finally {
      detailLoading = false;
    }
  }

  async function reloadDetail(): Promise<void> {
    if (selectedId != null) await select(selectedId);
    await loadList();
  }
</script>

<div class="entity-page">
  <div class="left-col">
    <SelectionPanel
      {cfg}
      listState={listState}
      {searchLabel}
      {searchField}
      {dateField}
      {dateLabel}
      {orderFields}
      onchange={updateState}
    />

    <div class="panel table-panel">
      <div class="table-head">
        <h3>{title}</h3>
        {#if createTitle && onCreate}
          <button class="btn btn-primary" onclick={onCreate}>+ {createTitle}</button>
        {/if}
      </div>

      {#if loading}
        <div class="empty-state"><span>Loading…</span></div>
      {:else if listError}
        <div class="empty-state">
          <span class="big" style="color:var(--red)">Ошибка</span>
          <span>{listError}</span>
        </div>
      {:else if items.length === 0}
        <div class="empty-state">
          <span class="big">Nothing found</span>
          <span>Try changing filters</span>
        </div>
      {:else}
        <table class="tbl">
          <thead>
            <tr>
              {#each columns as c (c.key)}
                <th>{c.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr class:selected={selectedId === item.id} onclick={() => select(item.id)}>
                {#each columns as c (c.key)}
                  <td class={typeof (item as Record<string, unknown>)[c.key] === "number" ? "mono" : ""}>
                    {#if cell}
                      {@render cell(item, c.key)}
                    {:else}
                      {@const v = (item as Record<string, unknown>)[c.key]}
                      {v == null ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <Pager page={listState.page} pageSize={listState.pageSize} {total} onchange={changePage} />
      {/if}
    </div>
  </div>

  <div class="right-col">
    {#if selectedId == null}
      <div class="panel empty-state big-panel">
        <span class="big">{emptyTitle}</span>
        <span class="muted">{emptySub}</span>
      </div>
    {:else if detailLoading}
      <div class="panel empty-state big-panel"><span>Loading…</span></div>
    {:else if detailError || !detailItem}
      <div class="panel empty-state big-panel">
        <span class="big" style="color:var(--red)">Ошибка</span>
        <span class="muted">{detailError}</span>
      </div>
    {:else}
      <div class="panel detail-card">
        {@render detail(detailItem, reloadDetail)}
      </div>

      {#if actions}
        <div class="panel actions-panel">
          <div class="actions-label">Actions:</div>
          <div class="actions-row">
            {@render actions(detailItem, reloadDetail)}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>


<style>
  .entity-page {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .left-col {
    grid-column: 1 / span 4;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .table-panel {
    overflow-x: auto;
    position: relative;
  }

  .table-panel table.tbl {
    min-width: 560px;
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

  .right-col {
    grid-column: 5 / span 8;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    position: sticky;
    top: 73px;
  }

  .table-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .table-head h3 {
    margin: 0;
  }

  .big-panel {
    min-height: 400px;
  }

  .actions-panel {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .actions-label {
    font-weight: 700;
  }

  .actions-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  @media (max-width: 1100px) {
    .left-col,
    .right-col {
      grid-column: 1 / -1;
    }

    .right-col {
      position: static;
    }
  }
</style>
