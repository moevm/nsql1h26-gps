<script lang="ts">

  import { current, navigate } from "../lib/router.svelte";
  import { clearSession, me } from "../stores/auth.svelte";
  import Icon from "./Icon.svelte";
  import type { Snippet } from "svelte";

  let { children }: { children?: Snippet } = $props();

  interface NavItem {
    path: string;
    icon: string;
    label: string;
  }

  const GROUPS: { items: NavItem[] }[] = [
    {
      items: [{ path: "/admin/dashboard", icon: "bar_chart", label: "Dashboard" }],
    },
    {
      items: [
        { path: "/admin/users", icon: "account_circle", label: "Users" },
        { path: "/admin/quests", icon: "quiz", label: "Quests" },
        { path: "/admin/pois", icon: "location_on", label: "POIs" },
        { path: "/admin/achievements", icon: "trophy", label: "Achievements" },
      ],
    },
    {
      items: [
        { path: "/admin/data", icon: "file_upload", label: "Data" },
        { path: "/admin/logs", icon: "description", label: "Logs" },
      ],
    },
    {
      items: [{ path: "/player", icon: "sports_esports", label: "Player" }],
    },
  ];

  const admin = $derived(me());

  let search = $state("");

  function globalSearch(): void {
    const v = search.trim();
    if (!v) return;
    navigate("/admin/logs", { f: `description:contains:${v}` });
    search = "";
  }

  function logout(): void {
    clearSession();
    navigate("/admin/login");
  }
</script>

<div class="admin-layout">
  <header class="topbar">
    <div class="brand">ADMIN PANEL</div>
    <div class="global-search">
      <input
        type="text"
        placeholder="Search users, quests, POI, etc."
        bind:value={search}
        onkeydown={(e) => e.key === "Enter" && globalSearch()}
      />
      <span class="icon" onclick={globalSearch} onkeydown={(e) => e.key === "Enter" && globalSearch()} role="button" tabindex="0"><Icon name="search" /></span>
    </div>
    <div class="me">
      <span class="at">@{admin?.username ?? "admin"}</span>
      <button class="logout" onclick={logout}><Icon name="logout" /> Log out</button>
    </div>
  </header>

  <div class="body">
    <nav class="sidebar">
      {#each GROUPS as group, gi (gi)}
        {#if gi > 0}
          <div class="sep"></div>
        {/if}
        {#each group.items as item (item.path)}
          <a
            class="nav-item"
            class:active={current.path === item.path}
            href={`#${item.path}`}
            title={item.label}
          >
            <span class="icon"><Icon name={item.icon} size={20}/></span>
            <span class="label">{item.label}</span>
          </a>
        {/each}
      {/each}
    </nav>

    <main class="content">
      {@render children!()}
    </main>
  </div>
</div>

<style>
  .admin-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .topbar {
    background: var(--topbar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 10px 20px;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .brand {
    font-weight: 700;
    font-size: var(--fs-sm);
    white-space: nowrap;
    width: 101px;
  }

  .global-search {
    flex: 1;
    max-width: 560px;
    margin: 0 auto;
    position: relative;
  }

  .global-search input {
    width: 100%;
    background: var(--panel-2);
    border: none;
    border-radius: var(--r-btn);
    padding: 10px 40px 10px 16px;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-base);
    outline: none;
  }

  .global-search input:focus {
    border: 1px solid var(--accent);
    padding: 9px 39px 9px 15px;
  }

  .global-search input::placeholder {
    color: var(--muted);
  }

  .global-search .icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
  }

  .me {
    display: flex;
    align-items: center;
    gap: 12px;
    white-space: nowrap;
  }

  .at {
    font-weight: 500;
    font-size: var(--fs-xl);
  }

  .logout {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: var(--panel-2);
    border: none;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-sm);
    padding: 5px 12px;
    border-radius: var(--r-btn);
    cursor: pointer;
  }

  .body {
    display: grid;
    grid-template-columns: fit-content(64px) repeat(12, minmax(0, 1fr));
    flex: 1;
  }

  .sidebar {
    grid-column: 1;
    width: 64px; 
    padding: 10px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    border-right: none;
    position: sticky;
    top: 61px;
    height: calc(100vh - 61px);
    overflow-y: auto;
  }

  .sep {
    border-top: 1px solid var(--border);
    height: 1px;
    width: 20px;
    margin: 20px 0;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0;
    margin-bottom: 20px;
    color: var(--text-dim);
    text-decoration: none;
    font-size: var(--fs-sidebar);
    transition: color 0.15s;
  }

  .nav-item:hover {
    color: var(--text);
  }

  .nav-item.active {
    color: var(--text);
    font-weight: 600;
  }

  .nav-item .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: var(--r-btn);
  }

  .nav-item.active .icon {
    background: var(--panel-2);
  }

  .content {
    grid-column: 2 / -1;
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
    align-content: start;
    padding: 12px;
    min-width: 0;
  }
</style>
