<script lang="ts">
  let {
    page = 1,
    pageSize = 20,
    total = 0,
    onchange = (_p: number) => {},
  }: { page?: number; pageSize?: number; total?: number; onchange?: (p: number) => void } = $props();

  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
</script>

<div class="pager">
  <span class="muted">Total: {total}</span>
  <div class="controls">
    <button class="pg" disabled={page <= 1} onclick={() => onchange(page - 1)}>‹</button>
    <span class="muted">{page} / {pages}</span>
    <button class="pg" disabled={page >= pages} onclick={() => onchange(page + 1)}>›</button>
  </div>
</div>

<style>
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 4px 0;
    font-size: 13px;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pg {
    background: var(--panel-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: 30px;
    height: 30px;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }

  .pg:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
