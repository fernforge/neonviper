// localStorage-backed settings + high scores
const KEY_SETTINGS = 'neonviper.settings';
const KEY_SCORES = 'neonviper.scores';

const defaults = {
  sound: true,
  music: true,
  screenShake: true,
  crt: true,
  aiCommentary: true,
  gridSize: 'medium', // small|medium|large
};

export function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY_SETTINGS) || '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(s) {
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
}

export function loadScores() {
  try { return JSON.parse(localStorage.getItem(KEY_SCORES) || '[]'); }
  catch { return []; }
}
export function bestScore(mode) {
  const all = loadScores();
  const m = all.filter((s) => !mode || s.mode === mode);
  return m.reduce((mx, s) => Math.max(mx, s.score), 0);
}
export function addScore(entry) {
  const all = loadScores();
  all.push(entry);
  all.sort((a, b) => b.score - a.score);
  const trimmed = all.slice(0, 20);
  localStorage.setItem(KEY_SCORES, JSON.stringify(trimmed));
  // rank among same mode
  const rank = all.filter((s) => s.mode === entry.mode).findIndex((s) => s === entry) + 1;
  return { isBest: all[0] === entry, rank };
}
