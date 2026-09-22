/// <reference types="vite/client" />

import { treaty } from "@elysiajs/eden";
import type { App } from "../../../backend/src/app";
import type {
  Achievement,
  AdminAchievementDetail,
  AdminListResponse,
  AdminPoiDetail,
  AdminQuestDetail,
  AdminStats,
  AdminUserDetail,
  AuthResponse,
  LogEntry,
  Poi,
  Quest,
  UserDto,
} from "./types";
import type { MeResponse, PingResponse, VisiblePoi } from "./types";

const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8081";

export interface TreatyResult<T> {
  data: T | null;
  error: { status: number; value: unknown } | null;
}

export async function unwrap<T>(res: TreatyResult<T>): Promise<T> {
  if (res.error) {
    const v = res.error.value as { message?: string } | undefined;
    throw new Error(typeof v === "object" && v?.message ? v.message : `HTTP ${res.error.status}`);
  }
  return res.data as T;
}

export interface ListQueryParams {
  f?: string[];
  query?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export function qsToObj(q: URLSearchParams): ListQueryParams {
  const o: ListQueryParams = {};
  const f = q.getAll("f");
  if (f.length > 0) o.f = f;
  const query = q.get("query");
  if (query != null) o.query = query;
  const page = q.get("page");
  if (page != null) o.page = Number(page);
  const pageSize = q.get("pageSize");
  if (pageSize != null) o.pageSize = Number(pageSize);
  const sortBy = q.get("sortBy");
  if (sortBy != null) o.sortBy = sortBy;
  const sortDir = q.get("sortDir");
  if (sortDir === "asc" || sortDir === "desc") o.sortDir = sortDir;
  return o;
}

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem("token", token);
  else localStorage.removeItem("token");
}

type Query = { query?: ListQueryParams };
type Tr<T> = Promise<TreatyResult<T>>;

interface Credentials {
  username: string;
  password: string;
}

interface UserPatch {
  status?: "Active" | "Banned";
  note?: string;
  username?: string;
}

interface UserCreateBody {
  username: string;
  password: string;
  status?: "Active" | "Banned";
}

interface QuestBody {
  name: string;
  description?: string;
  reward?: string;
  duration?: string;
  trigger_rules?: unknown[];
  note?: string;
  depends_on?: number[];
}

interface PoiBody {
  name: string;
  type: string;
  description?: string;
  tags?: string;
  location: { latitude: number; longitude: number };
  note?: string;
}

interface AchievementBody {
  name: string;
  description?: string;
  reward?: string;
  trigger_rules?: unknown[];
  note?: string;
  requires_quest?: number;
  depends_on?: number[];
}

interface AdminUserParams {
  get(): Tr<AdminUserDetail>;
  patch(b: UserPatch): Tr<AdminUserDetail>;
  avatar: { post(b: { file: File }): Tr<{ avatar: string }> };
  quests: { post(b: { questId: number }): Tr<{ questId: number; status: string }> };
  achievements: { post(b: { achievementId: number }): Tr<{ achievementId: number; unlockedAt: string }> };
}

interface AdminItemParams<T, P> {
  get(): Tr<T>;
  patch(b: Partial<P>): Tr<T>;
}

export interface ApiClient {
  auth: { login: { post(b: Credentials): Tr<AuthResponse> }; register: { post(b: Credentials): Tr<AuthResponse> } };
  admin: {
    auth: { login: { post(b: Credentials): Tr<AuthResponse> }; register: { post(b: Credentials): Tr<AuthResponse> } };
    stats: {
      get(q?: {
        query?: { period?: "today" | "week" | "month" | "custom"; from?: string; to?: string; groupBy?: "day" | "hour" | "week" };
      }): Tr<AdminStats>;
    };
    logs: {
      get(q?: Query): Tr<AdminListResponse<LogEntry>>;
      (p: { id: number }): { raw: { get(): Tr<LogEntry> } };
    };
    users: {
      get(q?: Query): Tr<AdminListResponse<UserDto>>;
      post(b: UserCreateBody): Tr<UserDto>;
      (p: { id: number }): AdminUserParams;
    };
    quests: {
      get(q?: Query): Tr<AdminListResponse<Quest>>;
      post(b: QuestBody): Tr<Quest>;
      (p: { id: number }): AdminItemParams<AdminQuestDetail, QuestBody>;
    };
    pois: {
      get(q?: Query): Tr<AdminListResponse<Poi>>;
      post(b: PoiBody): Tr<Poi>;
      (p: { id: number }): AdminItemParams<AdminPoiDetail, PoiBody>;
    };
    achievements: {
      get(q?: Query): Tr<AdminListResponse<Achievement>>;
      post(b: AchievementBody): Tr<Achievement>;
      (p: { id: number }): AdminItemParams<AdminAchievementDetail, AchievementBody>;
    };
    data: { import: { post(b: { file: File }): Tr<{ nodes: number; relationships: number }> } };
  };
  me: {
    get(): Tr<import("./types").MeResponse>;
    ping: { post(b: { latitude: number; longitude: number }): Tr<PingResponse> };
    patch(b: { username?: string }): Tr<UserDto>;
    logout: { post(): Tr<{ ok: boolean }> };
    avatar: { post(b: { file: File }): Tr<{ avatar: string }> };
  };
  map: { visible: { get(): Tr<VisiblePoi[]> } };
  quests: {
    get(): Tr<Quest[]>;
    (p: { id: number }): {
      accept: {
        post(): Tr<{ ok: boolean; quests: { questId: number; name: string; status: "IN_PROGRESS" | "COMPLETED"; progress: string | null }[]; achievements: { achievementId: number; name: string }[] }>;
        delete(): Tr<{ ok: boolean }>;
      };
    };
  };
}

export const client = treaty<App>(API_BASE, {
  parseDate: false,
  headers: () => {
    const token = localStorage.getItem("token");
    const h: Record<string, string> = {};
    if (token) h.authorization = `Bearer ${token}`;
    return h;
  },
}) as unknown as ApiClient;

export async function downloadFile(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { message?: string };
      if (b?.message) message = b.message;
    } catch {
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(cd);
  const name = match?.[1] ?? "export.json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
