<script lang="ts">
  import { rgbaToCss, type RGBA } from '@chalksmith/core';
  import type { Editor, ToolName } from '../engine/editor';
  import { HIGHLIGHTER_COLORS, HIGHLIGHTER_WIDTHS, PEN_COLORS, PEN_WIDTHS } from '../engine/tools';

  let { editor, tick }: { editor: Editor; tick: number } = $props();

  const s = $derived.by(() => {
    void tick;
    return {
      tool: editor.toolName,
      settings: editor.settings,
      canUndo: editor.history.canUndo,
      canRedo: editor.history.canRedo,
      zoom: Math.round(editor.camera.zoom * 100),
    };
  });
  const tools: [ToolName, string, string][] = [
    ['pen', 'Pen', 'P'], ['highlighter', 'Highlighter', 'H'], ['eraser', 'Eraser', 'E'],
    ['select', 'Select', 'V'], ['hand', 'Hand', 'Space'],
  ];
  const same = (a: RGBA, b: RGBA) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
</script>

<div class="toolbar" role="toolbar" aria-label="Tools">
  {#each tools as [name, label, key]}
    <button class:active={s.tool === name} title="{label} ({key})" onclick={() => editor.setTool(name)}>{label}</button>
  {/each}
  <span class="sep"></span>
  {#if s.tool === 'highlighter'}
    {#each HIGHLIGHTER_COLORS as c}
      <button class="swatch" class:active={same(c, s.settings.highlighterColor)} style="background:{rgbaToCss(c)}"
        aria-label="Highlighter colour" onclick={() => editor.setSettings({ highlighterColor: c })}></button>
    {/each}
    {#each HIGHLIGHTER_WIDTHS as w}
      <button class:active={w === s.settings.highlighterWidth} onclick={() => editor.setSettings({ highlighterWidth: w })}>{w}px</button>
    {/each}
  {:else}
    {#each PEN_COLORS as c}
      <button class="swatch" class:active={same(c, s.settings.penColor)} style="background:{rgbaToCss(c)}"
        aria-label="Pen colour" onclick={() => editor.setSettings({ penColor: c })}></button>
    {/each}
    {#each PEN_WIDTHS as w}
      <button class:active={w === s.settings.penWidth} onclick={() => editor.setSettings({ penWidth: w })}>{w}px</button>
    {/each}
  {/if}
  <span class="sep"></span>
  <button disabled={!s.canUndo} onclick={() => editor.undo()} title="Undo (Ctrl+Z)">Undo</button>
  <button disabled={!s.canRedo} onclick={() => editor.redo()} title="Redo (Ctrl+Shift+Z)">Redo</button>
  <span class="sep"></span>
  <span class="zoom">{s.zoom}%</span>
  <button onclick={() => editor.fitToBoard()}>Fit</button>
</div>

<style>
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px; background: #fff; border-bottom: 1px solid #e2e2e6; }
  .sep { width: 1px; height: 24px; background: #e2e2e6; margin: 0 4px; }
  .swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; }
  .swatch.active { outline: 2px solid #2f6fed; outline-offset: 2px; }
  .zoom { min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; }
</style>
