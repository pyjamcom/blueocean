import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import styles from "./ShareCard.module.css";

export interface ShareCardPodiumItem {
  avatarId: string;
  rank: number;
}

export interface ShareCardProps {
  podiumTop3: ShareCardPodiumItem[];
  winner: { avatarId: string };
  stampId: string;
  medalSetId: string;
  qrUrl: string;
}

export interface ShareCardHandle {
  toCanvas: () => HTMLCanvasElement | null;
  toPng: () => Promise<string | null>;
  share: () => Promise<void>;
}

function hashHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

const ShareCard = forwardRef<ShareCardHandle, ShareCardProps>(function ShareCard(
  { podiumTop3, winner, stampId, medalSetId, qrUrl },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  const palette = useMemo(
    () => [
      `hsl(${hashHue(stampId)} 70% 55%)`,
      `hsl(${hashHue(medalSetId)} 70% 60%)`,
    ],
    [medalSetId, stampId],
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrUrl, {
      width: 160,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    }).then((url) => {
      if (active) {
        setQrSrc(url);
      }
    });
    return () => {
      active = false;
    };
  }, [qrUrl]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 720;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = async () => {
      const qrImg = qrSrc ? await loadImage(qrSrc) : null;
      if (cancelled) return;
      ctx.clearRect(0, 0, size, size);
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, "#14141c");
      gradient.addColorStop(1, "#0b0b10");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = palette[0];
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(size * 0.18, size * 0.2, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const podiumY = size * 0.7;
      const barW = size * 0.18;
      const heights = [size * 0.3, size * 0.24, size * 0.2];
      const xs = [size * 0.2, size * 0.41, size * 0.62];
      const podiumColors = ["#ffd166", "#e9ecef", "#f4a261"];

      heights.forEach((h, idx) => {
        ctx.fillStyle = podiumColors[idx];
        ctx.beginPath();
        ctx.roundRect(xs[idx], podiumY - h, barW, h, 18);
        ctx.fill();
      });

      podiumTop3.slice(0, 3).forEach((item, idx) => {
        const hue = hashHue(item.avatarId);
        const cx = xs[idx] + barW / 2;
        const cy = podiumY - heights[idx] - 40;
        ctx.fillStyle = `hsl(${hue} 70% 60%)`;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 4;
        ctx.stroke();
      });

      const winHue = hashHue(winner.avatarId);
      ctx.strokeStyle = `hsl(${winHue} 80% 70%)`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.2, 46, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = palette[1];
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(size * 0.82, size * 0.22, 44, 0, Math.PI * 2);
      ctx.stroke();

      if (qrImg) {
        const qrSize = 160;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(size - qrSize - 40, size - qrSize - 40, qrSize, qrSize);
        ctx.drawImage(qrImg, size - qrSize - 40, size - qrSize - 40, qrSize, qrSize);
      }
    };

    draw();
    return () => {
      cancelled = true;
    };
  }, [palette, podiumTop3, qrSrc, winner.avatarId]);

  useImperativeHandle(
    ref,
    () => ({
      toCanvas: () => canvasRef.current,
      toPng: async () => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        return canvas.toDataURL("image/png");
      },
      share: async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], "escapers-win.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
        }
      },
    }),
    [],
  );

  return (
    <div className={`shareCard ${styles.card}`}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div className={`shareCard__podium ${styles.podium}`} aria-hidden>
        {podiumTop3.slice(0, 3).map((item) => (
          <div key={item.avatarId} className={styles.podiumAvatar} />
        ))}
      </div>
      <div className={`shareCard__stamp ${styles.stamp}`} aria-hidden />
      <div className={`shareCard__medals ${styles.medals}`} aria-hidden />
      <div className={`shareCard__qr ${styles.qr}`} aria-hidden>
        {qrSrc ? <img src={qrSrc} alt="" /> : null}
      </div>
    </div>
  );
});

export default ShareCard;
