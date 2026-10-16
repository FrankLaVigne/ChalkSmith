import { parse, type DefaultTreeAdapterMap } from 'parse5';

export type Node = DefaultTreeAdapterMap['node'];
export type Element = DefaultTreeAdapterMap['element'];
export type Document = DefaultTreeAdapterMap['document'];

export const parseHtml = (html: string): Document => parse(html);

export function isElement(n: Node): n is Element {
  return 'tagName' in n;
}

function kids(n: Node): Node[] {
  return (n as { childNodes?: Node[] }).childNodes ?? [];
}

export function attr(el: Element, name: string): string | null {
  const lower = name.toLowerCase();
  const a = el.attrs.find((x) => x.name.toLowerCase() === lower);
  return a ? a.value : null;
}

export function hasClass(el: Element, c: string): boolean {
  return (attr(el, 'class') ?? '').split(/\s+/).includes(c);
}

export function childElements(el: Node): Element[] {
  return kids(el).filter(isElement);
}

export function* descendants(root: Node): Generator<Element> {
  const stack = [...kids(root)].reverse();
  while (stack.length) {
    const n = stack.pop()!;
    if (!isElement(n)) continue;
    yield n;
    const c = kids(n);
    for (let i = c.length - 1; i >= 0; i--) stack.push(c[i]);
  }
}

export function findFirst(root: Node, pred: (e: Element) => boolean): Element | null {
  for (const e of descendants(root)) if (pred(e)) return e;
  return null;
}

export function findAll(root: Node, pred: (e: Element) => boolean): Element[] {
  const out: Element[] = [];
  for (const e of descendants(root)) if (pred(e)) out.push(e);
  return out;
}

export const tag = (name: string) => (e: Element) => e.tagName.toLowerCase() === name;
