// Game mode definitions. Each tweaks the engine's rules.
export const MODES = {
  classic: {
    id: 'classic', name: 'CLASSIC', icon: '🐍',
    desc: 'Pure neon snake with power-ups, combos & an AI hype-master.',
    wrap: false, obstacles: 0, enemies: 0, risingWalls: false, baseSpeed: 7, powerups: true,
  },
  maze: {
    id: 'maze', name: 'MAZE', icon: '🧱',
    desc: 'Procedurally generated obstacle fields. Thread the needle.',
    wrap: false, obstacles: 32, enemies: 0, risingWalls: false, baseSpeed: 7, powerups: true,
  },
  portal: {
    id: 'portal', name: 'PORTAL', icon: '🌀',
    desc: 'Wrap-around walls plus teleport gates that fling you across the arena.',
    wrap: true, obstacles: 0, enemies: 0, risingWalls: false, baseSpeed: 8, powerups: true, portals: 2,
  },
  rival: {
    id: 'rival', name: 'RIVAL', icon: '🤖',
    desc: 'AI-controlled rival vipers hunt the same food. Outsmart them.',
    wrap: false, obstacles: 8, enemies: 2, risingWalls: false, baseSpeed: 7, powerups: true,
  },
  survival: {
    id: 'survival', name: 'SURVIVAL', icon: '🔥',
    desc: 'Walls close in over time. How long can you last?',
    wrap: false, obstacles: 0, enemies: 0, risingWalls: true, baseSpeed: 8, powerups: true,
  },
  zen: {
    id: 'zen', name: 'ZEN', icon: '🧘',
    desc: 'No walls, no death from edges. Just vibes and high scores.',
    wrap: true, obstacles: 0, enemies: 0, risingWalls: false, baseSpeed: 6, powerups: true, noSelfFatal: false,
  },
};
export const MODE_LIST = Object.values(MODES);
