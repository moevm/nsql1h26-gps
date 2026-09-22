<script lang="ts">
  import { current, navigate } from "./lib/router.svelte";
  import { isAdmin, isPlayer } from "./stores/auth.svelte";
  import AdminShell from "./components/AdminShell.svelte";
  import Toasts from "./components/Toasts.svelte";
  import AdminLogin from "./routes/admin/AdminLogin.svelte";
  import Dashboard from "./routes/admin/Dashboard.svelte";
  import AdminUsers from "./routes/admin/AdminUsers.svelte";
  import AdminQuests from "./routes/admin/AdminQuests.svelte";
  import AdminPois from "./routes/admin/AdminPois.svelte";
  import AdminAchievements from "./routes/admin/AdminAchievements.svelte";
  import AdminLogs from "./routes/admin/AdminLogs.svelte";
  import AdminData from "./routes/admin/AdminData.svelte";
  import PlayerLogin from "./routes/player/PlayerLogin.svelte";
  import Player from "./routes/player/Player.svelte";

  const path = $derived(current.path);

  const isLogin = $derived(path === "/admin/login" || path === "/admin/register");
  const isPlayerLogin = $derived(path === "/player/login");

  $effect(() => {
    if (path === "/") {
      navigate(isAdmin() ? "/admin/dashboard" : isPlayer() ? "/player" : "/player/login");
    } else if (path === "/admin") {
      navigate("/admin/dashboard");
    } else if (path.startsWith("/admin") && !isLogin && !isAdmin()) {
      navigate("/admin/login");
    } else if (path.startsWith("/player") && !isPlayerLogin && !isPlayer()) {
      navigate("/player/login");
    }
  });
</script>

<Toasts />

{#if isLogin}
  <AdminLogin />
{:else if path.startsWith("/admin")}
  <AdminShell>
    {#if path === "/admin/dashboard"}
      <Dashboard />
    {:else if path === "/admin/users"}
      <AdminUsers />
    {:else if path === "/admin/quests"}
      <AdminQuests />
    {:else if path === "/admin/pois"}
      <AdminPois />
    {:else if path === "/admin/achievements"}
      <AdminAchievements />
    {:else if path === "/admin/logs"}
      <AdminLogs />
    {:else if path === "/admin/data"}
      <AdminData />
    {/if}
  </AdminShell>
{:else}
  {#if path === "/player/login"}
    <PlayerLogin />
  {:else if path === "/player/register"}
    <PlayerLogin />
  {:else}
    <Player />
  {/if}
{/if}
