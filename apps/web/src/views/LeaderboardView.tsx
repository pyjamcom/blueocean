import { useEffect, useMemo, useState } from "react";
import { useEngagement } from "../context/EngagementContext";
import { getOrCreateClientId } from "../utils/ids";
import { trackEvent } from "../utils/analytics";
import { avatarColor, getAvatarImageUrl } from "../utils/avatar";
import styles from "./LeaderboardView.module.css";

type Period = "weekly" | "season";

interface PublicLeaderboardEntry {
  displayName: string;
  avatarId?: string | null;
  funScore: number;
  deltaPoints?: number | null;
  percentileBand?: string | null;
}

interface PublicLeaderboardResponse {
  period: Period;
  scope: "global" | "group";
  generatedAt: string;
  percentile?: string | null;
  self?: PublicLeaderboardEntry | null;
  top: PublicLeaderboardEntry[];
}

const fallbackTop: PublicLeaderboardEntry[] = [
  { displayName: "Nova", funScore: 980, deltaPoints: 120, percentileBand: "Top 50%" },
  { displayName: "Atlas", funScore: 910, deltaPoints: 90, percentileBand: "Top 50%" },
  { displayName: "Pixel", funScore: 860, deltaPoints: 70, percentileBand: "Top 50%" },
  { displayName: "Mara", funScore: 820, deltaPoints: 45, percentileBand: "Rising" },
  { displayName: "Echo", funScore: 780, deltaPoints: 25, percentileBand: "Rising" },
];

function normalizeEntry(raw: any): PublicLeaderboardEntry | null {
  if (!raw) return null;
  const displayName = raw.displayName ?? raw.display_name ?? raw.name;
  const funScore = raw.funScore ?? raw.fun_score ?? raw.score;
  if (!displayName || typeof funScore !== "number") return null;
  return {
    displayName,
    avatarId: raw.avatarId ?? raw.avatar_id ?? null,
    funScore,
    deltaPoints: raw.deltaPoints ?? raw.delta_points ?? null,
    percentileBand: raw.percentileBand ?? raw.percentile_band ?? null,
  };
}

function normalizeResponse(raw: any, period: Period): PublicLeaderboardResponse | null {
  if (!raw || !Array.isArray(raw.top)) return null;
  const top = raw.top.map(normalizeEntry).filter(Boolean) as PublicLeaderboardEntry[];
  if (!top.length) return null;
  const self = normalizeEntry(raw.self) ?? null;
  return {
    period: raw.period ?? period,
    scope: raw.scope ?? "global",
    generatedAt: raw.generatedAt ?? raw.generated_at ?? new Date().toISOString(),
    percentile: raw.percentile ?? raw.percentile_band ?? null,
    self,
    top,
  };
}

export default function LeaderboardView() {
  const [period, setPeriod] = useState<Period>("weekly");
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { state: engagement } = useEngagement();

  useEffect(() => {
    trackEvent("leaderboard_view", { period });
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    const url = new URL(`${apiBase}/leaderboard`);
    url.searchParams.set("period", period);
    const scope = engagement.group ? "group" : "global";
    url.searchParams.set("scope", scope);
    if (engagement.group) {
      url.searchParams.set("crewCode", engagement.group.code);
    }
    url.searchParams.set("playerId", getOrCreateClientId());
    url.searchParams.set("limit", "10");

    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const normalized = normalizeResponse(json, period);
        if (normalized) {
          setData(normalized);
          return;
        }
        setData({
          period,
          scope: "global",
          generatedAt: new Date().toISOString(),
          top: fallbackTop,
        });
      })
      .catch(() => {
        if (!active) return;
        setData({
          period,
          scope: "global",
          generatedAt: new Date().toISOString(),
          top: fallbackTop,
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [period]);

  const topList = data?.top?.length ? data.top : fallbackTop;
  const fallbackSelf =
    period === "weekly"
      ? {
          displayName: "You",
          funScore: engagement.week.points,
          deltaPoints: engagement.week.points - engagement.week.lastWeekPoints,
          percentileBand: engagement.week.points > engagement.week.lastWeekPoints ? "Top 50%" : "Rising",
        }
      : {
          displayName: "You",
          funScore: engagement.seasonProgress.points,
        };
  const selfEntry = data?.self ?? fallbackSelf;
  const percentile =
    data?.percentile ??
    selfEntry?.percentileBand ??
    (selfEntry?.deltaPoints && selfEntry.deltaPoints > 0 ? "Top 50%" : "Rising");

  const metricValue = (entry: PublicLeaderboardEntry | null) => {
    if (!entry) return 0;
    return period === "weekly" ? entry.deltaPoints ?? 0 : entry.funScore ?? 0;
  };
  const maxMetric = Math.max(
    1,
    metricValue(selfEntry),
    ...topList.map((entry) => metricValue(entry)),
  );
  const selfMetric = metricValue(selfEntry);
  const selfRatio = Math.min(1, selfMetric / maxMetric);
  const selfLabel =
    period === "weekly"
      ? selfMetric > 0
        ? `+${selfMetric}`
        : "No boost yet"
      : `${Math.round(selfRatio * 100)}% glow`;

  const subtitle = useMemo(() => (period === "weekly" ? "This week" : "This season"), [period]);
  const seasonHint = "Season % = leader score. 100% top, 50% half.";
  const boardHint = loading
    ? "Loading..."
    : period === "season"
      ? seasonHint
      : "Keep it silly";
  const scopeLabel = engagement.group ? `Crew ${engagement.group.code}` : "Global";
  const boardTitle = engagement.group ? "Top crew" : "Top vibes";

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.titleEmoji}>🎉</span>
          <h1 className={styles.title}>Funboard</h1>
          <span className={styles.titleEmoji}>🔥</span>
        </div>
        <p className={styles.subtitle}>{subtitle} · {scopeLabel}</p>
      </header>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${period === "weekly" ? styles.tabActive : ""}`}
          onClick={() => setPeriod("weekly")}
        >
          Weekly
        </button>
        <button
          type="button"
          className={`${styles.tab} ${period === "season" ? styles.tabActive : ""}`}
          onClick={() => setPeriod("season")}
        >
          Season
        </button>
      </div>

      <section className={styles.hero}>
        <div className={styles.heroCard}>
          <div className={styles.heroLabel}>Your vibe</div>
          <div className={styles.heroScore}>
            <div className={styles.heroMeter}>
              <span className={styles.heroMeterFill} style={{ width: `${selfRatio * 100}%` }} />
            </div>
            <span className={styles.heroValue}>{selfLabel}</span>
          </div>
          <div className={styles.heroMetaRow}>
            {percentile ? <span className={styles.heroPill}>{percentile}</span> : null}
            {period === "weekly" && selfMetric <= 0 ? (
              <span className={styles.heroDeltaMuted}>Play a round to join the party</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.board}>
        <div className={styles.boardHeader}>
          <span className={styles.boardTitle}>{boardTitle}</span>
          <span className={styles.boardHint}>{boardHint}</span>
        </div>
        <div className={styles.list}>
          {topList.map((entry) => {
            const avatarSrc = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
            const entryMetric = metricValue(entry);
            const entryRatio = Math.min(1, entryMetric / maxMetric);
            const entryLabel =
              period === "weekly"
                ? entryMetric > 0
                  ? `+${entryMetric}`
                  : "—"
                : `${Math.round(entryRatio * 100)}%`;
            return (
              <div key={`${entry.displayName}-${entry.funScore}`} className={styles.row}>
                <div
                  className={styles.avatar}
                  style={{ background: avatarColor(entry.avatarId ?? entry.displayName) }}
                >
                  {avatarSrc ? <img src={avatarSrc} alt="" /> : <span>{entry.displayName.charAt(0)}</span>}
                </div>
                <div className={styles.nameBlock}>
                  <span className={styles.name}>{entry.displayName}</span>
                  {entry.percentileBand ? (
                    <span className={styles.band}>{entry.percentileBand}</span>
                  ) : entry.deltaPoints && entry.deltaPoints > 0 ? (
                    <span className={styles.band}>Top 50%</span>
                  ) : (
                    <span className={styles.band}>Rising</span>
                  )}
                </div>
                <div className={styles.progressBlock}>
                  <div className={styles.progressBar}>
                    <span className={styles.progressFill} style={{ width: `${entryRatio * 100}%` }} />
                  </div>
                  <span className={styles.progressValue}>{entryLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
