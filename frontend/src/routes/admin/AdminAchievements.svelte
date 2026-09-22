<script lang="ts">
  import EntityPage from "../../components/EntityPage.svelte";
  import Modal from "../../components/Modal.svelte";
  import Icon from "../../components/Icon.svelte";
  import TriggerRulesEditor from "../../components/TriggerRulesEditor.svelte";
  import { ADMIN_ENTITY_CONFIGS } from "../../lib/filter";
  import { client, unwrap } from "../../lib/api";
  import { fmtDateShort, fmtDateTime, ruleText } from "../../lib/format";
  import { toast } from "../../lib/toast.svelte";
  import type { AdminAchievementDetail, Achievement, Quest, TriggerRule } from "../../lib/types";

  const cfg = ADMIN_ENTITY_CONFIGS.achievements;

  interface AchForm {
    name: string;
    description: string;
    reward: string;
    note: string;
    rules: TriggerRule[];
    requiresQuest: number | null;
    dependsOn: number[];
  }

  let formOpen = $state(false);
  let formMode = $state<"create" | "edit">("create");
  let formId = $state<number | null>(null);
  let form = $state<AchForm>({ name: "", description: "", reward: "", note: "", rules: [], requiresQuest: null, dependsOn: [] });
  let formBusy = $state(false);
  let formError = $state<string | null>(null);
  let refreshTick = $state(0);
  let allQuests = $state<Quest[]>([]);
  let allAchievements = $state<Achievement[]>([]);

  async function loadOptions(): Promise<void> {
    try {
      const [qs, as] = await Promise.all([
        unwrap(await client.admin.quests.get({ query: { page: 1, pageSize: 100 } })),
        unwrap(await client.admin.achievements.get({ query: { page: 1, pageSize: 100 } })),
      ]);
      allQuests = qs.items as Quest[];
      allAchievements = as.items as Achievement[];
    } catch {
      allQuests = [];
      allAchievements = [];
    }
  }

  function openCreate(): void {
    formMode = "create";
    formId = null;
    form = { name: "", description: "", reward: "", note: "", rules: [], requiresQuest: null, dependsOn: [] };
    formError = null;
    formOpen = true;
    void loadOptions();
  }

  async function openEdit(a: AdminAchievementDetail): Promise<void> {
    await loadOptions();
    const rules: TriggerRule[] = Array.isArray(a.trigger_rules)
      ? (a.trigger_rules as TriggerRule[])
      : typeof a.trigger_rules === "string"
        ? (JSON.parse(a.trigger_rules) as TriggerRule[])
        : [];
    formMode = "edit";
    formId = a.id;
    form = {
      name: a.name,
      description: a.description ?? "",
      reward: a.reward ?? "",
      note: a.note ?? "",
      rules,
      requiresQuest: a.requiresQuest[0]?.id ?? null,
      dependsOn: a.dependsOn.map((d) => d.id),
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
    if (form.requiresQuest != null) body.requires_quest = form.requiresQuest;
    for (const [k, v] of Object.entries({ description: form.description, reward: form.reward, note: form.note })) {
      if (v) body[k] = v;
    }
    try {
      if (formMode === "create") {
        await unwrap(await client.admin.achievements.post(body as never));
        toast("ok", "Achievement created");
      } else {
        await unwrap(await client.admin.achievements({ id: formId! }).patch(body as never));
        toast("ok", "Achievement updated");
      }
      formOpen = false;
      refreshTick++;
    } catch (e) {
      formError = e instanceof Error ? e.message : "Error";
    } finally {
      formBusy = false;
    }
  }

  function patchNote(a: AdminAchievementDetail, value: string, reload: () => Promise<void>): void {
    if (value === (a.note ?? "")) return;
    void client.admin.achievements({ id: a.id })
      .patch({ note: value })
      .then(unwrap)
      .then(() => {
        toast("ok", "Note saved");
        void reload();
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Error"));
  }

  function parsedRules(a: AdminAchievementDetail): TriggerRule[] {
    if (Array.isArray(a.trigger_rules)) return a.trigger_rules as TriggerRule[];
    if (typeof a.trigger_rules === "string") {
      try {
        return JSON.parse(a.trigger_rules) as TriggerRule[];
      } catch {
        return [];
      }
    }
    return [];
  }
</script>

{#snippet cell(a: AdminAchievementDetail, key: string)}
  {#if key === "id"}
    <span class="dim">#{a.id}</span>
  {:else if key === "created_at"}
    <span class="dim">{fmtDateShort(a[key] as string)}</span>
  {:else}
    {(a as unknown as Record<string, unknown>)[key] == null ? "—" : String((a as unknown as Record<string, unknown>)[key])}
  {/if}
{/snippet}

{#snippet detail(a: AdminAchievementDetail, reload: () => Promise<void>)}
  <div class="name">{a.name} <span class="dim">#{a.id}</span></div>
  <p class="desc">{a.description}</p>

  <div class="grid">
    <div><div class="lbl">Reward</div>{a.reward ?? "none"}</div>
    <div><div class="lbl">Created at</div>{fmtDateTime(a.created_at)}</div>
    <div><div class="lbl">Updated at</div>{fmtDateTime(a.updated_at)}</div>
    <div>
      <div class="lbl">Requires quest</div>
      {#each a.requiresQuest as q (q.id)}
        <span class="chip static">{q.name}</span>
      {/each}
      {#if a.requiresQuest.length === 0}<span class="muted">none</span>{/if}
    </div>
    <div>
      <div class="lbl">Depends on</div>
      {#each a.dependsOn as d (d.id)}
        <span class="chip static">{d.name}</span>
      {/each}
      {#if a.dependsOn.length === 0}<span class="muted">none</span>{/if}
    </div>
    <div><div class="lbl">Conditions</div>{ruleText(parsedRules(a)) || "none"}</div>
  </div>

  <div class="field-label">Note</div>
  <div class="note-wrap">
    <textarea
      rows="3"
      placeholder="Take note"
      value={a.note ?? ""}
      onblur={(e) => patchNote(a, e.currentTarget.value, reload)}
    ></textarea>
    <span class="pencil"><Icon name="edit" /></span>
  </div>
{/snippet}

{#snippet actions(a: AdminAchievementDetail, _reload: () => Promise<void>)}
  <button class="btn btn-ghost" onclick={() => openEdit(a)}><Icon name="edit" /> Edit</button>
{/snippet}

{#if formOpen}
  <Modal title={formMode === "create" ? "New achievement" : `Edit achievement #${formId}`} onclose={() => (formOpen = false)}>
      <div class="form">
        {#if formError}<div class="error">{formError}</div>{/if}

        <div class="field-label">Name</div>
        <input type="text" placeholder="Картограф" bind:value={form.name} />

        <div class="field-label">Description</div>
        <textarea rows="3" placeholder="Description" bind:value={form.description}></textarea>

        <div class="field-label">Reward</div>
        <input type="text" placeholder="50 XP" bind:value={form.reward} />

        <div class="field-label">Conditions (trigger rules)</div>
        <TriggerRulesEditor rules={form.rules} onchange={(r) => (form = { ...form, rules: r })} />

        <div class="field-label">Requires quest</div>
        <select value={form.requiresQuest ?? ""} onchange={(e) => (form = { ...form, requiresQuest: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
          <option value="">— none —</option>
          {#each allQuests as q (q.id)}
            <option value={q.id}>{q.name}</option>
          {/each}
        </select>

        <div class="field-label">Depends on achievements</div>
        <div class="deps">
          {#each allAchievements as d (d.id)}
            {#if d.id !== formId}
              <label class="dep-check">
                <input
                  type="checkbox"
                  checked={form.dependsOn.includes(d.id)}
                  onchange={(e) =>
                    (form = {
                      ...form,
                      dependsOn: e.currentTarget.checked
                        ? [...form.dependsOn, d.id]
                        : form.dependsOn.filter((x) => x !== d.id),
                    })
                  }
                />
                {d.name} <span class="dim">#{d.id}</span>
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
  apiPrefix="/admin/achievements"
  title="Found achievements"
  searchLabel="Search by name"
  searchField="name"
  dateField="created_at"
  dateLabel="Created at"
  orderFields={["name", "reward", "id"]}
  columns={[
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "reward", label: "Reward" },
    { key: "created_at", label: "Created at" },
  ]}
  emptyTitle="No achievements selected"
  emptySub="Select one to see details"
  createTitle="New achievement"
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
