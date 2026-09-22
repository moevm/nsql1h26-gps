<script lang="ts">
  import EntityPage from "../../components/EntityPage.svelte";
  import Modal from "../../components/Modal.svelte";
  import Icon from "../../components/Icon.svelte";
  import TriggerRulesEditor from "../../components/TriggerRulesEditor.svelte";
  import { ADMIN_ENTITY_CONFIGS } from "../../lib/filter";
  import { client, unwrap } from "../../lib/api";
  import { fmtDateShort, fmtDateTime, ruleText } from "../../lib/format";
  import { toast } from "../../lib/toast.svelte";
  import type { AdminQuestDetail, Quest, TriggerRule } from "../../lib/types";

  const cfg = ADMIN_ENTITY_CONFIGS.quests;

  interface QuestForm {
    name: string;
    description: string;
    reward: string;
    duration: string;
    note: string;
    rules: TriggerRule[];
    dependsOn: number[];
  }

  let formOpen = $state(false);
  let formMode = $state<"create" | "edit">("create");
  let formId = $state<number | null>(null);
  let form = $state<QuestForm>(emptyForm());
  let formBusy = $state(false);
  let formError = $state<string | null>(null);
  let allQuests = $state<Quest[]>([]);
  let refreshTick = $state(0);

  function emptyForm(): QuestForm {
    return { name: "", description: "", reward: "", duration: "", note: "", rules: [], dependsOn: [] };
  }

  function openCreate(): void {
    formMode = "create";
    formId = null;
    form = emptyForm();
    formError = null;
    formOpen = true;
  }

  async function openEdit(q: AdminQuestDetail): Promise<void> {
    try {
      allQuests = (await unwrap(await client.admin.quests.get({ query: { page: 1, pageSize: 100 } }))).items as Quest[];
    } catch {
      allQuests = [];
    }
    const rules: TriggerRule[] = Array.isArray(q.trigger_rules)
      ? (q.trigger_rules as TriggerRule[])
      : typeof q.trigger_rules === "string"
        ? (JSON.parse(q.trigger_rules) as TriggerRule[])
        : [];
    formMode = "edit";
    formId = q.id;
    form = {
      name: q.name,
      description: q.description ?? "",
      reward: q.reward ?? "",
      duration: q.duration ?? "",
      note: q.note ?? "",
      rules,
      dependsOn: q.dependsOn.map((d) => d.id),
    };
    formError = null;
    formOpen = true;
  }

  async function submitForm(): Promise<void> {
    if (formBusy) return;
    formBusy = true;
    formError = null;
    const body: Record<string, unknown> = {
      name: form.name,
      trigger_rules: form.rules,
      depends_on: form.dependsOn,
    };
    for (const [k, v] of Object.entries({
      description: form.description,
      reward: form.reward,
      duration: form.duration,
      note: form.note,
    })) {
      if (v) body[k] = v;
    }
    try {
      if (formMode === "create") {
        await unwrap(await client.admin.quests.post(body as never));
        toast("ok", "Quest created");
      } else {
        await unwrap(await client.admin.quests({ id: formId! }).patch(body as never));
        toast("ok", "Quest updated");
      }
      formOpen = false;
      refreshTick++;
    } catch (e) {
      formError = e instanceof Error ? e.message : "Error";
    } finally {
      formBusy = false;
    }
  }

  function patchNote(q: AdminQuestDetail, value: string, reload: () => Promise<void>): void {
    if (value === (q.note ?? "")) return;
    void client.admin.quests({ id: q.id })
      .patch({ note: value })
      .then(unwrap)
      .then(() => {
        toast("ok", "Note saved");
        void reload();
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Error"));
  }

  function parsedRules(q: AdminQuestDetail): TriggerRule[] {
    if (Array.isArray(q.trigger_rules)) return q.trigger_rules as TriggerRule[];
    if (typeof q.trigger_rules === "string") {
      try {
        return JSON.parse(q.trigger_rules) as TriggerRule[];
      } catch {
        return [];
      }
    }
    return [];
  }
</script>

{#snippet cell(q: AdminQuestDetail, key: string)}
  {#if key === "id"}
    <span class="dim">#{q.id}</span>
  {:else if key === "name"}
    {q.name}
  {:else if key === "reward" || key === "duration"}
    <span class="nowrap">{(q as unknown as Record<string, unknown>)[key] == null ? "—" : String((q as unknown as Record<string, unknown>)[key])}</span>
  {:else if key === "created_at"}
    <span class="dim">{fmtDateShort(q[key] as string)}</span>
  {:else}
    {(q as unknown as Record<string, unknown>)[key] == null ? "—" : String((q as unknown as Record<string, unknown>)[key])}
  {/if}
{/snippet}

{#snippet detail(q: AdminQuestDetail, reload: () => Promise<void>)}
  <div class="name">{q.name} <span class="dim">#{q.id}</span></div>
  <p class="desc">{q.description}</p>

  <div class="grid">
    <div><div class="lbl">Reward</div>{q.reward ?? "none"}</div>
    <div><div class="lbl">Duration</div>{q.duration ?? "none"}</div>
    <div><div class="lbl">Created at</div>{fmtDateTime(q.created_at)}</div>
    <div><div class="lbl">Updated at</div>{fmtDateTime(q.updated_at)}</div>
    <div><div class="lbl">Depends on</div>
      {#each q.dependsOn as d (d.id)}
        <span class="chip static">{d.name}</span>
      {/each}
      {#if q.dependsOn.length === 0}<span class="muted">none</span>{/if}
    </div>
    <div><div class="lbl">Conditions</div>{ruleText(parsedRules(q)) || "none"}</div>
  </div>

  <div class="field-label">Note</div>
  <div class="note-wrap">
    <textarea
      rows="3"
      placeholder="Take note"
      value={q.note ?? ""}
      onblur={(e) => patchNote(q, e.currentTarget.value, reload)}
    ></textarea>
    <span class="pencil"><Icon name="edit" /></span>
  </div>

  <div class="field-label">Activity log</div>
  <table class="tbl">
    <thead>
      <tr><th>Event ID</th><th>Timestamp</th><th>Message</th></tr>
    </thead>
    <tbody>
      {#each q.relatedLogs as l (l.id)}
        <tr>
          <td class="dim mono">#{l.id}</td>
          <td class="dim mono">{fmtDateTime(l.timestamp)}</td>
          <td>{l.description}</td>
        </tr>
      {/each}
      {#if q.relatedLogs.length === 0}<tr><td colspan="3" class="muted">No events</td></tr>{/if}
    </tbody>
  </table>
{/snippet}

{#snippet actions(q: AdminQuestDetail, reload: () => Promise<void>)}
  <button class="btn btn-ghost" onclick={() => openEdit(q)}><Icon name="edit" /> Edit</button>
{/snippet}

{#if formOpen}
  <Modal title={formMode === "create" ? "New quest" : `Edit quest #${formId}`} onclose={() => (formOpen = false)}>
      <div class="form">
        {#if formError}<div class="error">{formError}</div>{/if}

        <div class="field-label">Name</div>
        <input type="text" placeholder="Find mystery castle" bind:value={form.name} />

        <div class="field-label">Description</div>
        <textarea rows="3" placeholder="Description" bind:value={form.description}></textarea>

        <div class="row2">
          <div>
            <div class="field-label">Reward</div>
            <input type="text" placeholder="100 XP" bind:value={form.reward} />
          </div>
          <div>
            <div class="field-label">Duration</div>
            <input type="text" placeholder="7 days" bind:value={form.duration} />
          </div>
        </div>

        <div class="field-label">Conditions (trigger rules)</div>
        <TriggerRulesEditor rules={form.rules} onchange={(r) => (form = { ...form, rules: r })} />

        <div class="field-label">Depends on quests</div>
        <div class="deps">
          {#each allQuests as q (q.id)}
            {#if q.id !== formId}
              <label class="dep-check">
                <input
                  type="checkbox"
                  checked={form.dependsOn.includes(q.id)}
                  onchange={(e) =>
                    (form = {
                      ...form,
                      dependsOn: e.currentTarget.checked
                        ? [...form.dependsOn, q.id]
                        : form.dependsOn.filter((d) => d !== q.id),
                    })
                  }
                />
                {q.name} <span class="dim">#{q.id}</span>
              </label>
            {/if}
          {/each}
        </div>

        <div class="field-label">Note</div>
        <textarea rows="2" placeholder="Take note" bind:value={form.note}></textarea>

        <div class="btns">
          <button class="btn btn-ghost" onclick={() => (formOpen = false)}>Cancel</button>
          <button class="btn btn-primary" disabled={formBusy || !form.name.trim()} onclick={() => submitForm()}>
            {formMode === "create" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
{/if}

<EntityPage
  {cfg}
  apiPrefix="/admin/quests"
  title="Found quests"
  searchLabel="Search by title"
  searchField="name"
  dateField="created_at"
  dateLabel="Created at"
  orderFields={["reward", "duration", "id"]}
  columns={[
    { key: "id", label: "ID" },
    { key: "name", label: "Title" },
    { key: "reward", label: "Reward" },
    { key: "duration", label: "Duration" },
    { key: "created_at", label: "Created at" },
  ]}
  emptyTitle="No quests selected"
  emptySub="Select one to see details"
  createTitle="New quest"
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
    margin-bottom: 8px;
  }

  .desc {
    color: var(--text-dim);
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
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

  .nowrap {
    white-space: nowrap;
  }

  .chip.static {
    cursor: default;
    background: var(--panel-2);
    color: var(--text);
  }

  .chip.static:hover {
    color: var(--text);
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

  .deps {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 140px;
    overflow-y: auto;
  }

  .dep-check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }

  .dep-check input {
    width: auto;
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
