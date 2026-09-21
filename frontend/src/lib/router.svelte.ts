export interface Route {
  path: string;
  query: URLSearchParams;
  raw: string;
}

export const current: Route = $state({ path: "/", query: new URLSearchParams(), raw: "/" });

function parse(): void {
  const raw = location.hash.slice(1) || "/";
  const qIdx = raw.indexOf("?");
  current.path = qIdx === -1 ? raw : raw.slice(0, qIdx);
  current.query = new URLSearchParams(qIdx === -1 ? "" : raw.slice(qIdx + 1));
  current.raw = raw;
}

if (typeof window !== "undefined") {
  parse();
  window.addEventListener("hashchange", parse);
}

export function navigate(path: string, query?: URLSearchParams | Record<string, string>): void {
  const q = query instanceof URLSearchParams ? query : query ? new URLSearchParams(query) : null;
  const target = q && q.size > 0 ? `${path}?${q}` : path;
  if (location.hash === `#${target}`) {
    parse();
  } else {
    location.hash = target;
  }
}

export function setQuery(query: URLSearchParams): void {
  navigate(current.path, query);
}
