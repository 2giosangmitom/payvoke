import { useLayoutEffect, useRef, useState } from "react";

// Where things are on the screen, measured on every frame so the camera and
// the pointer land on the real button even as the chat grows under it.
// Positions are layout offsets inside the window root, so the camera's own
// transforms don't skew them. Elements are found by `data-mark`, or by their
// exact text for parts inside shared components (QuoteCard's "Accept and pay").

export type Box = { x: number; y: number; w: number; h: number };
export type Marks = Record<string, Box>;

function offsetIn(element: HTMLElement, root: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  if (node !== root) return null;
  return { x, y, w: element.offsetWidth, h: element.offsetHeight };
}

export function useMarks(texts: readonly string[] = []) {
  const ref = useRef<HTMLDivElement>(null);
  const [marks, setMarks] = useState<Marks>({});
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next: Marks = {};
    root.querySelectorAll<HTMLElement>("[data-mark]").forEach((element) => {
      const box = offsetIn(element, root);
      if (box) next[element.dataset.mark!] = box;
    });
    if (texts.length) {
      const all = Array.from(root.querySelectorAll<HTMLElement>("button, span, label, a, p, strong"));
      for (const text of texts) {
        // The innermost element whose text is exactly this.
        const hit = all.filter((element) => element.textContent?.trim() === text).at(-1);
        const box = hit && offsetIn(hit, root);
        if (box) next[text] = box;
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(marks)) setMarks(next);
  });
  return { ref, marks };
}

export const center = (box: Box | undefined, fallback: { x: number; y: number }) =>
  box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : fallback;
