export type LeaderboardEntry = {
  displayName: string;
  avatarId?: string | null;
  funScore: number;
  deltaPoints?: number | null;
  progressPercent?: number | null;
};

export const FALLBACK_WEEKLY_LEADERBOARD: ReadonlyArray<LeaderboardEntry> = [
  { displayName: "Nova", avatarId: "leaderboard_nova", funScore: 1200, progressPercent: 100 },
  { displayName: "Atlas", avatarId: "leaderboard_atlas", funScore: 950, progressPercent: 90 },
  { displayName: "Pixel", avatarId: "leaderboard_pixel", funScore: 800, progressPercent: 70 },
  { displayName: "Mara", avatarId: "leaderboard_mara", funScore: 650, progressPercent: 55 },
  { displayName: "Echo", avatarId: "leaderboard_echo", funScore: 500, progressPercent: 40 },
];

export function toWeeklyPercentLabel(entry: Pick<LeaderboardEntry, "progressPercent" | "deltaPoints" | "funScore">) {
  const raw = entry.progressPercent ?? entry.deltaPoints ?? entry.funScore;
  const value = Math.min(100, Math.max(0, Number(raw) || 0));
  return `${Math.round(value)}%`;
}
