export interface UserDto {
  id: number;
  username: string;
  status: "Active" | "Banned";
  avatar: string | null;
  exp: number;
  total_distance_km: number;
  created_at: string;
  updated_at?: string;
}

export interface AdminDto {
  id: number;
  username: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: UserDto | AdminDto;
}

export interface Poi {
  id: number;
  name: string;
  type: string;
  description: string | null;
  tags: string | null;
  location: { latitude: number; longitude: number };
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VisiblePoi extends Poi {
  discovered: boolean;
  discoveredAt: string | null;
}

export interface AchievementBrief {
  id: number;
  name: string;
  description: string | null;
  reward: string | null;
}

export interface Achievement extends AchievementBrief {
  trigger_rules: TriggerRule[];
  note?: string | null;
  unlockedAt?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TriggerRule =
  | { type: "POI_TYPE_COUNT"; poiType: string; count: number }
  | { type: "POI_ID"; poiId: number }
  | { type: "DISTANCE_KM"; distanceKm: number }
  | { type: "CELL_COUNT"; count: number }
  | { type: "QUEST_COMPLETED"; questId: number };

export type QuestStatus = "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

export interface Quest {
  id: number;
  name: string;
  description: string | null;
  reward: string | null;
  duration: string | null;
  trigger_rules: string | TriggerRule[];
  note?: string | null;
  status: QuestStatus;
  progress: string | null;
  startedAt: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PingResponse {
  h3: string;
  newCell: boolean;
  distanceDeltaKm: number;
  totalDistanceKm: number;
  exp: number;
  newPois: Poi[];
  quests: { questId: number; name: string; status: "IN_PROGRESS" | "COMPLETED"; progress: string | null }[];
  achievements: { achievementId: number; name: string }[];
}

export interface MeResponse extends UserDto {
  level: number;
  exploration_percent: number;
  achievements: AchievementBrief[];
}

export interface LeaderboardItem {
  id: number;
  username: string;
  avatar: string | null;
  exp: number;
  distance: number;
}

export interface LeaderboardResponse {
  items: LeaderboardItem[];
  rank: number;
  total: number;
  page: number;
  pageSize: number;
  sortBy: "exp" | "distance";
}

export interface PublicProfile {
  id: number;
  username: string;
  avatar: string | null;
  exp: number;
  total_distance_km: number;
  created_at: string;
  level: number;
  achievements: AchievementBrief[];
}

export interface AdminStats {
  period: { from: string; to: string; groupBy: "day" | "hour" | "week" };
  totals: { totalUsers: number; newUsers: number; activeUsers: number; completedQuests: number };
  database: { nodes: number; relationships: number };
  series: { bucket: string; count: number }[];
  questStatus: { status: string; c: number }[];
  entityTypes: { entityType: string; c: number }[];
}

export interface AdminListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserDetail extends UserDto {
  note?: string | null;
  cellsVisited: number;
  poisDiscovered: number;
  quests: { id: number; name: string; status: QuestStatus; progress: string | null }[];
  achievements: { id: number; name: string }[];
  recentLogs: LogEntry[];
}

export interface AdminQuestDetail extends Quest {
  dependsOn: { id: number; name: string }[];
  relatedLogs: LogEntry[];
}

export interface AdminPoiDetail extends Poi {
  cellIndex: string;
  relatedLogs: LogEntry[];
}

export interface AdminAchievementDetail extends Achievement {
  requiresQuest: { id: number; name: string }[];
  dependsOn: { id: number; name: string }[];
}

export interface LogEntry {
  id: number;
  type: string;
  user_id?: number | null;
  entity_id?: number | null;
  entity_type: string;
  priority: "Low" | "Medium" | "High";
  timestamp: string;
  description: string;
  details?: unknown;
}
