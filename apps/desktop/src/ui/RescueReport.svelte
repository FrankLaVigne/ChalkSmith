<script lang="ts">
  import type { RescueReport } from '@chalksmith/core';

  let { report, onSave, onClose }: { report: RescueReport; onSave: () => void; onClose: () => void } = $props();
  const unsupported = $derived(Object.entries(report.counts.unsupported));
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rr-title">
    <h2 id="rr-title">Board rescued</h2>
    <ul>
      <li>{report.counts.groups} ink groups, {report.counts.strokes} strokes ({report.counts.points} points)</li>
      <li>{report.counts.images} images</li>
      {#each unsupported as [type, n]}
        <li>{n} × {type} shown as placeholders (not supported yet)</li>
      {/each}
      {#each report.substitutions as sub}
        <li>{sub.strokes} {sub.texture} strokes use ChalkSmith's own {sub.texture} texture</li>
      {/each}
    </ul>
    {#if report.skipped.length}
      <h3>Skipped ({report.skipped.length})</h3>
      <ul class="small">{#each report.skipped as k}<li>{k.reason}</li>{/each}</ul>
    {/if}
    {#if report.warnings.length}
      <h3>Warnings</h3>
      <ul class="small">{#each report.warnings as w}<li>{w}</li>{/each}</ul>
    {/if}
    <p class="note">The original export file has not been changed.</p>
    <div class="actions">
      <button onclick={onClose}>Close</button>
      <button class="active" onclick={onSave}>Save as .chalk…</button>
    </div>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.3); display: grid; place-items: center; }
  .dialog { background: #fff; border-radius: 10px; padding: 20px 24px; max-width: 520px; max-height: 80vh; overflow: auto; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25); }
  h2 { margin: 0 0 12px; font-size: 18px; }
  h3 { font-size: 14px; margin: 14px 0 6px; }
  .small { font-size: 13px; color: #555; }
  .note { font-size: 13px; color: #555; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
