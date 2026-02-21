import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import EngagementPanel from "../components/engagement/EngagementPanel";
import { useEngagement } from "../context/EngagementContext";
import { useRoom } from "../context/RoomContext";
import {
  AVATAR_IDS,
  avatarIconIndex,
  getAvatarImageUrl,
  getStoredAvatarId,
  setStoredAvatarId,
} from "../utils/avatar";
import { assetIds, getAssetUrl } from "../utils/assets";
import { getStoredPlayerName, setStoredPlayerName } from "../utils/playerName";
import frames from "../engagement/frames.module.css";
import styles from "./LobbyView.module.css";

type PulseVariant = "fast" | "mid" | "slow";

function resolveVariant(age?: number): PulseVariant {
  if (!age) return "mid";
  if (age <= 30) return "fast";
  if (age <= 40) return "mid";
  return "slow";
}

export default function LobbyView() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const age = params.get("age") ? Number(params.get("age")) : undefined;
  const variant = resolveVariant(age);
  const { roomCode, players, playerId, setReady, setAvatar, setName, resetRoom } = useRoom();
  const { state: engagement } = useEngagement();

  const lobbyAssets = assetIds.length ? assetIds : [];
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("sound_enabled") !== "0";
  });
  const [avatarIndex, setAvatarIndex] = useState(() => {
    const stored = getStoredAvatarId();
    if (stored) {
      const idx = AVATAR_IDS.indexOf(stored);
      if (idx >= 0) return idx;
    }
    return Math.floor(Math.random() * AVATAR_IDS.length);
  });
  const touchStart = useRef<number | null>(null);
  const [nameDraft, setNameDraft] = useState(() => getStoredPlayerName() || "Player");
  const [editingName, setEditingName] = useState(false);

  const handleAvatarCycle = (direction: number) => {
    setAvatarIndex((prev) => {
      const next = (prev + direction + AVATAR_IDS.length) % AVATAR_IDS.length;
      return next;
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    touchStart.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchStart.current === null) {
      handleAvatarCycle(1);
      return;
    }
    const delta = event.clientX - touchStart.current;
    if (Math.abs(delta) > 24) {
      handleAvatarCycle(delta > 0 ? -1 : 1);
    } else {
      handleAvatarCycle(1);
    }
    touchStart.current = null;
  };

  const selfAvatar = AVATAR_IDS[avatarIndex] ?? AVATAR_IDS[0] ?? "avatar_raccoon_dj";
  const scoreSorted = [...players].sort((a, b) => b.score - a.score);
  const selfPlayer = players.find((player) => player.id === playerId);
  const selfRank = selfPlayer ? scoreSorted.findIndex((player) => player.id === selfPlayer.id) + 1 : 0;
  const selfReady = selfPlayer?.ready ?? false;
  const selfAssetId = lobbyAssets.length
    ? lobbyAssets[avatarIconIndex(selfAvatar) % lobbyAssets.length] ?? lobbyAssets[0]
    : undefined;
  const selfAssetSrc = getAvatarImageUrl(selfAvatar) ?? getAssetUrl(selfAssetId);
  const startLabel = selfReady ? "Join game" : "Ready to play";
  const startCardTitle = selfReady ? "Waiting for other players" : "Start game";
  const badgeLabel = (selfPlayer?.name ?? "WEEEP").slice(0, 12);
  const profileTag = `#${(playerId ?? "124").replace(/[^0-9]/g, "").slice(-3) || "124"}`;
  const topPreview = scoreSorted.slice(0, 3);
  const previewQuests = engagement.quests.daily.slice(0, 3);
  const completedQuests = engagement.quests.daily.filter((quest) => quest.progress >= quest.target).length;
  const questTotal = engagement.quests.daily.length;
  const frameClass = engagement.cosmetics.equipped.frame
    ? frames[engagement.cosmetics.equipped.frame] ?? ""
    : "";

  useEffect(() => {
    setStoredAvatarId(selfAvatar);
    if (roomCode) {
      setAvatar(selfAvatar);
    }
  }, [roomCode, selfAvatar, setAvatar]);

  useEffect(() => {
    if (editingName) return;
    const resolved = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
    setNameDraft(resolved);
  }, [editingName, selfPlayer?.name]);

  const commitName = (nextName?: string) => {
    const safeName = (nextName ?? nameDraft).trim().slice(0, 18);
    if (!safeName) {
      const fallback = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
      setNameDraft(fallback);
      return;
    }
    setNameDraft(safeName);
    setStoredPlayerName(safeName);
    setName(safeName);
  };

  return (
    <div className={`${styles.wrap} ${styles[variant]}`}>
      <EngagementPanel mode="lobby" />
      <div className={styles.topBar}>
        <span className={styles.statusTime}>9:41</span>
        <span className={styles.notch} aria-hidden="true" />
        <span className={styles.statusSignal} aria-hidden="true">
          ▂▃▅
        </span>
      </div>
      <section className={`${styles.sectionCard} ${styles.startCard}`}>
        <div className={styles.startCardTitle}>{startCardTitle}</div>
        <div className={styles.startCardMeta}>
          <span className={styles.metaPill}>#{selfRank || 3}</span>
          <span className={styles.metaPill}>{badgeLabel}</span>
          <span className={styles.metaPill}>{profileTag}</span>
        </div>
      </section>

      {selfReady ? (
        <>
          <section className={`${styles.sectionCard} ${styles.profileCard}`}>
            <div
              className={styles.profileAvatar}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onClick={() => handleAvatarCycle(1)}
              aria-label={selfAvatar}
            >
              <div className={`${styles.profileAvatarCore} ${frameClass}`}>
                {selfAssetSrc ? <img src={selfAssetSrc} alt="" className={styles.avatarImage} /> : null}
              </div>
              <span className={styles.selfPulse} />
            </div>
            <button type="button" className={styles.profileButton} onClick={() => handleAvatarCycle(1)}>
              Choose avatar
            </button>
          </section>

          <section className={`${styles.sectionCard} ${styles.playerListCard}`}>
            <header className={styles.questHead}>
              <span className={styles.questTitle}>Player list</span>
              <span className={styles.questBadge}>{players.length}</span>
            </header>
            <div className={styles.playerListGrid}>
              {players.map((player) => {
                const playerAssetId = lobbyAssets.length
                  ? lobbyAssets[avatarIconIndex(player.avatarId) % lobbyAssets.length]
                  : undefined;
                const playerAssetSrc = getAvatarImageUrl(player.avatarId) ?? getAssetUrl(playerAssetId);
                return (
                  <div key={player.id} className={`${styles.player} ${styles.playerPulse}`}>
                    <div className={styles.playerAvatar} aria-label={player.avatarId}>
                      {playerAssetSrc ? (
                        <img src={playerAssetSrc} alt="" className={styles.avatarImage} />
                      ) : null}
                    </div>
                    <span className={styles.playerName}>{player.name ?? "Player"}</span>
                    {player.ready && <span className={styles.readyRing} />}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <>
          <section className={`${styles.sectionCard} ${styles.questCard}`}>
            <header className={styles.questHead}>
              <span className={styles.questTitle}>Quests for the game</span>
              <span className={styles.questBadge}>
                {completedQuests}/{questTotal || 5}
              </span>
            </header>
            <ul className={styles.questList}>
              {previewQuests.length
                ? previewQuests.map((quest) => {
                    const done = quest.progress >= quest.target;
                    return (
                      <li key={quest.id} className={styles.questItem}>
                        <span className={styles.questProgress}>
                          {quest.progress}/{quest.target}
                        </span>
                        <span className={styles.questLabel}>{quest.label}</span>
                        <span className={styles.questAction}>{done ? "Claim" : "In progress"}</span>
                      </li>
                    );
                  })
                : (
                  <li className={styles.questItem}>
                    <span className={styles.questProgress}>0/5</span>
                    <span className={styles.questLabel}>Inviting 5 friends</span>
                    <span className={styles.questAction}>Claim</span>
                  </li>
                )}
            </ul>
          </section>

          <section className={`${styles.sectionCard} ${styles.profileCard}`}>
            <div
              className={styles.profileAvatar}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onClick={() => handleAvatarCycle(1)}
              aria-label={selfAvatar}
            >
              <div className={`${styles.profileAvatarCore} ${frameClass}`}>
                {selfAssetSrc ? <img src={selfAssetSrc} alt="" className={styles.avatarImage} /> : null}
              </div>
              <span className={styles.selfPulse} />
            </div>
            <button type="button" className={styles.profileButton} onClick={() => handleAvatarCycle(1)}>
              Choose avatar
            </button>
            <input
              type="text"
              value={nameDraft}
              onFocus={() => setEditingName(true)}
              onBlur={() => {
                setEditingName(false);
                commitName();
              }}
              onChange={(event) => setNameDraft(event.target.value.slice(0, 18))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  const fallback = selfPlayer?.name ?? getStoredPlayerName() ?? "Player";
                  setEditingName(false);
                  setNameDraft(fallback);
                  event.currentTarget.blur();
                }
              }}
              className={styles.selfNameInput}
              placeholder="Your name"
              aria-label="player name"
            />
          </section>

          <section className={`${styles.sectionCard} ${styles.topCard}`}>
            <header className={styles.topCardHead}>
              <span className={styles.topCardTitle}>Top 3 Leaderboard</span>
            </header>
            <ul className={styles.topList}>
              {(topPreview.length
                ? topPreview
                : [
                    { id: "fallback-1", name: "Ярик", score: 2445 },
                    { id: "fallback-2", name: "Павел Невский", score: 2445 },
                    { id: "fallback-3", name: "Иван Иванович", score: 2445 },
                  ]
              ).map((player, index) => (
                <li key={player.id} className={styles.topItem}>
                  <span className={styles.topRank}>#{index + 1}</span>
                  <span className={styles.topName}>{player.name ?? "Player"}</span>
                  <span className={styles.topScore}>{player.score}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className={styles.legalFooter}>
        <a href="/legal/privacy">Privacy</a>
        <span className={styles.legalDot}>•</span>
        <a href="/legal/terms">Terms</a>
        <span className={styles.legalDot}>•</span>
        <a href="/legal/data-deletion">Data</a>
      </div>

      <footer className={styles.downBar}>
        <div className={styles.bottomBar}>
          <button
            type="button"
            className={styles.primaryJoin}
            onClick={() => {
              setReady(!selfReady);
            }}
            aria-label="join game"
          >
            <span className={styles.actionIconJoin} aria-hidden="true" />
            <span>{startLabel}</span>
          </button>
          <button
            className={`${styles.iconActionSound} ${soundOn ? styles.soundOn : styles.soundOff}`}
            onClick={() =>
              setSoundOn((prev) => {
                const next = !prev;
                if (typeof window !== "undefined") {
                  window.localStorage.setItem("sound_enabled", next ? "1" : "0");
                }
                return next;
              })
            }
            aria-label="sound"
          />
          <button
            className={styles.iconActionHelp}
            onClick={() => navigate("/leaderboard")}
            aria-label="help"
          />
          <button
            className={styles.iconActionLogout}
            onClick={() => {
              resetRoom();
              navigate("/join", { replace: true });
            }}
            aria-label="logout"
          />
        </div>
        <div className={styles.tabBar}>
          <div className={styles.urlRow}>
            <span className={styles.lock} aria-hidden="true">
              🔒
            </span>
            <span className={styles.url}>escapers.app</span>
          </div>
          <span className={styles.homeIndicator} aria-hidden="true" />
        </div>
      </footer>

    </div>
  );
}
