// Runtime optimisation toggles. All on = optimised build; all off = behaves like v0 naive.
// Flip them live from the "Optimisations" panel, or via URL: ?naive=1 (all off) or ?off=grid,sprites
export const flags = {
  useGrid: true, // spatial grid for targeting / collision / splash / frost (else scan every enemy)
  usePool: true, // reuse objects + swap-remove + particle cap (else new + splice)
  useTargetCache: true, // towers keep their target and only search when ready to fire (else search every tick)
  useSprites: true, // pre-rendered sprites batched by type (else per-entity paths, shadowBlur, text)
  useBgCache: true, // static map on its own canvas + throttled HUD (else redraw map + innerHTML every frame)
  useCulling: true, // skip entities outside the camera view (else draw everything)
};

export type FlagKey = keyof typeof flags;

export const FLAG_LABELS: Record<FlagKey, string> = {
  useGrid: 'Spatial grid',
  usePool: 'Object pools',
  useTargetCache: 'Target caching',
  useSprites: 'Sprite batching',
  useBgCache: 'Bg cache + HUD throttle',
  useCulling: 'Viewport culling',
};

export const FLAG_SHORT: Record<FlagKey, string> = {
  useGrid: 'G',
  usePool: 'P',
  useTargetCache: 'T',
  useSprites: 'S',
  useBgCache: 'B',
  useCulling: 'C',
};

const ALIASES: Record<string, FlagKey> = {
  grid: 'useGrid',
  pool: 'usePool',
  target: 'useTargetCache',
  sprites: 'useSprites',
  bg: 'useBgCache',
  culling: 'useCulling',
};

export function flagsFromUrl(params: URLSearchParams) {
  if (params.get('naive') === '1') for (const k of Object.keys(flags) as FlagKey[]) flags[k] = false;
  for (const name of (params.get('off') || '').split(',')) if (ALIASES[name]) flags[ALIASES[name]] = false;
}

export function flagSummary() {
  return (Object.keys(flags) as FlagKey[]).map((k) => (flags[k] ? FLAG_SHORT[k] : '·')).join('');
}
