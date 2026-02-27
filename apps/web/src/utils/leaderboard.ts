export type LeaderboardEntry = {
  displayName: string;
  avatarId?: string | null;
  funScore: number;
  deltaPoints?: number | null;
  progressPercent?: number | null;
};

export const FALLBACK_WEEKLY_LEADERBOARD: ReadonlyArray<LeaderboardEntry> = [
  { displayName: "Nova", funScore: 1200, progressPercent: 100 },
  { displayName: "Atlas", funScore: 950, progressPercent: 90 },
  { displayName: "Pixel", funScore: 800, progressPercent: 70 },
  { displayName: "Mara", funScore: 650, progressPercent: 55 },
  { displayName: "Echo", funScore: 500, progressPercent: 40 },
];

export function toWeeklyPercentLabel(entry: Pick<LeaderboardEntry, "progressPercent" | "deltaPoints" | "funScore">) {
  const raw = entry.progressPercent ?? entry.deltaPoints ?? entry.funScore;
  const value = Math.min(100, Math.max(0, Number(raw) || 0));
  return `${Math.round(value)}%`;
}
