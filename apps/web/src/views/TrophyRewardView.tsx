import PromptImage from "../components/PromptImage";
import styles from "./roundViews.module.css";

export interface TrophyRewardViewProps {
  trophySrc: string;
}

export default function TrophyRewardView({ trophySrc }: TrophyRewardViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.trophyZone}>
        <PromptImage src={trophySrc} fit="contain" ariaLabel="trophy" />
      </div>
    </div>
  );
}
