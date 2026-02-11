import { useEffect, useRef, useState } from "react";
import RahootPodium from "../components/RahootPodium";
import { trackEvent } from "../utils/analytics";
import { LEADERBOARD_SHARE_TITLE } from "../utils/seo";
import styles from "./ResultView.module.css";

const mockTop = [
  { id: "p1", name: "Nova", points: 1240, avatarId: "1001", title: "Score Boss" },
  { id: "p2", name: "Atlas", points: 980, avatarId: "1004", title: "Sharp Eye" },
  { id: "p3", name: "Pixel", points: 860, avatarId: "1007" },
];

export default function DebugPodiumView() {
  const [shareHint, setShareHint] = useState<string | null>(null);
  const shareTimeoutRef = useRef<number | null>(null);
  const shareUrl = "https://escapers.app/leaderboard";
  const shareTitle = LEADERBOARD_SHARE_TITLE;
  const shareText = "I just hit the podium in Escapers 🏆 Meme quiz chaos awaits.";
  const shareTextX = "I just hit the podium in Escapers 🏆 Meme quiz chaos →";
  const shareTextReddit = "I just hit the podium in Escapers 🏆 Meme quiz chaos — come play:";
  const shareTextInstagram = "I just hit the podium in Escapers 🏆 Meme quiz chaos. Join us:";
  const shareTextTwitch = "Podium secured in Escapers 🏆 Meme quiz chaos. Hop in:";

  useEffect(() => {
    trackEvent("podium_debug_view");
  }, []);

  const setHint = (message: string) => {
    setShareHint(message);
    if (shareTimeoutRef.current) {
      window.clearTimeout(shareTimeoutRef.current);
    }
    shareTimeoutRef.current = window.setTimeout(() => {
      setShareHint(null);
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

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
      setHint(`${label} link copied — paste it anywhere.`);
    } catch (error) {
      setHint("Copy failed — try again.");
    }
  };

  const openShare = (url: string, channel: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    trackEvent("podium_share", { channel, debug: true });
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        trackEvent("podium_share", { channel: "native", debug: true });
        return;
      } catch {
        // fall back to copy if user cancels or share fails
      }
    }
    await copyShareLink("Share");
    trackEvent("podium_share", { channel: "copy", debug: true });
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
      <div className={styles.phaseHeader}>
        <span className={styles.phasePill}>Final</span>
        <span className={styles.phaseHint}>Debug podium preview</span>
      </div>
      <RahootPodium title="Final" top={mockTop} />
      <section className={styles.shareStrip}>
        <button type="button" className={styles.sharePrimary} onClick={handleNativeShare}>
          <span className={styles.shareIcon}>📲</span>
          Share
        </button>
        <div className={styles.shareRow}>
          <button
            type="button"
            className={`${styles.shareButton} ${styles.shareFacebook}`}
            onClick={() => openShare(facebookUrl, "facebook")}
          >
            <span className={styles.shareIcon}>f</span>
            Facebook
          </button>
          <button
            type="button"
            className={`${styles.shareButton} ${styles.shareInstagram}`}
            onClick={() => copyShareLink("Instagram", `${shareTextInstagram} ${shareUrl}`)}
          >
            <span className={styles.shareIcon}>IG</span>
            Instagram
          </button>
          <button
            type="button"
            className={`${styles.shareButton} ${styles.shareTwitch}`}
            onClick={() => copyShareLink("Twitch", `${shareTextTwitch} ${shareUrl}`)}
          >
            <span className={styles.shareIcon}>TW</span>
            Twitch
          </button>
          <button
            type="button"
            className={`${styles.shareButton} ${styles.shareReddit}`}
            onClick={() => openShare(redditUrl, "reddit")}
          >
            <span className={styles.shareIcon}>👽</span>
            Reddit
          </button>
          <button
            type="button"
            className={`${styles.shareButton} ${styles.shareX}`}
            onClick={() => openShare(xUrl, "x")}
          >
            <span className={styles.shareIcon}>X</span>
            X
          </button>
        </div>
        {shareHint ? <div className={styles.shareHint}>{shareHint}</div> : null}
      </section>
    </div>
  );
}
