<script lang="ts">
  import EntityPage from "../../components/EntityPage.svelte";
  import Modal from "../../components/Modal.svelte";
  import Avatar from "../../components/Avatar.svelte";
  import Icon from "../../components/Icon.svelte";
  import { ADMIN_ENTITY_CONFIGS } from "../../lib/filter";
  import { client, downloadFile, unwrap } from "../../lib/api";
  import { fmtDateShort, fmtDateTime, levelFromExp } from "../../lib/format";
  import { toast } from "../../lib/toast.svelte";
  import type { AdminUserDetail } from "../../lib/types";

  const cfg = ADMIN_ENTITY_CONFIGS.users;

  let rankingCache = $state<{ byExp: number[] } | null>(null);

  async function loadRanking(): Promise<{ byExp: number[] } | null> {
    if (rankingCache) return rankingCache;
    try {
      const byExp = await unwrap(
        await client.admin.users.get({ query: { page: 1, pageSize: 100, sortBy: "exp", sortDir: "desc" } }),
      );
      rankingCache = { byExp: byExp.items.map((u) => u.id) };
      return rankingCache;
    } catch {
      return null;
    }
  }

  async function placeInRanking(id: number): Promise<string> {
    const r = await loadRanking();
    if (!r) return "—";
    const idx = r.byExp.indexOf(id);
    return idx >= 0 ? String(idx + 1) : "—";
  }

  function setStatus(u: AdminUserDetail, status: "Active" | "Banned", reload: () => Promise<void>): void {
    void client.admin.users({ id: u.id })
      .patch({ status })
      .then(unwrap)
      .then(() => {
        toast("ok", status === "Banned" ? "User banned" : "User unbanned");
        void reload();
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Error"));
  }

  function saveNote(u: AdminUserDetail, value: string, reload: () => Promise<void>): void {
    if (value === (u.note ?? "")) return;
    void client.admin.users({ id: u.id })
      .patch({ note: value })
      .then(unwrap)
      .then(() => {
        toast("ok", "Note saved");
        void reload();
      })
      .catch((e) => toast("error", e instanceof Error ? e.message : "Error"));
  }

  interface UserForm {
    username: string;
    status: "Active" | "Banned";
    avatar: string | null;
  }

  let formOpen = $state(false);
  let formId = $state<number | null>(null);
  let form = $state<UserForm>({ username: "", status: "Active", avatar: null });
  let formBusy = $state(false);
  let formError = $state<string | null>(null);
  let refreshTick = $state(0);

  function openEdit(u: AdminUserDetail): void {
    formId = u.id;
    form = { username: u.username, status: u.status, avatar: u.avatar };
    formError = null;
    formOpen = true;
  }

  async function uploadAvatar(e: Event): Promise<void> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || formId == null) return;
    try {
      const res = await unwrap(await client.admin.users({ id: formId! }).avatar.post({ file }));
      form = { ...form, avatar: res.avatar };
      toast("ok", "Avatar uploaded");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Error");
    } finally {
      input.value = "";
    }
  }

  async function submitForm(): Promise<void> {
    if (formBusy) return;
    formBusy = true;
    formError = null;
    try {
      await unwrap(
        await client.admin.users({ id: formId! }).patch({
          username: form.username,
          status: form.status,
        }),
      );
      toast("ok", "User updated");
      formOpen = false;
      refreshTick++;
    } catch (e) {
      formError = e instanceof Error ? e.message : "Error";
    } finally {
      formBusy = false;
    }
  }
</script>

{#snippet cell(u: AdminUserDetail, key: string)}
  {#if key === "avatar"}
    <Avatar avatar={u.avatar} name={u.username} size={28} />
  {:else if key === "username"}
    @{u.username}
  {:else if key === "status"}
    {#if u.status === "Active"}
      <span class="tag tag-green"><span class="dot"></span>Active</span>
    {:else}
      <span class="tag tag-red"><span class="dot"></span>Banned</span>
    {/if}
  {:else if key === "id"}
    <span class="dim">#{u.id}</span>
  {:else if key === "created_at" || key === "updated_at"}
    <span class="dim">{fmtDateShort(u[key] as string)}</span>
  {:else}
    {(u as unknown as Record<string, unknown>)[key] == null ? "—" : String((u as unknown as Record<string, unknown>)[key])}
  {/if}
{/snippet}

{#snippet detail(u: AdminUserDetail, reload: () => Promise<void>)}
  <div class="head">
    <Avatar avatar={u.avatar} name={u.username} size={72} />
    <div class="name">@{u.username} #{u.id}</div>
  </div>

  <div class="grid">
    <div>
      <div class="lbl">Status</div>
      {#if u.status === "Active"}
        <span class="tag tag-green"><span class="dot"></span>ACTIVE</span>
      {:else}
        <span class="tag tag-red"><span class="dot"></span>BANNED</span>
      {/if}
    </div>
    <div><div class="lbl">Created at</div>{fmtDateTime(u.created_at)}</div>
    <div><div class="lbl">Updated at</div>{fmtDateTime(u.updated_at)}</div>
    <div><div class="lbl">LVL</div>{levelFromExp(u.exp)}</div>
    <div><div class="lbl">Exp</div>{u.exp}</div>
    <div><div class="lbl">Distance</div>{u.total_distance_km} km</div>
    <div><div class="lbl">Quests completed</div>{u.quests.filter((q) => q.status === "COMPLETED").length}</div>
    <div><div class="lbl">Cells visited</div>{u.cellsVisited}</div>
    <div><div class="lbl">POIs discovered</div>{u.poisDiscovered}</div>
    <div><div class="lbl">Achievements</div>{u.achievements.length}</div>
    <div>
      <div class="lbl">Place in ranking</div>
      {#await placeInRanking(u.id) then r}{r}{/await}
    </div>
  </div>

  <div class="field-label">Note</div>
  <div class="note-wrap">
    <textarea
      rows="3"
      placeholder="Take note"
      value={u.note ?? ""}
      onblur={(e) => saveNote(u, e.currentTarget.value, reload)}
    ></textarea>
    <span class="pencil"><Icon name="edit" /></span>
  </div>

  <div class="field-label">Quests ({u.quests.length})</div>
  <div class="chips">
    {#each u.quests as q (q.id)}
      <span class="chip static">{q.name}: {q.status.toLowerCase()}</span>
    {/each}
    {#if u.quests.length === 0}<span class="muted">none</span>{/if}
  </div>

  <div class="field-label">Activity log</div>
  <table class="tbl">
    <thead>
      <tr><th>Event ID</th><th>Timestamp</th><th>Message</th></tr>
    </thead>
    <tbody>
      {#each u.recentLogs as l (l.id)}
        <tr>
          <td class="dim mono">#{l.id}</td>
          <td class="dim mono">{fmtDateTime(l.timestamp)}</td>
          <td>{l.description}</td>
        </tr>
      {/each}
      {#if u.recentLogs.length === 0}<tr><td colspan="3" class="muted">No events</td></tr>{/if}
    </tbody>
  </table>
{/snippet}

{#snippet actions(u: AdminUserDetail, reload: () => Promise<void>)}
  <button class="btn btn-ghost" onclick={() => openEdit(u)}><Icon name="edit" /> Edit</button>

  {#if u.status === "Active"}
    <button class="btn btn-danger" onclick={() => setStatus(u, "Banned", reload)}>
      <Icon name="block" /> Ban
    </button>
  {:else}
    <button class="btn btn-ghost" onclick={() => setStatus(u, "Active", reload)}>
      <Icon name="refresh" /> Unban
    </button>
  {/if}

  <button
    class="btn btn-ghost"
    onclick={() =>
      downloadFile("/admin/data/export", { format: "json" }).catch((e) =>
        toast("error", e instanceof Error ? e.message : "Error"),
      )
    }
  >
    <Icon name="upload" /> Export user data
  </button>
{/snippet}

{#if formOpen}
  <Modal title={`Edit user #${formId}`} onclose={() => (formOpen = false)}>
    <div class="form">
      {#if formError}<div class="error">{formError}</div>{/if}

      <div class="avatar-row">
        <Avatar avatar={form.avatar} name={form.username} size={56} />
        <label class="btn btn-ghost">
          Upload avatar
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            class="file-input"
            onchange={uploadAvatar}
          />
        </label>
      </div>

      <div class="field-label">Username</div>
      <input type="text" placeholder="username" bind:value={form.username} />

      <div class="field-label">Status</div>
      <div class="chips">
        <button
          class="chip"
          class:active={form.status === "Active"}
          onclick={() => (form = { ...form, status: "Active" })}
        >Active</button>
        <button
          class="chip"
          class:active={form.status === "Banned"}
          onclick={() => (form = { ...form, status: "Banned" })}
        >Banned</button>
      </div>

      <div class="btns">
        <button class="btn btn-ghost" onclick={() => (formOpen = false)}>Cancel</button>
        <button
          class="btn btn-primary"
          disabled={formBusy || form.username.trim().length < 3}
          onclick={() => submitForm()}
        >
          Save
        </button>
      </div>
    </div>
  </Modal>
{/if}

<EntityPage
  {cfg}
  apiPrefix="/admin/users"
  title="Found users"
  searchLabel="Search by username"
  searchField="username"
  dateField="created_at"
  dateLabel="Registration period"
  orderFields={["exp", "created_at", "status"]}
  columns={[
    { key: "id", label: "ID" },
    { key: "avatar", label: "Avatar" },
    { key: "username", label: "Username" },
    { key: "status", label: "Status" },
    { key: "created_at", label: "Registered at" },
    { key: "updated_at", label: "Updated at" },
  ]}
  emptyTitle="No users selected"
  emptySub="Select one to see his profile"
  {refreshTick}
  {cell}
  {detail}
  {actions}
/>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .name {
    font-size: 22px;
    font-weight: 700;
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
    gap: 6px;
  }

  .avatar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }

  .file-input {
    display: none;
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
