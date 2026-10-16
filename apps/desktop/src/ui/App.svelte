<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import type { RescueReport as Report } from '@chalksmith/core';
  import { EditorDoc } from '../engine/document';
  import { Editor, type ToolName } from '../engine/editor';
  import { attachInput } from '../engine/input';
  import { Renderer } from '../engine/renderer';
  import { tauriPlatform as pf } from '../platform';
  import { confirmDiscard, displayName, errorText, exportSvg, openBoard, saveBoard, saveBoardAs } from './actions';
  import { installMenu } from './menu';
  import RescueReport from './RescueReport.svelte';
  import Toolbar from './Toolbar.svelte';

  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let renderer: Renderer | null = null;
  let frame = 0;
  let tick = $state(0);
  let report = $state<Report | null>(null);
  let busy = $state<string | null>(null);

  const editor = new Editor(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      renderer?.draw(editor);
    });
  });

  const guard = (fn: () => unknown | Promise<unknown>) => async () => {
    try { await fn(); } catch (e) { await pf.error('Unexpected error', errorText(e)).catch(() => {}); }
  };

  /** Show the overlay, then wait until it has painted before the caller blocks the thread. */
  async function showBusy(text: string) {
    busy = text;
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  async function doOpen() {
    let r;
    try {
      r = await openBoard(editor, pf, { beforeHeavyWork: (kind) => showBusy(kind === 'chalk' ? 'Opening board…' : 'Rescuing board…') });
    } finally {
      busy = null;
    }
    if (!r) return;
    report = null;
    if (r.report) report = r.report;
    if (r.warnings.length) await pf.error('Opened with warnings', r.warnings.join('\n'));
  }

  async function doClose() {
    if (await confirmDiscard(editor, pf)) { report = null; editor.load(EditorDoc.empty()); }
  }

  async function doSaveFromReport() {
    if (await saveBoardAs(editor, pf)) report = null;
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); editor.undo(); }
    else if ((mod && k === 'z' && e.shiftKey) || (mod && k === 'y')) { e.preventDefault(); editor.redo(); }
    else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); editor.deleteSelection(); }
    else if (!mod && !e.altKey) {
      const map: Record<string, ToolName> = { p: 'pen', h: 'highlighter', e: 'eraser', v: 'select' };
      if (map[k]) editor.setTool(map[k]);
    }
  }

  let lastTitle = '';
  function updateTitle() {
    const d = editor.doc;
    const title = `${d.dirty ? '• ' : ''}${displayName(d.source)} — ChalkSmith`;
    if (title === lastTitle) return;
    lastTitle = title;
    void getCurrentWindow().setTitle(title).catch(() => { lastTitle = ''; });
  }
  const onRejection = (e: PromiseRejectionEvent) => {
    e.preventDefault();
    void pf.error('Unexpected error', errorText(e.reason)).catch(() => {});
  };

  onMount(() => {
    renderer = new Renderer(canvas, () => editor.render());
    const resize = () => {
      editor.setViewport(host.clientWidth, host.clientHeight);
      renderer!.resize(host.clientWidth, host.clientHeight);
      editor.render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    let dprQuery: MediaQueryList | null = null;
    const onDpr = () => { resize(); watchDpr(); };
    const watchDpr = () => {
      dprQuery?.removeEventListener('change', onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener('change', onDpr);
    };
    watchDpr();
    const detach = attachInput(canvas, editor);
    const off = editor.onChange(() => { tick++; updateTitle(); });
    updateTitle();
    window.addEventListener('unhandledrejection', onRejection);
    void guard(() => installMenu({
      open: guard(doOpen),
      save: guard(() => saveBoard(editor, pf)),
      saveAs: guard(() => saveBoardAs(editor, pf)),
      exportSvg: guard(() => exportSvg(editor, pf)),
      close: guard(doClose),
      quit: guard(async () => { if (await confirmDiscard(editor, pf)) await getCurrentWindow().destroy(); }),
    }))();
    const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
      if (!(await confirmDiscard(editor, pf))) e.preventDefault();
    });
    window.addEventListener('keydown', onKey);
    return () => {
      ro.disconnect();
      dprQuery?.removeEventListener('change', onDpr);
      detach();
      off();
      void unlisten.then((u) => u());
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  });
</script>

<div class="app">
  <Toolbar {editor} {tick} />
  <div class="stage" bind:this={host}>
    <canvas bind:this={canvas}></canvas>
  </div>
  {#if busy}
    <div class="busy" role="status" aria-live="polite"><div class="busy-box">{busy}</div></div>
  {/if}
  {#if report}
    <RescueReport {report} onSave={guard(doSaveFromReport)} onClose={() => (report = null)} />
  {/if}
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  .stage { position: relative; flex: 1; overflow: hidden; }
  canvas { display: block; }
  .busy {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.25); z-index: 20; cursor: progress;
  }
  .busy-box {
    background: #fff; color: #222; padding: 16px 24px; border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); font: 14px system-ui, sans-serif;
  }
</style>
