<script lang="ts">
  import { client, unwrap } from "../../lib/api";
  import { navigate } from "../../lib/router.svelte";
  import { saveSession } from "../../stores/auth.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { AdminDto } from "../../lib/types";

  let mode: "login" | "register" = $state(location.hash.startsWith("#/admin/register") ? "register" : "login");
  let username = $state("");
  let password = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function submit(): Promise<void> {
    if (busy) return;
    error = null;
    if (!username || !password) {
      error = "Fill both fields";
      return;
    }
    busy = true;
    try {
      const res =
        mode === "login"
          ? await client.admin.auth.login.post({ username, password })
          : await client.admin.auth.register.post({ username, password });
      const auth = await unwrap(res);
      saveSession({ kind: "admin", token: auth.token, user: auth.user as AdminDto });
      navigate("/admin/dashboard");
    } catch (e) {
      error = e instanceof Error ? e.message : "Request failed";
    } finally {
      busy = false;
    }
  }
</script>

<div class="login-layout">
  <header class="topbar">
    <div class="brand">ADMIN PANEL</div>
    <div class="switcher">
      <button class="chip" class:active={mode === "login"} onclick={() => (mode = "login")}>
        <Icon name="login" /> Login
      </button>
      <button class="chip" class:active={mode === "register"} onclick={() => (mode = "register")}>
        <Icon name="badge" /> Register
      </button>
    </div>
  </header>

  <div class="center">
    <div class="form-panel">
      <h2>{mode === "login" ? "Log in admin panel" : "Register new admin"}</h2>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <div class="field">
        <input
          type="text"
          placeholder="Username"
          bind:value={username}
          onkeydown={(e) => e.key === "Enter" && submit()}
        />
        <span class="icon"><Icon name="alternate_email" /></span>
      </div>

      <div class="field">
        <input
          type="password"
          placeholder="Password"
          bind:value={password}
          onkeydown={(e) => e.key === "Enter" && submit()}
        />
        <span class="icon"><Icon name="lock" /></span>
      </div>

      <button class="btn btn-primary btn-block" disabled={busy} onclick={submit}>
        {busy ? "…" : mode === "login" ? "Log in" : "Register"}
        {#if !busy}<Icon name={mode === "login" ? "login" : "register"} size={16} />{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .login-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .topbar {
    background: var(--topbar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    height: 60px;
  }

  .brand {
    font-weight: 800;
    letter-spacing: 1.5px;
    font-size: 15px;
  }

  .switcher {
    display: flex;
    gap: 6px;
  }

  .switcher .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: var(--panel-2);
    border: 1px solid transparent;
    color: var(--text);
    font: inherit;
    font-size: var(--fs-sm);
    padding: 8px 16px;
    border-radius: var(--r-pill);
    cursor: pointer;
  }

  .switcher .chip.active {
    font-weight: 600;
    border-color: var(--accent);
  }

  .center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .form-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--r-panel);
    padding: 32px;
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 22px;
    text-align: center;
  }

  .field {
    position: relative;
  }

  .field input {
    padding-right: 40px;
  }

  .field .icon {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    display: flex;
    pointer-events: none;
  }

  .error {
    background: #3a1515;
    border: 1px solid #5a2020;
    color: var(--red);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 14px;
  }
</style>
