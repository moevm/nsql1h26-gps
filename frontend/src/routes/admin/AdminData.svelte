<script lang="ts">
  import Icon from "../../components/Icon.svelte";
  import { client, downloadFile, unwrap } from "../../lib/api";
  import { toast } from "../../lib/toast.svelte";

  let includeLogs = $state(true);
  let allCollections = $state(false);
  let includeOsm = $state(false);
  let startDate = $state("");
  let endDate = $state("");
  let exporting = $state(false);

  function scopeLabels(): string[] | undefined {
    if (allCollections) return undefined; // весь граф
    const s: string[] = [];
    if (includeLogs) s.push("EVENT_LOG");
    if (includeOsm) s.push("POI", "CELL");
    return s.length > 0 ? s : ["USER", "ADMIN", "QUEST", "ACHIEVEMENT", "POI", "CELL", "EVENT_LOG"];
  }

  async function doExport(): Promise<void> {
    if (exporting) return;
    exporting = true;
    try {
      const body: Record<string, unknown> = { format: "json" };
      const scope = scopeLabels();
      if (scope) body.scope = scope;
      if (startDate || endDate) {
        body.dateRange = { from: startDate || "1970-01-01", to: endDate || new Date().toISOString().slice(0, 10) };
      }
      await downloadFile("/admin/data/export", body);
      toast("ok", "Export downloaded");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Export failed");
    } finally {
      exporting = false;
    }
  }

  let file = $state<File | null>(null);
  let validateBefore = $state(true);
  let importing = $state(false);
  let dragOver = $state(false);

  function onPick(e: Event): void {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) file = f;
  }

  function onDrop(e: DragEvent): void {
    dragOver = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) file = f;
  }

  async function doImport(): Promise<void> {
    if (importing || !file) return;
    importing = true;
    try {
      if (validateBefore) {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("File is not valid JSON");
        }
        const d = parsed as { nodes?: unknown; relationships?: unknown };
        if (!Array.isArray(d.nodes) || !Array.isArray(d.relationships)) {
          throw new Error("Invalid dump format: expected nodes/relationships arrays");
        }
      }
      const res = await unwrap(await client.admin.data.import.post({ file }));
      toast("ok", `Imported: ${res.nodes} nodes, ${res.relationships} relationships`);
      file = null;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Import failed");
    } finally {
      importing = false;
    }
  }
</script>

<div class="data-page">
  <div class="panel">
    <h3>Export data</h3>

    <div class="field-label">File format</div>
    <div class="chips">
      <button class="chip active">JSON</button>
      <button class="chip" disabled title="Backend supports JSON only">XML</button>
      <button class="chip" disabled title="Backend supports JSON only">BSON</button>
    </div>

    <div class="field-label">Scope</div>
    <label class="check">
      <input type="checkbox" bind:checked={includeLogs} />
      Include logs
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={allCollections} />
      All collections
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={includeOsm} />
      Include OSM data (POI + cells)
    </label>
    <label class="check">
      <input type="checkbox" disabled />
      <span class="dim">Compress as ZIP archive <span class="muted">(not supported)</span></span>
    </label>

    <div class="field-label">Logs time range</div>
    <div class="range-row">
      <input type="date" placeholder="Start" bind:value={startDate} />
      <span class="dim">—</span>
      <input type="date" placeholder="End" bind:value={endDate} />
    </div>

    <button class="btn btn-primary btn-block export-btn" disabled={exporting} onclick={doExport}>
      {exporting ? "Exporting…" : "Export"} <Icon name="upload" />
    </button>
  </div>

  <div class="panel">
    <h3>Import data</h3>

    <label
      class="dropzone"
      class:dragover={dragOver}
      ondragover={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      ondragleave={() => (dragOver = false)}
      ondrop={(e) => {
        e.preventDefault();
        onDrop(e);
      }}
    >
      <input type="file" accept=".json,application/json" hidden onchange={onPick} />
      <div class="dz-text">
        {#if file}
          <div class="file-name">{file.name}</div>
          <div class="muted">{(file.size / 1024).toFixed(1)} KB — click to change</div>
        {:else}
          <Icon name="download" />
          <div>Drop files here or click to upload</div>
          <div class="muted">json / .bson files supported</div>
        {/if}
      </div>
    </label>

    <div class="field-label">Options</div>
    <label class="check">
      <input type="checkbox" bind:checked={validateBefore} />
      Validate before import
    </label>
    <label class="check">
      <input type="checkbox" checked disabled />
      <span class="dim">Overwrite existing entities <span class="muted">(MERGE — always)</span></span>
    </label>
    <label class="check">
      <input type="checkbox" disabled />
      <span class="dim">Skip records on error <span class="muted">(not supported)</span></span>
    </label>

    <button class="btn btn-primary btn-block export-btn" disabled={importing || !file} onclick={doImport}>
      {#if importing}
        <span class="spinner"></span> Import in progress…
      {:else}
        Import <Icon name="download" />
      {/if}
    </button>
  </div>
</div>

<style>
  .data-page {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .data-page > .panel {
    grid-column: span 6;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    margin: 8px 0;
    cursor: pointer;
  }

  .check input {
    width: auto;
    accent-color: var(--accent);
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-row input {
    flex: 1;
    min-width: 0;
  }

  .export-btn {
    margin-top: 20px;
  }

  .dropzone {
    display: block;
    border: 2px dashed #3a3a3a;
    border-radius: var(--r-panel);
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    margin-bottom: 6px;
  }

  .dropzone:hover,
  .dropzone.dragover {
    border-color: var(--accent);
    background: rgba(25, 0, 255, 0.06);
  }

  .dz-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font-size: 15px;
  }

  .file-name {
    font-weight: 700;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 900px) {
    .data-page > .panel {
      grid-column: 1 / -1;
    }
  }
</style>
