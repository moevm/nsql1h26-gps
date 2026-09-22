<script lang="ts">
  import { client, unwrap } from "../../lib/api";
  import { fmtCompact, fmtDateTime } from "../../lib/format";
  import type { AdminStats, LogEntry } from "../../lib/types";
  import { format } from "date-fns";
  import Chart from "../../components/charts/Chart.svelte";
  import type { ChartConfiguration } from "chart.js";
  import Icon from "../../components/Icon.svelte";

  function barConfig(labels: string[], values: number[]): ChartConfiguration {
    return {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: "#FF4545", borderRadius: 6, maxBarThickness: 28 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    };
  }

  function donutConfig(rows: { label: string; value: number; color: string }[]): ChartConfiguration {
    return {
      type: "doughnut",
      data: {
        labels: rows.map((r) => r.label),
        datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r) => r.color), borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { position: "right", labels: { boxWidth: 10, usePointStyle: true, color: "#b0b0b8" } },
        },
      } as unknown as ChartConfiguration["options"],
    };
  }

  const PERIODS = [
    { chip: "Today", value: "today" },
    { chip: "Week", value: "week" },
    { chip: "Month", value: "month" },
    { chip: "Custom", value: "custom" },
  ] as const;

  const GROUP_BYS = [
    { chip: "Days", value: "day" },
    { chip: "Hours", value: "hour" },
    { chip: "Weeks", value: "week" },
  ] as const;

  let period = $state<string>("month");
  let groupBy = $state<string>("day");
  let customFrom = $state("");
  let customTo = $state("");
  let questFilter = $state<string>("All");
  let entityFilter = $state<string>("All");

  let stats = $state<AdminStats | null>(null);
  let logs = $state<LogEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load(): Promise<void> {
    loading = true;
    error = null;
    try {
      const [s, l] = await Promise.all([
        unwrap(
          await client.admin.stats.get({
            query: {
              period: period as "today" | "week" | "month" | "custom",
              ...(period === "custom" ? { from: customFrom || undefined, to: customTo || undefined } : {}),
              groupBy: groupBy as "day" | "hour" | "week",
            },
          }),
        ),
        unwrap(await client.admin.logs.get({ query: { page: 1, pageSize: 100, sortBy: "timestamp", sortDir: "desc" } })),
      ]);
      stats = s as AdminStats;
      logs = l.items as LogEntry[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Ошибка загрузки";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  const newUsersSeries = $derived(
    (stats?.series ?? []).map((s) => ({ label: fmtBucket(s.bucket, groupBy), value: s.count })),
  );

  function fmtBucket(bucket: string, gb: string): string {
    if (gb === "hour") {
      const h = bucket.slice(11, 13);
      return bucket.length >= 13 ? `${h}:00` : bucket;
    }
    const d = new Date(bucket);
    return Number.isNaN(d.getTime()) ? bucket : format(d, "dd.MM");
  }

  const onlineSeries = $derived.by(() => {
    const byDay = new Map<string, Set<number>>();
    for (const l of logs) {
      if (l.user_id == null) continue;
      const day = l.timestamp.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, new Set());
      byDay.get(day)!.add(l.user_id);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, users]) => {
        const d = new Date(day);
        return { label: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), value: users.size };
      });
  });

  let questTotal = $state(0);
  $effect(() => {
    if (!stats) return;
    void client.admin.quests
      .get({ query: { page: 1, pageSize: 1 } })
      .then(unwrap)
      .then((r) => (questTotal = r.total))
      .catch(() => {});
  });

  const questStatusData = $derived.by(() => {
    if (!stats) return [];
    const completed = stats.questStatus.find((s) => s.status === "COMPLETED")?.c ?? 0;
    const inProgress = stats.questStatus.find((s) => s.status === "IN_PROGRESS")?.c ?? 0;
    const notAccepted = Math.max(0, questTotal - completed - inProgress);
    const all = [
      { label: "Completed", value: completed, color: "#8979FF" },
      { label: "In progress", value: inProgress, color: "#FF928A" },
      { label: "Not accepted", value: notAccepted, color: "#3CC3DF" },
    ];
    if (questFilter === "All") return all;
    return all.filter((d) => d.label.toLowerCase().startsWith(questFilter.toLowerCase()));
  });

  const ENTITY_COLORS: Record<string, string> = {
    User: "#FF928A",
    Quest: "#3CC3DF",
    POI: "#8979FF",
    Achievement: "#FFAE00",
    Admin: "#B39DFF",
    System: "#8A8A8A",
  };
  const entityData = $derived.by(() => {
    if (!stats) return [];
    const rows = [...stats.entityTypes].sort((a, b) => b.c - a.c);
    const top = rows.slice(0, 3).map((r) => ({ label: r.entityType, value: r.c, color: ENTITY_COLORS[r.entityType] ?? "#8A8A8A" }));
    const rest = rows.slice(3);
    const out = top;
    if (rest.length > 0) {
      out.push({ label: "Other", value: rest.reduce((s, r) => s + r.c, 0), color: "#8A8A8A" });
    }
    if (entityFilter === "All") return out;
    const want = entityFilter === "Users" ? "User" : entityFilter;
    return out.filter((d) => d.label === want);
  });

  const priorityTag = (p: LogEntry["priority"]) =>
    p === "High" ? "tag-red" : p === "Medium" ? "tag-orange" : "tag-green";
</script>

<div class="dashboard">
  <div class="filter-row">
    <div class="panel filter-card">
      <div class="filter-title">Time period: {period === "custom" ? "Custom" : PERIODS.find((p) => p.value === period)?.chip}</div>
      <div class="chips">
        {#each PERIODS as p (p.value)}
          <button class="chip" class:active={period === p.value} onclick={() => (period = p.value)}>{p.chip}</button>
        {/each}
      </div>
      {#if period === "custom"}
        <div class="range-row">
          <input type="date" bind:value={customFrom} />
          <span class="dim">—</span>
          <input type="date" bind:value={customTo} />
        </div>
      {/if}
    </div>

    <div class="panel filter-card">
      <div class="filter-title">Group by: {GROUP_BYS.find((g) => g.value === groupBy)?.chip}</div>
      <div class="chips">
        {#each GROUP_BYS as g (g.value)}
          <button class="chip" class:active={groupBy === g.value} onclick={() => (groupBy = g.value)}>{g.chip}</button>
        {/each}
      </div>
    </div>

    <div class="panel filter-card">
      <div class="filter-title">Quest status: {questFilter}</div>
      <div class="chips">
        <button class="chip" class:active={questFilter === "All"} onclick={() => (questFilter = "All")}>All</button>
        <button class="chip" class:active={questFilter === "Completed"} onclick={() => (questFilter = "Completed")}>Completed</button>
        <button class="chip" class:active={questFilter === "In"} onclick={() => (questFilter = "In")}>In progress</button>
      </div>
    </div>

    <div class="panel filter-card">
      <div class="filter-title">Entity type: {entityFilter}</div>
      <div class="chips">
        <button class="chip" class:active={entityFilter === "All"} onclick={() => (entityFilter = "All")}>All</button>
        <button class="chip" class:active={entityFilter === "Users"} onclick={() => (entityFilter = "Users")}>Users</button>
        <button class="chip" class:active={entityFilter === "POI"} onclick={() => (entityFilter = "POI")}>POI</button>
        <button class="chip" class:active={entityFilter === "Other"} onclick={() => (entityFilter = "Other")}>Other</button>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="panel empty-state">
      <Icon name="refresh" />
      Loading dashboard…
    </div>
  {:else if error}
    <div class="panel empty-state">
      <span class="big" style="color:var(--red)">Ошибка</span>
      <span>{error}</span>
      <button class="btn btn-ghost" onclick={() => load()}>Retry</button>
    </div>
  {:else if stats}
    <div class="kpi-row">
      <div class="panel kpi">
        <div class="kpi-value" style="color:var(--red)">{stats.totals.totalUsers}</div>
        <div class="kpi-label">Total users</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-value" style="color:var(--red)">{stats.totals.activeUsers}</div>
        <div class="kpi-label">Active users for last {period === "today" ? "day" : period === "month" ? "month" : "week"}</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-value" style="color:var(--muted)">{stats.totals.completedQuests}</div>
        <div class="kpi-label">Completed quests for last {period === "today" ? "day" : period === "month" ? "month" : "week"}</div>
      </div>
      <div class="panel kpi">
        <div class="kpi-value" style="color:var(--muted)">{fmtCompact(stats.database.nodes + stats.database.relationships)}</div>
        <div class="kpi-label">Entities in database</div>
      </div>
    </div>

    <div class="chart-row">
      <div class="panel chart">
        <h3>New users</h3>
        <Chart config={barConfig(newUsersSeries.map((s) => s.label), newUsersSeries.map((s) => s.value))} />
      </div>
      <div class="panel chart">
        <h3>Online by days</h3>
        <Chart config={barConfig(onlineSeries.map((s) => s.label), onlineSeries.map((s) => s.value))} />
      </div>
      <div class="panel chart">
        <h3>Quest statuses</h3>
        <Chart config={donutConfig(questStatusData)} height={200} />
      </div>
      <div class="panel chart">
        <h3>Events by entity type</h3>
        <Chart config={donutConfig(entityData)} height={200} />
      </div>
    </div>

    <div class="panel">
      <h3>Last events</h3>
      <table class="tbl">
        <thead>
          <tr>
            <th>ID</th>
            <th>Priority</th>
            <th>Entity type</th>
            <th>Description</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          {#each logs as l (l.id)}
            <tr>
              <td class="dim mono">#{l.id}</td>
              <td><span class="tag {priorityTag(l.priority)}"><span class="dot"></span>{l.priority}</span></td>
              <td>{l.entity_type}</td>
              <td>{l.description}</td>
              <td class="dim mono">{fmtDateTime(l.timestamp)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .dashboard {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .filter-row {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
  }

  .filter-card {
    grid-column: span 3;
  }

  .filter-title {
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 10px;
  }

  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  .range-row input {
    flex: 1;
    min-width: 0;
  }

  .kpi-row {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
  }

  .kpi {
    grid-column: span 3;
  }

  .chart-row {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 12px;
  }

  .chart {
    grid-column: span 3;
  }

  .dashboard > .panel {
    grid-column: 1 / -1;
  }

  .chart h3 {
    margin-bottom: 16px;
  }

  @media (max-width: 1200px) {
    .filter-card,
    .kpi,
    .chart {
      grid-column: span 6;
    }
  }
</style>
