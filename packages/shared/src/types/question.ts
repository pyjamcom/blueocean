import { Answer } from "./answer";
import { HumorTag, QuestionCategory, SeasonTag } from "./enums";

export interface Question {
  id: string;
  category: QuestionCategory;
  prompt_image: string;
  answers: [Answer, Answer, Answer, Answer];
  correct_index: number;
  humor_tag: HumorTag;
  duration_ms: number;
  season?: SeasonTag;
  audio_hint?: string;
  audio_asset_id?: string;
  face_overlay_ids?: string[];
  prompt_pair_ids?: string[];
  battle_pair_ids?: string[];
  silhouette_base_id?: string;
  trigger_asset_id?: string;
  trophy_stamp_id?: string;
}
