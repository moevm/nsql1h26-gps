<script lang="ts">
  import { toasts } from "../lib/toast.svelte";
</script>

<div class="toasts">
  {#each toasts.items as t (t.id)}
    <div class="toast {t.kind}">{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
  }

  .toast {
    background: #232323;
    border: 1px solid var(--border);
    border-left: 3px solid var(--green);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    max-width: 380px;
  }

  .toast.error {
    border-left-color: var(--red);
  }
</style>
