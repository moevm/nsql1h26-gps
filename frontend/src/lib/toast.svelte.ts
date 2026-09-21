export interface Toast {
  id: number;
  kind: "ok" | "error";
  text: string;
}

export const toasts: { items: Toast[] } = $state({ items: [] });

let nextId = 1;

export function toast(kind: Toast["kind"], text: string): void {
  const id = nextId++;
  toasts.items.push({ id, kind, text });
  setTimeout(() => {
    toasts.items = toasts.items.filter((t) => t.id !== id);
  }, 4000);
}
