<script lang="ts">
  let { name, size = "1.25em" }: { name: string; size?: string | number } = $props();
</script>

<span
  class="material-symbols-outlined"
  class:fill={false}
  style={`font-size:${typeof size === "number" ? `${size}px` : size}; line-height:1; width:1em; height:1em;`}
  aria-hidden="true"
>
  {name}
</span>
