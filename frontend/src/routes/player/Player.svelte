<script lang="ts">
  import { onMount } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { cellToBoundary } from "h3-js";
  import { client, unwrap } from "../../lib/api";
  import { navigate } from "../../lib/router.svelte";
  import { clearSession, me } from "../../stores/auth.svelte";
  import { levelFromExp, fmtDateTime } from "../../lib/format";
  import type { MeResponse, PingResponse, Quest, VisiblePoi } from "../../lib/types";

  let profile = $state<MeResponse | null>(null);
  let quests = $state<Quest[]>([]);
  let pois = $state<VisiblePoi[]>([]);
  let busy = $state(false);
  let feed = $state<string[]>([]); 

  const POS_KEY = "player-pos";
  let pos = $state<{ lat: number; lon: number }>(
    JSON.parse(localStorage.getItem(POS_KEY) ?? "null") ?? { lat: 59.939, lon: 30.315 },
  );

  let mapEl: HTMLElement;
  let map: L.Map;
  let playerMarker: L.CircleMarker;
  const poiMarkers = new Map<number, L.CircleMarker>();
  const cellPolys = new Map<string, L.Polygon>();

  const CELLS_KEY = "player-cells";
  let visitedCells = $state<string[]>(JSON.parse(localStorage.getItem(CELLS_KEY) ?? "[]"));

  function pushFeed(s: string): void {
    feed = [s, ...feed].slice(0, 12);
  }

  async function refresh(): Promise<void> {
    const [p, q, v] = await Promise.all([
      unwrap(await client.me.get()),
      unwrap(await client.quests.get()),
      unwrap(await client.map.visible.get()),
    ]);
    profile = p;
    quests = q;
    pois = v;
    drawPois();
  }

  async function ping(lat: number, lon: number): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const r = await unwrap(await client.me.ping.post({ latitude: lat, longitude: lon }));
      pos = { lat, lon };
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
      playerMarker.setLatLng([lat, lon]);
      map.panTo([lat, lon]);
      drawCells(r.h3);

      pushFeed(`Переход: +${r.distanceDeltaKm.toFixed(2)} км${r.newCell ? " (новая ячейка)" : ""}`);
      for (const p of r.newPois) {
        pushFeed(`Новое место: ${p.name} (${p.type})`);
      }
      for (const q of r.quests) {
        pushFeed(q.status === "COMPLETED" ? `Квест «${q.name}» выполнен!` : `Квест «${q.name}»: ${q.progress}`);
      }
      for (const a of r.achievements) {
        pushFeed(`Ачивка «${a.name}»!`);
      }
      await refresh();
    } catch (e) {
      pushFeed(`Ошибка: ${e instanceof Error ? e.message : "?"}`);
    } finally {
      busy = false;
    }
  }

  async function accept(q: Quest): Promise<void> {
    try {
      const r = await unwrap(await client.quests({ id: q.id }).accept.post());
      pushFeed(`Квест «${q.name}» принят`);
      for (const x of r.quests) pushFeed(x.status === "COMPLETED" ? `Квест «${x.name}» выполнен!` : `«${x.name}»: ${x.progress}`);
      for (const a of r.achievements) pushFeed(`🎖️ Ачивка «${a.name}»!`);
      await refresh();
    } catch (e) {
      pushFeed(`Ошибка: ${e instanceof Error ? e.message : "?"}`);
    }
  }

  async function decline(q: Quest): Promise<void> {
    try {
      await unwrap(await client.quests({ id: q.id }).accept.delete());
      pushFeed(`Квест «${q.name}» снят`);
      await refresh();
    } catch (e) {
      pushFeed(`Ошибка: ${e instanceof Error ? e.message : "?"}`);
    }
  }

  async function logout(): Promise<void> {
    try {
      await unwrap(await client.me.logout.post());
    } catch {
    }
    localStorage.removeItem(CELLS_KEY);
    localStorage.removeItem(POS_KEY);
    clearSession();
    navigate("/player/login");
  }

  function drawCells(h3: string): void {
    visitedCells = Array.from(new Set([...visitedCells, h3]));
    localStorage.setItem(CELLS_KEY, JSON.stringify(visitedCells));
    for(const p of cellPolys.values()) {
      p.remove()
    }
    for(const cell of visitedCells) {
      const boundary = cellToBoundary(cell).map(([lat, lon]) => [lat, lon] as [number, number]);
      cellPolys.set(cell, L.polygon(boundary, {
        color: "#8979FF",
        weight: 1.5,
        fillColor: "#8979FF",
        fillOpacity: 0.08,
      }).addTo(map));
    }
  }

  function drawPois(): void {
    for (const m of poiMarkers.values()) m.remove();
    poiMarkers.clear();
    for (const p of pois) {
      const m = L.circleMarker([p.location.latitude, p.location.longitude], {
        radius: 7,
        color: p.discovered ? "#3CC3DF" : "#FF928A",
        fillColor: p.discovered ? "#3CC3DF" : "#FF928A",
        fillOpacity: 0.9,
      }).addTo(map);
      m.bindPopup(
        `<b>${p.name}</b><br/><span>${p.type}</span>` +
          (p.discoveredAt ? `<br/><span>открыто: ${fmtDateTime(p.discoveredAt)}</span>` : ""),
      );
      poiMarkers.set(p.id, m);
    }
  }

  onMount(() => {
    map = L.map(mapEl, { zoomControl: false }).setView([pos.lat, pos.lon], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);
    playerMarker = L.circleMarker([pos.lat, pos.lon], {
      radius: 9,
      color: "#8979FF",
      fillColor: "#8979FF",
      fillOpacity: 1,
    }).addTo(map);
    playerMarker.bindTooltip("вы здесь");
    map.on("click", (e: L.LeafletMouseEvent) => void ping(e.latlng.lat, e.latlng.lng));
    for (const h3 of visitedCells) drawCells(h3);
    void refresh();
    pushFeed("Кликните по карте — игрок переместится (ping)");
  });
</script>

<div class="player">
  <div class="map-col">
    <div class="map-wrap" bind:this={mapEl}></div>
    <div class="hint">
      {busy ? "ping…" : `Позиция: ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)} — клик по карте = перемещение`}
    </div>
  </div>

  <div class="side">
    <div class="panel">
      <div class="row">
        <b>@{profile?.username ?? me()?.username}</b>
        <span class="muted">LVL {profile ? levelFromExp(profile.exp) : "—"}</span>
        <button class="btn btn-ghost" onclick={() => navigate("/admin/login")}>Админка</button>
        <button class="btn btn-ghost" onclick={logout}>Выйти</button>
      </div>
      <div class="stats">
        <div><div class="lbl">Exp</div>{profile?.exp ?? "—"}</div>
        <div><div class="lbl">Дистанция</div>{profile ? `${profile.total_distance_km.toFixed(2)} км` : "—"}</div>
        <div><div class="lbl">Исследовано</div>{profile ? `${(profile.exploration_percent * 100).toFixed(1)}%` : "—"}</div>
      </div>
    </div>

    <div class="panel">
      <h3>Квесты ({quests.length})</h3>
      {#each quests as q (q.id)}
        <div class="quest">
          <div class="row">
            <b>{q.name}</b>
            {#if q.status === "AVAILABLE"}
              <button class="btn btn-primary small" onclick={() => accept(q)}>Принять</button>
            {:else}
              <span class="tag tag-orange">в процессе</span>
            {/if}
          </div>
          <div class="muted">{q.description}</div>
          {#if q.progress}<div class="muted">прогресс: {q.progress}</div>{/if}
          {#if q.status === "IN_PROGRESS"}
            <button class="mini-link" onclick={() => decline(q)}>отказаться</button>
          {/if}
        </div>
      {/each}
      {#if quests.length === 0}<div class="muted">квестов нет</div>{/if}
    </div>

    <div class="panel">
      <h3>Ачивки ({profile?.achievements.length ?? 0})</h3>
      {#each profile?.achievements ?? [] as a (a.id)}
        <div class="muted">{a.name} — {a.description}</div>
      {/each}
      {#if !profile?.achievements.length}<div class="muted">пока нет</div>{/if}
    </div>

    <div class="panel">
      <h3>События</h3>
      {#each feed as f, i (i)}<div class="muted">{f}</div>{/each}
    </div>
  </div>
</div>

<style>
  .player {
    display: flex;
    height: 100vh;
    gap: 12px;
    padding: 12px;
    background: var(--bg);
  }

  .map-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .map-wrap {
    flex: 1;
    border-radius: var(--r-panel);
    overflow: hidden;
    border: 1px solid var(--border);
  }

  .hint {
    color: var(--muted);
    font-size: 13px;
  }

  .side {
    width: 360px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--r-panel);
    padding: 14px;
  }

  .panel h3 {
    margin: 0 0 10px;
    font-size: 15px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .stats {
    display: flex;
    gap: 18px;
    margin-top: 10px;
  }

  .lbl {
    font-size: 12px;
    color: var(--muted);
  }

  .quest {
    border-top: 1px solid var(--border);
    padding: 8px 0;
  }

  .quest:first-of-type {
    border-top: none;
  }

  .btn.small {
    font-size: 12px;
    padding: 4px 10px;
  }

  .mini-link {
    background: none;
    border: none;
    color: var(--muted);
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }
</style>
