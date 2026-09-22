<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title = "",
    onclose = () => {},
    children,
  }: { title?: string; onclose?: () => void; children?: Snippet } = $props();

  $effect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onclose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });
</script>

<div class="backdrop" onclick={onclose}>
  <div class="modal" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
    <div class="head">
      <h3>{title}</h3>
      <button class="x" onclick={onclose} aria-label="Close">×</button>
    </div>
    <div class="body">
      {@render children!()}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 900;
    padding: 24px;
  }

  .modal {
    background: #232323; 
    border: 1px solid var(--border);
    border-radius: var(--r-panel);
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .head h3 {
    margin: 0;
    font-size: var(--fs-xl);
  }

  .x {
    background: none;
    border: none;
    color: var(--text);
    font-size: 24px;
    cursor: pointer;
    line-height: 1;
    padding: 6px 12px;
  }

  .x:hover {
    color: var(--text);
  }

  .body {
    padding: 20px;
    overflow-y: auto;
  }
</style>
