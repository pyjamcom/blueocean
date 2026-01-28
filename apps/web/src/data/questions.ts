import rawQuestions from "../../../../data/questions.json";

export type QuestionCategory =
  | "visual_provocation"
  | "telepath_sync"
  | "drunk_reflex"
  | "absurd_sum"
  | "face_mimic"
  | "icon_battle"
  | "sound_pantomime"
  | "absurd_toast"
  | "silhouette_guess"
  | "trophy_rewards";

export interface QuestionAnswer {
  id: string;
  asset_id?: string;
  image_url?: string;
  tags: string[];
}

export interface QuestionRecord {
  id: string;
  category: QuestionCategory;
  prompt_image: string;
  answers: QuestionAnswer[];
  correct_index: number;
  humor_tag?: string;
  duration_ms: number;
  season?: string;
  audio_asset_id?: string;
  face_overlay_ids?: string[];
  prompt_pair_ids?: string[];
  battle_pair_ids?: string[];
  silhouette_base_id?: string;
  trigger_asset_id?: string;
  trophy_stamp_id?: string;
}

export const questionBank = (rawQuestions as { questions: QuestionRecord[] }).questions ?? [];
