import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./TimerRing.module.css";

export interface TimerRingProps {
  durationMs: number;
  startAt: number;
  size?: number;
  strokeWidth?: number;
  onComplete?: () => void;
  state?: "running" | "done";
}

export default function TimerRing({
  durationMs,
  startAt,
  size = 96,
  strokeWidth = 8,
  onComplete,
  state = "running",
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
    if (state !== "running") {
      setProgress(0);
      return;
    }
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
  }, [durationMs, onComplete, startAt, state, stopTimer]);

  useEffect(() => {
    startTimer();
    return () => stopTimer();
  }, [startTimer, stopTimer]);

  const ringState = state === "done" || progress <= 0 ? "done" : "running";

  return (
    <svg
      className={`timerRing ${styles.timerRing} ${
        ringState === "running"
          ? `timerRing--running ${styles.timerRingRunning}`
          : `timerRing--done ${styles.timerRingDone}`
      }`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        className={`timerRing__track ${styles.track}`}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        className={`timerRing__progress ${styles.progress}`}
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
