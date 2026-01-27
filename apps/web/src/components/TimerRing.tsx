import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./TimerRing.module.css";

export interface TimerRingProps {
  durationMs: number;
  startAt: number;
  size?: number;
  strokeWidth?: number;
  onComplete?: () => void;
}

export default function TimerRing({
  durationMs,
  startAt,
  size = 96,
  strokeWidth = 8,
  onComplete,
}: TimerRingProps) {
  const [progress, setProgress] = useState(1);
  const frameRef = useRef<number | null>(null);

  const radius = useMemo(() => (size - strokeWidth) / 2, [size, strokeWidth]);
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);

  const stopTimer = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
  }, []);

  const renderProgress = useCallback(
    (value: number) => circumference * (1 - value),
    [circumference],
  );

  const startTimer = useCallback(() => {
    stopTimer();
    const tick = () => {
      const elapsed = Date.now() - startAt;
      const ratio = Math.max(0, 1 - elapsed / durationMs);
      setProgress(ratio);
      if (ratio <= 0) {
        stopTimer();
        onComplete?.();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [durationMs, onComplete, startAt, stopTimer]);

  useEffect(() => {
    startTimer();
    return () => stopTimer();
  }, [startTimer, stopTimer]);

  return (
    <svg
      className={`ring ${styles.ring} ${
        progress > 0 ? `ringActive ${styles.ringActive}` : `ringDone ${styles.ringDone}`
      }`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.8)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={renderProgress(progress)}
        strokeLinecap="round"
      />
    </svg>
  );
}
