<script lang="ts">
  import EntityPage from "../../components/EntityPage.svelte";
  import Modal from "../../components/Modal.svelte";
  import Icon from "../../components/Icon.svelte";
  import { ADMIN_ENTITY_CONFIGS } from "../../lib/filter";
  import { client, unwrap } from "../../lib/api";
  import { fmtDateShort, fmtDateTime } from "../../lib/format";
  import { toast } from "../../lib/toast.svelte";
  import type { AdminPoiDetail } from "../../lib/types";

  const cfg = ADMIN_ENTITY_CONFIGS.pois;

  interface PoiForm {
    name: string;
    type: string;
    description: string;
    tags: string;
    latitude: string;
    longitude: string;
    note: string;
  }

  let formOpen = $state(false);
  let formMode = $state<"create" | "edit">("create");
  let formId = $state<number | null>(null);
  let form = $state<PoiForm>({ name: "", type: "", description: "", tags: "", latitude: "", longitude: "", note: "" });
  let formBusy = $state(false);
  let formError = $state<string | null>(null);
  let refreshTick = $state(0);

  function openCreate(): void {
    formMode = "create";
    formId = null;
    form = { name: "", type: "", description: "", tags: "", latitude: "", longitude: "", note: "" };
    formError = null;
    formOpen = true;
  }

  function openEdit(p: AdminPoiDetail): void {
    formMode = "edit";
    formId = p.id;
    form = {
      name: p.name,
      type: p.type,
      description: p.description ?? "",
      tags: p.tags ?? "",
      latitude: String(p.location?.latitude ?? ""),
      longitude: String(p.location?.longitude ?? ""),
      note: p.note ?? "",
    };
    formError = null;
    formOpen = true;
  }

  async function submitForm(): Promise<void> {
    if (formBusy) return;
    formBusy = true;
    formError = null;
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      formError = "latitude/longitude must be numbers";
      formBusy = false;
      return;
    }
    const body: Record<string, unknown> = { name: form.name, type: form.type, location: { latitude, longitude } };
    for (const [k, v] of Object.entries({ description: form.description, tags: form.tags, note: form.note })) {
      if (v) body[k] = v;
    }
    try {
      if (formMode === "create") {
        await unwrap(await client.admin.pois.post(body as never));
        toast("ok", "POI created");
      } else {
        await unwrap(await client.admin.pois({ id: formId! }).patch(body as never));
        toast("ok", "POI updated");
      }
      formOpen = false;
      refreshTick++;
    } catch (e) {
      formError = e instanceof Error ? e.message : "Error";
    } finally {
      formBusy = false;
    }
  }

  function patchNote(p: AdminPoiDetail, value: string, reload: () => Promise<void>): void {
    if (value === (p.note ?? "")) return;
    void client.admin.pois({ id: p.id })
      .patch({ note: value })
      .then(unwrap)
      .then(() => {
        toast("ok", "Note saved");
        void reload();
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Error"));
  }
</script>

{#snippet cell(p: AdminPoiDetail, key: string)}
  {#if key === "id"}
    <span class="dim">#{p.id}</span>
  {:else if key === "location"}
    {#if p.location}
      <span class="mono">{p.location.latitude.toFixed(4)}, {p.location.longitude.toFixed(4)}</span>
    {:else}
      —
    {/if}
  {:else if key === "created_at"}
    <span class="dim">{fmtDateShort(p[key] as string)}</span>
  {:else}
    {(p as unknown as Record<string, unknown>)[key] == null ? "—" : String((p as unknown as Record<string, unknown>)[key])}
  {/if}
{/snippet}

{#snippet detail(p: AdminPoiDetail, reload: () => Promise<void>)}
  <div class="name">{p.name} <span class="dim">#{p.id}</span></div>
  <div class="type-tag">{p.type}</div>
  <p class="desc">{p.description}</p>

  <div class="grid">
    <div><div class="lbl">Latitude</div>{p.location?.latitude ?? "—"}</div>
    <div><div class="lbl">Longitude</div>{p.location?.longitude ?? "—"}</div>
    <div><div class="lbl">H3 cell</div><span class="mono">{p.cellIndex ?? "—"}</span></div>
    <div><div class="lbl">Created at</div>{fmtDateTime(p.created_at)}</div>
    <div><div class="lbl">Tags</div>{p.tags ?? "—"}</div>
    <div><div class="lbl">Updated at</div>{fmtDateTime(p.updated_at)}</div>
  </div>

  <div class="field-label">Note</div>
  <div class="note-wrap">
    <textarea
      rows="3"
      placeholder="Take note"
      value={p.note ?? ""}
      onblur={(e) => patchNote(p, e.currentTarget.value, reload)}
    ></textarea>
    <span class="pencil"><Icon name="edit" /></span>
  </div>

  <div class="field-label">Activity log</div>
  <table class="tbl">
    <thead>
      <tr><th>Event ID</th><th>Timestamp</th><th>Message</th></tr>
    </thead>
    <tbody>
      {#each p.relatedLogs as l (l.id)}
        <tr>
          <td class="dim mono">#{l.id}</td>
          <td class="dim mono">{fmtDateTime(l.timestamp)}</td>
          <td>{l.description}</td>
        </tr>
      {/each}
      {#if p.relatedLogs.length === 0}<tr><td colspan="3" class="muted">No events</td></tr>{/if}
    </tbody>
  </table>
{/snippet}

{#snippet actions(p: AdminPoiDetail, _reload: () => Promise<void>)}
  <button class="btn btn-ghost" onclick={() => openEdit(p)}><Icon name="edit" /> Edit</button>
{/snippet}

{#if formOpen}
  <Modal title={formMode === "create" ? "New POI" : `Edit POI #${formId}`} onclose={() => (formOpen = false)}>
      <div class="form">
        {#if formError}<div class="error">{formError}</div>{/if}

        <div class="field-label">Name</div>
        <input type="text" placeholder="Исаакиевский собор" bind:value={form.name} />

        <div class="field-label">Type</div>
        <input type="text" placeholder="monument / museum / park / cafe…" bind:value={form.type} />

        <div class="field-label">Description</div>
        <textarea rows="3" placeholder="Description" bind:value={form.description}></textarea>

        <div class="row2">
          <div>
            <div class="field-label">Latitude</div>
            <input type="number" step="any" placeholder="59.93" bind:value={form.latitude} />
          </div>
          <div>
            <div class="field-label">Longitude</div>
            <input type="number" step="any" placeholder="30.31" bind:value={form.longitude} />
          </div>
        </div>

        <div class="field-label">Tags</div>
        <input type="text" placeholder="history, architecture" bind:value={form.tags} />

        <div class="field-label">Note</div>
        <textarea rows="2" placeholder="Take note" bind:value={form.note}></textarea>

        <div class="btns">
          <button class="btn btn-ghost" onclick={() => (formOpen = false)}>Cancel</button>
          <button class="btn btn-primary" disabled={formBusy || !form.name.trim() || !form.type.trim()} onclick={() => submitForm()}>
            {formMode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
{/if}

<EntityPage
  {cfg}
  apiPrefix="/admin/pois"
  title="Found POIs"
  searchLabel="Search by name"
  searchField="name"
  dateField="created_at"
  dateLabel="Created at"
  orderFields={["name", "type", "id"]}
  columns={[
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "location", label: "Coordinates" },
  ]}
  emptyTitle="No POIs selected"
  emptySub="Select one to see details"
  createTitle="New POI"
  onCreate={openCreate}
  {refreshTick}
  {cell}
  {detail}
  {actions}
/>

<style>
  .name {
    font-size: 22px;
    font-weight: 700;
    margin-bottom: 6px;
  }

  .type-tag {
    display: inline-block;
    background: var(--indigo-box);
    border: 1px solid #3a336b;
    color: #cfc9f0;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .desc {
    color: var(--text-dim);
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 16px;
    font-size: 14px;
  }

  .lbl {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 3px;
  }

  .note-wrap {
    position: relative;
  }

  .note-wrap textarea {
    padding-right: 38px;
  }

  .pencil {
    position: absolute;
    right: 12px;
    top: 12px;
    color: var(--text-dim);
  }

  .form {
    display: flex;
    flex-direction: column;
  }

  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .btns {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  }

  .error {
    background: #3a1515;
    border: 1px solid #5a2020;
    color: var(--red);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
    margin-bottom: 12px;
  }
</style>
