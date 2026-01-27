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
}
