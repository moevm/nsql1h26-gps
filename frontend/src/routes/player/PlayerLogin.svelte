<script lang="ts">
  import { client, unwrap } from "../../lib/api";
  import { navigate } from "../../lib/router.svelte";
  import { saveSession } from "../../stores/auth.svelte";
  import type { UserDto } from "../../lib/types";

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
      const auth = await unwrap(await client.auth.login.post({ username, password }));
      saveSession({ kind: "user", token: auth.token, user: auth.user as UserDto });
      navigate("/player");
    } catch (e) {
      error = e instanceof Error ? e.message : "Request failed";
    } finally {
      busy = false;
    }
  }
</script>

<div class="login-layout">
  <div class="center">
    <div class="form-panel">
      <h2>MH — вход игрока</h2>

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
      </div>

      <div class="field">
        <input
          type="password"
          placeholder="Password"
          bind:value={password}
          onkeydown={(e) => e.key === "Enter" && submit()}
        />
      </div>

      <button class="btn btn-primary btn-block" disabled={busy} onclick={submit}>
        {busy ? "…" : "Log in"}
      </button>
      <a class="btn btn-primary btn-block" href="/#/admin/dashboard">
        Admin panel
      </a>
    </div>
  </div>
</div>

<style>
  .login-layout {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .center {
    width: 100%;
    max-width: 420px;
    padding: 16px;
  }

  .form-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--r-panel);
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  h2 {
    margin: 0;
    font-size: 20px;
  }

  .field input {
    width: 100%;
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
