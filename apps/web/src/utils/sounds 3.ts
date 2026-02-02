const SOUND_ENABLED_KEY = "sound_enabled";

const audioCache = new Map<string, HTMLAudioElement>();
const pendingLoops = new Set<string>();
let unlockListenerBound = false;

function isSoundEnabled() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_ENABLED_KEY) !== "0";
}

function getAudio(src: string) {
  let audio = audioCache.get(src);
  if (!audio) {
    audio = new Audio(src);
    audio.preload = "auto";
    audioCache.set(src, audio);
  }
  return audio;
}

function bindUnlockListener() {
  if (unlockListenerBound || typeof window === "undefined") return;
  unlockListenerBound = true;
  const unlock = () => {
    pendingLoops.forEach((src) => {
      const audio = getAudio(src);
      audio.loop = true;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => undefined);
      }
    });
    pendingLoops.clear();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("touchstart", unlock);
    unlockListenerBound = false;
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });
}

export function playLoop(
  src: string,
  { volume = 0.2, interrupt = false }: { volume?: number; interrupt?: boolean } = {},
) {
  if (!isSoundEnabled()) return;
  const audio = getAudio(src);
  audio.loop = true;
  audio.volume = volume;
  if (interrupt) {
    audio.currentTime = 0;
  }
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => {
      pendingLoops.add(src);
      bindUnlockListener();
    });
  }
}

export function stopLoop(src: string) {
  const audio = audioCache.get(src);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export function playOneShot(src: string, volume = 0.2) {
  if (!isSoundEnabled()) return;
  const audio = new Audio(src);
  audio.volume = volume;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => undefined);
  }
}

export const SFX = {
  ANSWERS_MUSIC: "/sounds/answersMusic.mp3",
  ANSWERS_POP: "/sounds/answersSound.mp3",
  RESULTS: "/sounds/results.mp3",
  SHOW: "/sounds/show.mp3",
  BOUMP: "/sounds/boump.mp3",
  PODIUM_THREE: "/sounds/three.mp3",
  PODIUM_SECOND: "/sounds/second.mp3",
  PODIUM_FIRST: "/sounds/first.mp3",
  PODIUM_ROLL: "/sounds/snearRoll.mp3",
};
