import { useEffect, useRef, useState } from "react";
import styles from "./ResultView.module.css";

const podiumColors = ["#ffd166", "#ff6b6b", "#4dabf7"];

function drawPodium(ctx: CanvasRenderingContext2D, size: number) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0b0b10";
  ctx.fillRect(0, 0, size, size);

  const baseY = size * 0.72;
  const widths = [size * 0.22, size * 0.22, size * 0.22];
  const heights = [size * 0.32, size * 0.26, size * 0.22];
  const positions = [size * 0.2, size * 0.39, size * 0.58];

  positions.forEach((x, index) => {
    ctx.fillStyle = podiumColors[index];
    ctx.beginPath();
    ctx.roundRect(x, baseY - heights[index], widths[index], heights[index], 18);
    ctx.fill();
  });

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(size * 0.18, size * 0.22, size * 0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size * 0.82, size * 0.18, size * 0.12, 0, Math.PI * 2);
  ctx.stroke();
}

export default function ResultView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 720;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawPodium(ctx, size);
    setImageUrl(canvas.toDataURL("image/png"));
  }, []);

  const handleShare = async () => {
    if (!imageUrl) return;
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    const file = new File([blob], "escapers-win.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  };

  const handleSave = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = "escapers-win.png";
    link.click();
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <canvas ref={canvasRef} className={styles.canvas} />
      </div>
      <div className={styles.actions}>
        <button className={styles.actionButton} onClick={handleShare} aria-label="share">
          <span className={styles.iconShare} />
        </button>
        <button className={styles.actionButton} onClick={handleSave} aria-label="save">
          <span className={styles.iconSave} />
        </button>
      </div>
    </div>
  );
}
