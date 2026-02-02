import { QuestionRecord } from "../data/questions";

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number) {
  const rng = mulberry32(seed);
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = temp!;
  }
  return arr;
}

export function buildQuestionOrder(roomCode: string | null, length: number) {
  const indices = Array.from({ length }, (_, index) => index);
  if (!roomCode || length < 2) {
    return indices;
  }
  return seededShuffle(indices, hashSeed(`${roomCode}:order`));
}

export function mapStageToQuestionIndex(
  roomCode: string | null,
  stageIndex: number,
  total: number,
) {
  if (total <= 0) return stageIndex;
  const order = buildQuestionOrder(roomCode, total);
  return order[stageIndex] ?? stageIndex;
}

export function shuffleQuestionAnswers(
  question: QuestionRecord,
  roomCode: string | null,
  stageIndex: number,
) {
  if (!roomCode || !question || question.answers.length < 2) {
    return question;
  }
  const seed = hashSeed(`${roomCode}:q:${stageIndex}:${question.id}`);
  const tagged = question.answers.map((answer, index) => ({ answer, index }));
  const shuffled = seededShuffle(tagged, seed);
  const correctIndex = shuffled.findIndex((item) => item.index === question.correct_index);
  return {
    ...question,
    answers: shuffled.map((item) => item.answer),
    correct_index: correctIndex >= 0 ? correctIndex : question.correct_index,
  };
}
