<script lang="ts">
  import { Chart, registerables } from "chart.js";
  import type { ChartConfiguration } from "chart.js";

  Chart.register(...registerables);
  Chart.defaults.color = "#b0b0b8";
  Chart.defaults.borderColor = "#2A2A2A";
  Chart.defaults.font.family = "inherit";

  let {
    config,
    height = 220,
  }: { config: ChartConfiguration; height?: number } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | undefined;

  $effect(() => {
    void config;
    const el = canvas;
    if (!el) return;
    chart?.destroy();
    chart = new Chart(el, structuredClone(config));
    return () => chart?.destroy();
  });
</script>

<div class="chart-wrap" style={`height:${height}px`}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-wrap {
    position: relative;
    width: 100%;
  }
</style>
