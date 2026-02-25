import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEngagement } from "../context/EngagementContext";
import { getOrCreateClientId } from "../utils/ids";
import { trackEvent } from "../utils/analytics";
import { JOIN_META_DESCRIPTION, LEADERBOARD_SHARE_TITLE } from "../utils/seo";
import { avatarColor, getAvatarImageUrl } from "../utils/avatar";
import styles from "./LeaderboardView.module.css";

type Period = "weekly" | "season";

interface PublicLeaderboardEntry {
  displayName: string;
  avatarId?: string | null;
  funScore: number;
  deltaPoints?: number | null;
  progressPercent?: number | null;
}

interface PublicLeaderboardResponse {
  period: Period;
  scope: "global" | "group";
  generatedAt: string;
  self?: PublicLeaderboardEntry | null;
  top: PublicLeaderboardEntry[];
}

interface RowTone {
  rowGradient: string;
  rowBorder: string;
}

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
    progressPercent: raw.progressPercent ?? raw.progress_percent ?? null,
  };
}

function normalizeResponse(raw: any, period: Period): PublicLeaderboardResponse | null {
  if (!raw || !Array.isArray(raw.top)) return null;
  const top = raw.top.map(normalizeEntry).filter(Boolean) as PublicLeaderboardEntry[];
  if (!top.length) return null;
  return {
    period: raw.period ?? period,
    scope: raw.scope ?? "global",
    generatedAt: raw.generatedAt ?? raw.generated_at ?? new Date().toISOString(),
    self: normalizeEntry(raw.self) ?? null,
    top,
  };
}

function rowTone(rank: number): RowTone {
  if (rank === 1) {
    return {
      rowGradient: "linear-gradient(180deg, #bab407 0%, #4e4c05 100%)",
      rowBorder: "#fff70d",
    };
  }
  if (rank === 2) {
    return {
      rowGradient: "linear-gradient(180deg, #737373 0%, #212121 100%)",
      rowBorder: "#ffffff",
    };
  }
  if (rank === 3) {
    return {
      rowGradient: "linear-gradient(180deg, #ac7207 0%, #462e02 100%)",
      rowBorder: "#f4a106",
    };
  }
  return {
    rowGradient: "linear-gradient(180deg, #7807ac 0%, #330246 100%)",
    rowBorder: "#b515ff",
  };
}

const fallbackTop: PublicLeaderboardEntry[] = [
  { displayName: "Nova", funScore: 1200, progressPercent: 100 },
  { displayName: "Atlas", funScore: 950, progressPercent: 90 },
  { displayName: "Pixel", funScore: 800, progressPercent: 70 },
  { displayName: "Mara", funScore: 650, progressPercent: 55 },
  { displayName: "Echo", funScore: 500, progressPercent: 40 },
];

export default function LeaderboardView() {
  const navigate = useNavigate();
  const { state: engagement } = useEngagement();
  const [period, setPeriod] = useState<Period>("weekly");
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const funScoreSentRef = useRef<string>("");

  useEffect(() => {
    trackEvent("leaderboard_view", { period });
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
    const url = new URL(`${apiBase}/leaderboard`);
    url.searchParams.set("period", period);
    url.searchParams.set("scope", engagement.group ? "group" : "global");
    if (engagement.group) {
      url.searchParams.set("crewCode", engagement.group.code);
    }
    url.searchParams.set("playerId", getOrCreateClientId());
    url.searchParams.set("limit", "13");

    fetch(url.toString())
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active) return;
        const normalized = normalizeResponse(json, period);
        if (normalized) {
          setData(normalized);
        } else {
          setData({
            period,
            scope: "global",
            generatedAt: new Date().toISOString(),
            top: fallbackTop,
          });
        }
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
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [engagement.group, period]);

  const topList = (data?.top?.length ? data.top : fallbackTop).slice(0, 8);

  const computeProgressPercent = (current: number, previous: number) => {
    if (previous <= 0) return current > 0 ? 100 : 0;
    const delta = Math.max(0, current - previous);
    return Math.min(100, Math.round((delta / Math.max(1, previous)) * 100));
  };

  const fallbackWeeklyProgress = computeProgressPercent(
    engagement.week.points,
    engagement.week.lastWeekPoints,
  );

  const fallbackSelf: PublicLeaderboardEntry =
    period === "weekly"
      ? {
          displayName: "You",
          funScore: 0,
          progressPercent: fallbackWeeklyProgress,
          deltaPoints: engagement.week.points - engagement.week.lastWeekPoints,
        }
      : {
          displayName: "You",
          funScore: engagement.seasonProgress.points,
          progressPercent: null,
          deltaPoints: null,
        };

  const selfEntry = data?.self ?? fallbackSelf;

  const metricValue = (entry: PublicLeaderboardEntry | null) => {
    if (!entry) return 0;
    return period === "weekly"
      ? Math.min(100, Math.max(0, entry.progressPercent ?? entry.deltaPoints ?? 0))
      : Math.max(0, entry.funScore);
  };

  const maxMetric = Math.max(
    1,
    metricValue(selfEntry),
    ...topList.map((entry) => metricValue(entry)),
  );

  const selfMetric = metricValue(selfEntry);
  const selfRatio = Math.min(1, selfMetric / maxMetric);
  const selfPercent = period === "weekly" ? Math.round(selfMetric) : Math.round(selfRatio * 100);

  useEffect(() => {
    const score = selfEntry?.funScore ?? 0;
    const key = `${period}:${score}`;
    if (funScoreSentRef.current === key) return;
    funScoreSentRef.current = key;
    trackEvent("fun_score", { period, score });
  }, [period, selfEntry?.funScore]);

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "https://escapers.app/leaderboard";
  const shareTitle = LEADERBOARD_SHARE_TITLE;
  const shareText = JOIN_META_DESCRIPTION;
  const shareTextX = `${shareText} →`;
  const shareTextReddit = `${shareTitle} — ${shareText}`;
  const shareTextTwitch = `${shareTitle}. ${shareText}`;

  const copyShareLink = async (label: string, content?: string) => {
    try {
      const payload = content ?? shareUrl;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else {
        const temp = document.createElement("textarea");
        temp.value = payload;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      trackEvent("leaderboard_share", { channel: `${label.toLowerCase()}_copy`, period });
    } catch {
      trackEvent("leaderboard_share", { channel: `${label.toLowerCase()}_copy_failed`, period });
    }
  };

  const openShare = (url: string, channel: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    trackEvent("leaderboard_share", { channel, period });
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        trackEvent("leaderboard_share", { channel: "native", period });
        return;
      } catch {
        // fall back to copy when share sheet is unavailable or closed
      }
    }
    await copyShareLink("Share");
  };

  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(
    shareUrl,
  )}&title=${encodeURIComponent(shareTextReddit)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareTextX,
  )}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className={styles.wrap}>
      <section className={styles.phone} aria-label="Leaderboard screen">
        <img className={styles.bgPattern} src="/figma/join/image-931.png" alt="" aria-hidden="true" />
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>Leaderboard</h1>
          <div className={styles.segmentPicker}>
            <button
              type="button"
              className={`${styles.segmentButton} ${period === "weekly" ? styles.segmentActive : ""}`}
              onClick={() => setPeriod("weekly")}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`${styles.segmentButton} ${period === "season" ? styles.segmentActive : ""}`}
              onClick={() => setPeriod("season")}
            >
              Season
            </button>
          </div>
        </header>

        <main className={styles.mobile}>
          <div className={styles.topBlock}>
            <section
              className={styles.vibeCard}
              title="Season mode: 100% = current leader score, 50% = half of leader score."
            >
              <div className={styles.vibeRow}>
                <span>Your vibe:</span>
                <span>{loading ? "..." : `${selfPercent}%`}</span>
              </div>
              <div className={styles.progressTrack}>
                <span className={styles.progressFill} style={{ width: `${selfRatio * 100}%` }} />
                <span className={styles.progressKnob} style={{ left: `calc(${selfRatio * 100}% - 11px)` }} />
              </div>
            </section>

            <section className={styles.shareCard}>
              <h2 className={styles.cardTitle}>Share on:</h2>
              <div className={styles.shareRow}>
                <button type="button" className={styles.shareButton} onClick={() => openShare(redditUrl, "reddit")} aria-label="Share on Reddit">
                  <span className={styles.shareGlyph}>👽</span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={handleNativeShare}
                  aria-label="Share"
                >
                  <span className={styles.shareGlyph}>◎</span>
                </button>
                <button type="button" className={styles.shareButton} onClick={() => openShare(facebookUrl, "facebook")} aria-label="Share on Facebook">
                  <span className={styles.shareGlyph}>f</span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => copyShareLink("Twitch", `${shareTextTwitch} ${shareUrl}`)}
                  aria-label="Share on Twitch"
                >
                  <span className={styles.shareGlyph}>T</span>
                </button>
                <button type="button" className={styles.shareButton} onClick={() => openShare(xUrl, "x")} aria-label="Share on X">
                  <span className={styles.shareGlyph}>X</span>
                </button>
              </div>
            </section>

            <section className={styles.listCard}>
              <div className={styles.listRows}>
                {topList.map((entry, index) => {
                  const rank = index + 1;
                  const tone = rowTone(rank);
                  const avatarSrc = entry.avatarId ? getAvatarImageUrl(entry.avatarId) : null;
                  const entryMetric = metricValue(entry);
                  const entryRatio = Math.min(1, entryMetric / maxMetric);
                  const valueLabel =
                    period === "weekly"
                      ? `${Math.max(0, Math.round(entryMetric))}%`
                      : `${Math.round(entryRatio * 100)}%`;
                  return (
                    <article
                      key={`${entry.displayName}-${index}`}
                      className={styles.row}
                      style={{ background: tone.rowGradient, borderColor: tone.rowBorder }}
                    >
                      <div className={styles.rowLeft}>
                        <span className={styles.rankChip}>🏆 {rank}</span>
                        <div className={styles.rowIdentity}>
                          <span
                            className={styles.avatar}
                            style={{ background: avatarColor(entry.avatarId ?? entry.displayName) }}
                          >
                            {avatarSrc ? (
                              <img src={avatarSrc} alt="" />
                            ) : (
                              <span>{entry.displayName.charAt(0).toUpperCase()}</span>
                            )}
                          </span>
                          <span className={styles.rowName}>{entry.displayName}</span>
                        </div>
                      </div>
                      <span className={styles.scoreBadge}>{valueLabel}</span>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => navigate("/join", { replace: true })}
              aria-label="Logout"
            >
              <span className={styles.actionIcon} aria-hidden="true" />
            </button>
          </div>
        </main>
      </section>
    </div>
  );
}
