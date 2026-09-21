import { getToken, setToken } from "../lib/api";
import type { AdminDto, UserDto } from "../lib/types";

interface Session {
  kind: "user" | "admin";
  token: string;
  user: UserDto | AdminDto;
}

const SESSION_KEY = "session";

function load(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export const session: { current: Session | null } = $state({ current: load() });

export function saveSession(s: Session): void {
  session.current = s;
  setToken(s.token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  session.current = null;
  setToken(null);
  localStorage.removeItem(SESSION_KEY);
}

export function isAdmin(): boolean {
  return session.current?.kind === "admin";
}

export function isPlayer(): boolean {
  return session.current?.kind === "user";
}

export function me(): Session["user"] | null {
  return session.current?.user ?? null;
}
