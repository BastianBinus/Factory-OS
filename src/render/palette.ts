import { Color } from 'three';
import type { ResourceId } from '../game/types';

/**
 * The 3D scene has no colour table of its own. It reads the same `--w-*` custom
 * properties the interface uses, so switching the theme recolours the factory
 * and nothing can drift out of sync with tokens.css.
 */

const TOKENS = {
  floor: '--w-floor',
  floorAlt: '--w-floor-alt',
  grid: '--w-grid',
  metal: '--w-metal',
  metalDark: '--w-metal-dark',
  robot: '--w-robot',
  oreIron: '--w-ore-iron',
  oreCopper: '--w-ore-copper',
  ingotIron: '--w-ingot-iron',
  ingotCopper: '--w-ingot-copper',
  gear: '--w-gear',
  groundPrepared: '--w-ground-prepared',
  seedCrystal: '--w-seed-crystal',
  heat: '--w-heat',
  sky: '--w-sky',
  accent: '--accent',
} as const;

export type PaletteKey = keyof typeof TOKENS;

export interface WorldPalette extends Record<PaletteKey, Color> {
  /** Shadow strength, 0…1. Dark themes carry a much heavier shadow. */
  shadow: number;
}

/** Visible fallback rather than black, so a typo in a token name is obvious. */
const FALLBACK = '#ff00ff';

function readToken(styles: CSSStyleDeclaration, token: string): Color {
  const raw = styles.getPropertyValue(token).trim();
  return new Color(raw === '' ? FALLBACK : raw);
}

export function readPalette(): WorldPalette {
  const styles = getComputedStyle(document.documentElement);
  const palette = { shadow: 0.22 } as WorldPalette;

  for (const [key, token] of Object.entries(TOKENS) as [PaletteKey, string][]) {
    palette[key] = readToken(styles, token);
  }

  const shadow = Number.parseFloat(styles.getPropertyValue('--w-shadow'));
  palette.shadow = Number.isFinite(shadow) ? shadow : 0.22;

  return palette;
}

const RESOURCE_KEYS: Record<ResourceId, PaletteKey> = {
  iron_ore: 'oreIron',
  copper_ore: 'oreCopper',
  iron_ingot: 'ingotIron',
  copper_ingot: 'ingotCopper',
  gear: 'gear',
  seed_crystal: 'seedCrystal',
  // No token of their own yet — a refined ingot reads as bright metal, a
  // component as a gear, until the art catches up.
  refined_ingot: 'metal',
  component: 'gear',
};

export function colorFor(palette: WorldPalette, resource: ResourceId): Color {
  return palette[RESOURCE_KEYS[resource]];
}
