import { SEASON_ANCHOR_DAY, SEASON_LENGTH_DAYS, WEEK_START_DAY } from "./config";
import { EngagementSeason } from "./types";

export function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDayKey(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map((part) => Number(part));
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

export function diffDays(a: string, b: string) {
  const aDate = parseDayKey(a);
  const bDate = parseDayKey(b);
  const diffMs = bDate.getTime() - aDate.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export function getWeekKey(date: Date) {
  const weekStart = startOfWeek(date, WEEK_START_DAY);
  const year = weekStart.getFullYear();
  const firstWeekStart = startOfWeek(new Date(year, 0, 1), WEEK_START_DAY);
  const diffMs = weekStart.getTime() - firstWeekStart.getTime();
  const weekIndex = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${year}-W${String(weekIndex).padStart(2, "0")}`;
}

export function startOfWeek(date: Date, weekStartDay: number) {
  const day = date.getDay();
  const diff = (day < weekStartDay ? 7 : 0) + day - weekStartDay;
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(date.getDate() - diff);
  return result;
}

export function getSeasonInfo(now: Date): EngagementSeason {
  const anchor = parseDayKey(SEASON_ANCHOR_DAY);
  const diff = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000)));
  const seasonIndex = Math.floor(diff / SEASON_LENGTH_DAYS);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + seasonIndex * SEASON_LENGTH_DAYS);
  const end = new Date(start);
  end.setDate(start.getDate() + SEASON_LENGTH_DAYS - 1);
  return {
    id: `S${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
    startDay: formatDayKey(start),
    endDay: formatDayKey(end),
    lengthDays: SEASON_LENGTH_DAYS,
  };
}
