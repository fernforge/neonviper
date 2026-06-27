// Power-up + special food definitions and effect application.
export const POWERUPS = {
  speed:      { icon: '⚡', color: '#ffe600', name: 'HASTE',     dur: 6,  desc: 'Move faster' },
  timewarp:   { icon: '🕒', color: '#7af',    name: 'TIME WARP', dur: 6,  desc: 'Slow everything' },
  ghost:      { icon: '👻', color: '#cfe',    name: 'GHOST',     dur: 7,  desc: 'Phase through walls & self' },
  magnet:     { icon: '🧲', color: '#f86',    name: 'MAGNET',    dur: 8,  desc: 'Food drifts toward you' },
  multiplier: { icon: '✖️', color: '#ff2bd1', name: 'DOUBLE',    dur: 10, desc: 'Double score' },
  shrink:     { icon: '🪶', color: '#9f9',    name: 'SHRINK',    dur: 0,  desc: 'Lose length, gain agility' },
  grow:       { icon: '🍔', color: '#fb6',    name: 'GROW',      dur: 0,  desc: 'Instant length' },
  clearObstacles: { icon: '💥', color: '#f55', name: 'BOOM',     dur: 0,  desc: 'Clear obstacles' },
};

// food types that may spawn on the board
export const FOOD_TYPES = {
  normal: { icon: '🍎', color: '#ff5470', score: 10, weight: 70 },
  golden: { icon: '⭐', color: '#ffe600', score: 50, weight: 8, particles: 'ring' },
  power:  { icon: '🎁', color: '#00ffd5', score: 15, weight: 14, grantsPower: true },
  cursed: { icon: '☠️', color: '#a06bff', score: 30, weight: 8, cursed: true }, // big points, but speeds you up / risk
};

export const POWER_KEYS = ['speed', 'timewarp', 'ghost', 'magnet', 'multiplier'];
