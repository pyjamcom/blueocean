import styles from "./AnswerDistribution.module.css";

export interface AnswerDistributionProps {
  counts: [number, number, number, number];
  colors?: [string, string, string, string];
}

const defaultColors: [string, string, string, string] = [
  "#ff6b6b",
  "#ffd166",
  "#4dabf7",
  "#63e6be",
];

export default function AnswerDistribution({ counts, colors = defaultColors }: AnswerDistributionProps) {
  const max = Math.max(1, ...counts);

  return (
    <div className={styles.wrap}>
      {counts.map((value, index) => {
        const ratio = value / max;
        return (
          <div
            key={`bar-${index}`}
            className={styles.bar}
            style={{
              backgroundColor: colors[index],
              transform: `scaleY(${0.2 + ratio * 0.8})`,
            }}
            aria-label={`bar-${index}`}
          />
        );
      })}
    </div>
  );
}
