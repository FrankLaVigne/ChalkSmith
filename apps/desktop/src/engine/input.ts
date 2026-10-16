import type { Editor } from './editor';
import type { ToolPointer } from './tools';

/** Normalises wheel deltas to pixels (deltaMode 1 = lines, 2 = pages). */
export function wheelDelta(e: { deltaX: number; deltaY: number; deltaMode: number }, pageHeight: number): [number, number] {
  const m = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageHeight : 1;
  return [e.deltaX * m, e.deltaY * m];
}

/** Zoom factor for a normalised vertical wheel delta, clamped to about 1.28x per step. */
export function zoomFactor(dy: number): number {
  return Math.exp(-Math.min(25, Math.max(-25, dy)) * 0.01);
}

/** Wires pointer, wheel and keyboard input on the canvas to the editor. Returns a detach function. */
export function attachInput(canvas: HTMLCanvasElement, ed: Editor): () => void {
  let spaceDown = false;
  let panning: { id: number; x: number; y: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let gesture: number | null = null;
  let pinch: { dist: number; mx: number; my: number } | null = null;
  canvas.style.touchAction = 'none';

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const toPointer = (e: PointerEvent): ToolPointer => {
    const [sx, sy] = local(e);
    const [wx, wy] = ed.camera.screenToWorld(sx, sy);
    return { sx, sy, wx, wy, pressure: e.pressure, pointerType: e.pointerType };
  };
  const pinchState = () => {
    const [a, b] = [...touches.values()];
    const [ax, ay] = local({ clientX: a.x, clientY: a.y });
    const [bx, by] = local({ clientX: b.x, clientY: b.y });
    return { dist: Math.hypot(bx - ax, by - ay) || 1, mx: (ax + bx) / 2, my: (ay + by) / 2 };
  };

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { ed.pointerCancel(); gesture = null; pinch = pinchState(); return; }
    }
    if (e.button === 1 || (spaceDown && e.button === 0)) {
      panning = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (gesture !== null) return;
    if (!e.isPrimary || pinch) return;
    gesture = e.pointerId;
    ed.pointerDown(toPointer(e));
  };

  const onMove = (e: PointerEvent) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const now = pinchState();
      ed.camera.panBy(now.mx - pinch.mx, now.my - pinch.my);
      ed.camera.zoomAt(now.mx, now.my, now.dist / pinch.dist);
      pinch = now;
      ed.viewChanged();
      return;
    }
    if (panning && panning.id === e.pointerId) {
      ed.camera.panBy(e.clientX - panning.x, e.clientY - panning.y);
      panning.x = e.clientX;
      panning.y = e.clientY;
      ed.viewChanged();
      return;
    }
    if (gesture !== e.pointerId) return;
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length ? events : [e]) ed.pointerMove(toPointer(ce));
  };

  const onUp = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (panning?.id === e.pointerId) { panning = null; return; }
    if (gesture !== e.pointerId) return;
    gesture = null;
    ed.pointerUp(toPointer(e));
  };

  const onCancel = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    pinch = null;
    panning = null;
    if (e.pointerId === gesture) { gesture = null; ed.pointerCancel(); }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const [dx, dy] = wheelDelta(e, canvas.clientHeight);
    if (e.ctrlKey || e.metaKey) ed.camera.zoomAt(sx, sy, zoomFactor(dy));
    else ed.camera.panBy(-dx, -dy);
    ed.viewChanged();
  };

  const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === ' ' && !isTyping(e.target)) { spaceDown = true; e.preventDefault(); } };
  const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceDown = false; };

  const onBlur = () => { spaceDown = false; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
