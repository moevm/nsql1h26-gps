<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    avatar,
    name = "",
    size = 40,
  }: {
    avatar?: string | null;
    name?: string;
    size?: number;
  } = $props();
</script>

{#if avatar}
  <img
    class="avatar"
    src={`/uploads/${avatar}`}
    width={size}
    height={size}
    alt={name || "avatar"}
    style={`width:${size}px;height:${size}px`}
  />
{:else}
  <span
    class="avatar fallback"
    style={`width:${size}px;height:${size}px;font-size:${Math.max(10, Math.floor(size * 0.38))}px`}
    aria-label={name || "avatar"}
  >
    {#if name}
      {name.slice(0, 1).toUpperCase()}
    {:else}
      <Icon name="person" size={Math.floor(size * 0.55)} />
    {/if}
  </span>
{/if}

<style>
  .avatar {
    border-radius: 50%;
    display: block;
    object-fit: cover;
  }

  .fallback {
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--panel-2, #26262e);
    color: var(--text-dim, #8f8f9a);
    font-weight: 700;
    user-select: none;
  }
</style>
