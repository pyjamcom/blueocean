import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEngagement } from "../context/EngagementContext";
import { BADGE_DEFINITIONS } from "../engagement/config";
import { getOrCreateClientId } from "../utils/ids";
import { trackEvent } from "../utils/analytics";
import { JOIN_META_DESCRIPTION, LEADERBOARD_SHARE_TITLE } from "../utils/seo";
import { avatarColor, getAvatarImageUrl } from "../utils/avatar";
import { getApiBaseUrl } from "../utils/api";
import { FALLBACK_WEEKLY_LEADERBOARD, type LeaderboardEntry } from "../utils/leaderboard";
import styles from "./LeaderboardView.module.css";

type Period = "weekly" | "season";

type PublicLeaderboardEntry = LeaderboardEntry;

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

const LAST_GAME_TOP3_KEY = "escapers_last_game_top3";
const LAST_GAME_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LEADERBOARD_BADGE_FALLBACK_LABEL = "Quick hands";
const LEADERBOARD_BADGE_FALLBACK_EMOJI = "⚡";

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
    badgeId: raw.badgeId ?? raw.badge_id ?? null,
    badgeLabel: raw.badgeLabel ?? raw.badge_label ?? null,
    badgeEmoji: raw.badgeEmoji ?? raw.badge_emoji ?? null,
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

const fallbackTop: PublicLeaderboardEntry[] = [...FALLBACK_WEEKLY_LEADERBOARD];

export default function LeaderboardView() {
  const navigate = useNavigate();
  const { state: engagement } = useEngagement();
  const [period, setPeriod] = useState<Period>("weekly");
  const [data, setData] = useState<PublicLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentTop, setRecentTop] = useState<PublicLeaderboardEntry[]>([]);
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sound_enabled") !== "0";
  });
  const funScoreSentRef = useRef<string>("");

  useEffect(() => {
    trackEvent("leaderboard_view", { period });
  }, [period]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LAST_GAME_TOP3_KEY);
      if (!raw) {
        setRecentTop([]);
        return;
      }
      const parsed = JSON.parse(raw) as {
        savedAt?: number;
        entries?: unknown[];
      };
      if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > LAST_GAME_MAX_AGE_MS) {
        setRecentTop([]);
        return;
      }
      const entries = Array.isArray(parsed.entries)
        ? parsed.entries.map((entry) => normalizeEntry(entry)).filter(Boolean)
        : [];
      setRecentTop(entries as PublicLeaderboardEntry[]);
    } catch {
      setRecentTop([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const apiBase = getApiBaseUrl();
    const url = new URL(`${apiBase}/leaderboard`);
    url.searchParams.set("period", period);
    url.searchParams.set("scope", engagement.group ? "group" : "global");
    if (engagement.group) {
      url.searchParams.set("crewCode", engagement.group.code);
    }
    url.searchParams.set("playerId", getOrCreateClientId());
    url.searchParams.set("limit", "200");

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

  const baseTop = data?.top?.length ? data.top : fallbackTop;
  const mergedTop = (() => {
    if (!recentTop.length) return baseTop;
    const seen = new Set<string>();
    const out: PublicLeaderboardEntry[] = [];
    for (const entry of recentTop) {
      const key = `${entry.displayName}:${entry.avatarId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    for (const entry of baseTop) {
      const key = `${entry.displayName}:${entry.avatarId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out;
  })();
  const topList = mergedTop.slice(0, 200);

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
  const equippedBadgeId = engagement.badges.equipped ?? engagement.badges.lastEarned ?? null;
  const equippedBadge = equippedBadgeId
    ? BADGE_DEFINITIONS.find((item) => item.id === equippedBadgeId) ?? null
    : null;
  const selfAvatarSrc = getAvatarImageUrl(selfEntry.avatarId ?? selfEntry.displayName);

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
      <div className={styles.pageDesktopBackground} aria-hidden="true" />
      <section className={styles.phone} aria-label="Leaderboard screen">
        <img className={styles.bgPattern} src="/figma/leaderboard/tg-bg-mobile.webp" alt="" aria-hidden="true" />
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
              <div className={styles.vibeIdentity}>
                <span
                  className={styles.vibeAvatar}
                  style={{ background: avatarColor(selfEntry.avatarId ?? selfEntry.displayName) }}
                >
                  {selfAvatarSrc ? <img src={selfAvatarSrc} alt="" /> : <span>{selfEntry.displayName.charAt(0).toUpperCase()}</span>}
                  {equippedBadge ? (
                    <span className={styles.vibeBadgeMark} title={equippedBadge.label} aria-hidden="true">
                      {equippedBadge.emoji}
                    </span>
                  ) : null}
                </span>
                <span className={styles.vibeName}>{selfEntry.displayName}</span>
              </div>
              <div className={styles.progressTrack}>
                <span className={styles.progressFill} style={{ width: `${selfRatio * 100}%` }} />
                <img
                  src="/figma/join/ellipse-5.svg"
                  alt=""
                  aria-hidden="true"
                  className={styles.progressKnob}
                  style={{ left: `calc(${selfRatio * 100}% - 11px)` }}
                />
              </div>
            </section>

            <section className={styles.shareCard}>
              <h2 className={styles.cardTitle}>Share on:</h2>
              <div className={styles.shareRow}>
                <button type="button" className={styles.shareButton} onClick={() => openShare(redditUrl, "reddit")} aria-label="Share on Reddit">
                  <span className={styles.shareRedditIcon} aria-hidden="true">
                    <img src="/figma/join/ant-design-google-circle-filled.svg" alt="" className={styles.shareRedditBg} />
                    <img src="/figma/join/ic-baseline-reddit.svg" alt="" className={styles.shareRedditGlyph} />
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={handleNativeShare}
                  aria-label="Share"
                >
                  <img src="/figma/join/frame-3.svg" alt="" className={styles.shareIconImage} />
                </button>
                <button type="button" className={styles.shareButton} onClick={() => openShare(facebookUrl, "facebook")} aria-label="Share on Facebook">
                  <img src="/figma/join/ic-baseline-facebook.svg" alt="" className={styles.shareIconImage} />
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => openShare(xUrl, "x")}
                  aria-label="Share on X"
                >
                  <span className={styles.shareXIcon} aria-hidden="true">
                    <img src="/figma/join/ellipse-2188.svg" alt="" className={styles.shareXBg} />
                    <img src="/figma/join/mingcute-apple-fill.svg" alt="" className={styles.shareXGlyph} />
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={() => copyShareLink("Twitch", `${shareTextTwitch} ${shareUrl}`)}
                  aria-label="Share on Twitch"
                >
                  <img src="/figma/join/frame-4.svg" alt="" className={styles.shareIconImage} />
                </button>
              </div>
            </section>

            <section className={styles.listCard}>
              <div className={styles.listRows}>
                {topList.map((entry, index) => {
                  const rank = index + 1;
                  const tone = rowTone(rank);
                  const avatarSrc = getAvatarImageUrl(entry.avatarId ?? entry.displayName);
                  const entryMetric = metricValue(entry);
                  const entryRatio = Math.min(1, entryMetric / maxMetric);
                  const valueLabel =
                    period === "weekly"
                      ? `${Math.max(0, Math.round(entryMetric))}%`
                      : `${Math.round(entryRatio * 100)}%`;
                  const badgeLabel = entry.badgeLabel ?? LEADERBOARD_BADGE_FALLBACK_LABEL;
                  const badgeEmoji = entry.badgeEmoji ?? LEADERBOARD_BADGE_FALLBACK_EMOJI;
                  return (
                    <article
                      key={`${entry.displayName}-${index}`}
                      className={`${styles.row} ${rank === 1 ? styles.rowTall : ""}`}
                      style={{ background: tone.rowGradient, borderColor: tone.rowBorder }}
                    >
                      <div className={styles.rowLeft}>
                        <span className={styles.rankChip}>
                          <img
                            src="/figma/join/material-symbols-rewarded-ads.svg"
                            alt=""
                            className={styles.rankIcon}
                          />
                          <span className={styles.rankNumber}>{rank}</span>
                        </span>
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
                      <span className={styles.badgePill}>
                        <span className={styles.badgePillIcon} aria-hidden="true">
                          {badgeEmoji}
                        </span>
                        <span className={styles.badgePillLabel}>{badgeLabel}</span>
                      </span>
                      <span className={styles.scoreBadge}>
                        <span className={styles.scoreBadgeValue}>{valueLabel}</span>
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <div className={styles.downBar}>
            <button
              type="button"
              className={`${styles.downButton} ${styles.downButtonCreate}`}
              onClick={() => navigate("/join?downbar=create")}
              aria-label="Create game"
            >
              <span className={`${styles.downIcon} ${styles.downIconCreate}`} aria-hidden="true" />
              <span>Create game</span>
            </button>
            <button
              type="button"
              className={`${styles.downButton} ${styles.downButtonJoin}`}
              onClick={() => navigate("/join?downbar=join")}
              aria-label="Join game"
            >
              <span className={`${styles.downIcon} ${styles.downIconJoin}`} aria-hidden="true" />
              <span>Join game</span>
            </button>
            <button
              type="button"
              className={`${styles.downButton} ${styles.downButtonSound}`}
              onClick={() =>
                setSoundOn((prev) => {
                  const next = !prev;
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("sound_enabled", next ? "1" : "0");
                  }
                  return next;
                })
              }
              aria-label={soundOn ? "Mute sound" : "Enable sound"}
            >
              <span
                className={`${styles.downIcon} ${styles.downIconSound} ${!soundOn ? styles.downIconSoundMuted : ""}`}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              className={`${styles.downButton} ${styles.downButtonLogout}`}
              onClick={() => navigate("/join", { replace: true })}
              aria-label="Logout"
            >
              <span className={`${styles.downIcon} ${styles.downIconLogout}`} aria-hidden="true" />
            </button>
          </div>
        </main>
      </section>
    </div>
  );
}
