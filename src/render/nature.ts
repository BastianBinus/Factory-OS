import {
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Group,
  OctahedronGeometry,
  PlaneGeometry,
} from 'three';
import { chamferedBox } from './meshFactory';

/**
 * The living world's natural objects — trees, rocks, grass, water.
 *
 * Same rule as the factory: built from code, no models, no textures. The look is
 * deliberately stylised low-poly — low segment counts and flat shading, so every
 * facet catches the light and a handful of primitives reads as a charming toy
 * diorama rather than an untextured placeholder. Colour and silhouette do the
 * work; a per-object seed adds just enough variation that a forest is never a row
 * of identical clones, but it is deterministic, never random-ugly.
 */

// A curated, saturated-but-harmonious palette. Kept here, not in the theme
// tokens, because the natural world has its own colour language.
export const NATURE = {
  grass: 0x74a84a,
  grassBlade: 0x5f9438,
  soil: 0x7a5433,
  trunk: 0x6f4a2f,
  pine: 0x3c7a44,
  pineDeep: 0x336b3b,
  leaf: 0x74b455,
  leafDeep: 0x5e9a43,
  bush: 0x4e8f43,
  rock: 0x8c8b82,
  rockDeep: 0x74736b,
  sand: 0xd9b46a,
  water: 0x3f88b0,
} as const;

const FLOWERS = [0xe26d6d, 0xe6c452, 0xb06ab3, 0xf2f2f2] as const;

function matte(color: number, flat = true): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: flat });
}

/** A tiny deterministic jitter in [-1, 1] from an integer seed and a channel. */
function wobble(seed: number, channel: number): number {
  const n = Math.sin(seed * 12.9898 + channel * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function solid(mesh: Mesh): Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Ground ---------------------------------------------------------------------

/** One biome floor tile: a low chamfered slab the objects sit on. */
export function createGroundTile(color: number): Mesh {
  const tile = solid(new Mesh(chamferedBox(0.99, 0.14, 0.99, 0.05, 0.02), matte(color, false)));
  tile.receiveShadow = true;
  tile.castShadow = false;
  return tile;
}

/** A shallow, faintly translucent water surface, sunk just below the land. */
export function createWaterTile(): Mesh {
  const geometry = new PlaneGeometry(0.99, 0.99);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshStandardMaterial({
    color: NATURE.water,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
  });
  const tile = new Mesh(geometry, material);
  tile.position.y = 0.06;
  tile.receiveShadow = true;
  return tile;
}

// Trees ----------------------------------------------------------------------

/** A conifer: a stack of cones narrowing upward, on a short trunk. */
export function createPine(seed = 1): Group {
  const group = new Group();
  const scale = 0.85 + wobble(seed, 1) * 0.18;

  const trunk = solid(new Mesh(new CylinderGeometry(0.06, 0.08, 0.28, 6), matte(NATURE.trunk)));
  trunk.position.y = 0.14;
  group.add(trunk);

  const tiers = 3;
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const radius = 0.34 - t * 0.12;
    const cone = solid(new Mesh(new ConeGeometry(radius, 0.36, 7), matte(i === 0 ? NATURE.pineDeep : NATURE.pine)));
    cone.position.y = 0.32 + i * 0.26;
    group.add(cone);
  }

  group.scale.setScalar(scale);
  group.rotation.y = wobble(seed, 2) * Math.PI;
  return group;
}

/** A broadleaf: a trunk under two or three overlapping leafy blobs. */
export function createBroadleaf(seed = 1): Group {
  const group = new Group();
  const scale = 0.85 + wobble(seed, 3) * 0.2;

  const trunk = solid(new Mesh(new CylinderGeometry(0.07, 0.09, 0.4, 6), matte(NATURE.trunk)));
  trunk.position.y = 0.2;
  group.add(trunk);

  const blobs = 3;
  for (let i = 0; i < blobs; i += 1) {
    const blob = solid(new Mesh(new IcosahedronGeometry(0.24, 0), matte(i % 2 ? NATURE.leafDeep : NATURE.leaf)));
    blob.position.set(wobble(seed + i, 4) * 0.16, 0.52 + i * 0.12, wobble(seed + i, 5) * 0.16);
    blob.scale.setScalar(0.9 + wobble(seed + i, 6) * 0.2);
    group.add(blob);
  }

  group.scale.setScalar(scale);
  group.rotation.y = wobble(seed, 7) * Math.PI;
  return group;
}

// Small props ----------------------------------------------------------------

/** A weathered boulder: one low-poly lump, squashed a little off-round. */
export function createRock(seed = 1): Mesh {
  const rock = solid(new Mesh(new IcosahedronGeometry(0.28, 0), matte(seed % 2 ? NATURE.rockDeep : NATURE.rock)));
  rock.scale.set(1 + wobble(seed, 1) * 0.3, 0.6 + wobble(seed, 2) * 0.2, 1 + wobble(seed, 3) * 0.3);
  rock.position.y = 0.12;
  rock.rotation.y = wobble(seed, 4) * Math.PI;
  return rock;
}

/** A clump of grass blades — thin cones fanned out at slight tilts. */
export function createGrassTuft(seed = 1): Group {
  const group = new Group();
  const blades = 5;
  for (let i = 0; i < blades; i += 1) {
    const blade = new Mesh(new ConeGeometry(0.03, 0.2 + wobble(seed + i, 1) * 0.06, 4), matte(NATURE.grassBlade));
    blade.castShadow = true;
    blade.position.set(wobble(seed + i, 2) * 0.14, 0.12, wobble(seed + i, 3) * 0.14);
    blade.rotation.z = wobble(seed + i, 4) * 0.4;
    group.add(blade);
  }
  return group;
}

/** A low leafy bush, two overlapping blobs. */
export function createBush(seed = 1): Group {
  const group = new Group();
  for (let i = 0; i < 2; i += 1) {
    const blob = solid(new Mesh(new IcosahedronGeometry(0.2, 0), matte(NATURE.bush)));
    blob.position.set(wobble(seed + i, 1) * 0.14, 0.16, wobble(seed + i, 2) * 0.14);
    blob.scale.setScalar(0.85 + wobble(seed + i, 3) * 0.2);
    group.add(blob);
  }
  return group;
}

/** A single flower: a thin stem with a bright four-petal head. */
export function createFlower(seed = 1): Group {
  const group = new Group();
  const stem = new Mesh(new CylinderGeometry(0.012, 0.012, 0.22, 4), matte(NATURE.grassBlade));
  stem.position.y = 0.11;
  group.add(stem);

  const color = FLOWERS[Math.floor((wobble(seed, 1) * 0.5 + 0.5) * FLOWERS.length) % FLOWERS.length]!;
  const head = solid(new Mesh(new IcosahedronGeometry(0.06, 0), matte(color)));
  head.position.y = 0.24;
  head.scale.set(1.3, 0.6, 1.3);
  group.add(head);

  const center = new Mesh(new IcosahedronGeometry(0.03, 0), matte(0xf4c542));
  center.position.y = 0.26;
  group.add(center);
  return group;
}

// Composite tiles ------------------------------------------------------------

/**
 * A biome tile is rarely one thing — it is a patch that may carry several props.
 * These build a decorated tile from a seed, so the same call yields a different
 * arrangement per seed and a world made of them never reads as a grid of clones.
 */

function drop(group: Group, prop: Group | Mesh, x: number, z: number, scale: number): void {
  prop.position.set(x, 0.07, z);
  prop.scale.multiplyScalar(scale);
  group.add(prop);
}

/** A forest tile: three small trees clustered on grass. */
export function createForestTile(seed = 1): Group {
  const group = new Group();
  group.add(createGroundTile(NATURE.grass));
  const spots: [number, number][] = [
    [-0.24 + wobble(seed, 1) * 0.08, -0.2 + wobble(seed, 2) * 0.08],
    [0.24 + wobble(seed, 3) * 0.08, -0.22 + wobble(seed, 4) * 0.08],
    [wobble(seed, 5) * 0.1, 0.24 + wobble(seed, 6) * 0.08],
  ];
  spots.forEach(([x, z], i) => {
    const tree = (seed + i) % 2 ? createBroadleaf(seed * 7 + i) : createPine(seed * 5 + i);
    drop(group, tree, x, z, 0.52);
  });
  return group;
}

/** A meadow tile: grass tufts and a couple of flowers. */
export function createMeadowTile(seed = 1): Group {
  const group = new Group();
  group.add(createGroundTile(NATURE.grass));
  for (let i = 0; i < 3; i += 1) {
    drop(group, createGrassTuft(seed * 3 + i), wobble(seed + i, 1) * 0.3, wobble(seed + i, 2) * 0.3, 0.9);
  }
  for (let i = 0; i < 2; i += 1) {
    drop(group, createFlower(seed * 9 + i), wobble(seed + i, 3) * 0.28, wobble(seed + i, 4) * 0.28, 1);
  }
  return group;
}

/** A grove tile: one tree with a bush and a rock at its foot. */
export function createGroveTile(seed = 1): Group {
  const group = new Group();
  group.add(createGroundTile(NATURE.grass));
  const tree = seed % 2 ? createPine(seed * 5) : createBroadleaf(seed * 7);
  drop(group, tree, wobble(seed, 1) * 0.12, wobble(seed, 2) * 0.12, 0.62);
  drop(group, createBush(seed * 2), 0.28, 0.26, 0.7);
  drop(group, createRock(seed * 4), -0.3, 0.24, 0.55);
  return group;
}

/** A rocky tile: a cluster of boulders on bare soil. */
export function createRockClusterTile(seed = 1): Group {
  const group = new Group();
  group.add(createGroundTile(NATURE.soil));
  for (let i = 0; i < 3; i += 1) {
    drop(group, createRock(seed * 6 + i), wobble(seed + i, 1) * 0.28, wobble(seed + i, 2) * 0.28, 0.7 + wobble(seed + i, 3) * 0.2);
  }
  return group;
}

/** A denser meadow: grass tufts under a scatter of bright flowers. */
export function createFlowerPatch(seed = 1): Group {
  const group = new Group();
  group.add(createGroundTile(NATURE.grass));
  for (let i = 0; i < 3; i += 1) {
    drop(group, createGrassTuft(seed * 3 + i), wobble(seed + i, 1) * 0.32, wobble(seed + i, 2) * 0.32, 0.8);
  }
  for (let i = 0; i < 6; i += 1) {
    drop(group, createFlower(seed * 11 + i), wobble(seed * 2 + i, 3) * 0.34, wobble(seed * 2 + i, 4) * 0.34, 1);
  }
  return group;
}

// Plains — extra prop --------------------------------------------------------

/** A taller, fuller grass clump — a coarser variant of the little tuft. */
export function createTallGrass(seed = 1): Group {
  const group = new Group();
  const blades = 7;
  for (let i = 0; i < blades; i += 1) {
    const h = 0.32 + wobble(seed + i, 1) * 0.08;
    const blade = new Mesh(new ConeGeometry(0.028, h, 4), matte(i % 3 === 0 ? NATURE.grass : NATURE.grassBlade));
    blade.castShadow = true;
    blade.position.set(wobble(seed + i, 2) * 0.16, h / 2, wobble(seed + i, 3) * 0.16);
    blade.rotation.z = wobble(seed + i, 4) * 0.35;
    group.add(blade);
  }
  return group;
}

// Resource nodes -------------------------------------------------------------

/**
 * A resource node reads through its state: full carries the harvestable stuff,
 * mined is spent rubble, regrowing is a hint of it coming back. Same silhouette
 * across states so it stays recognisable as "the iron spot".
 */

const IRON = { rock: 0x6f7885, rockDeep: 0x565e69, crystal: 0xaebccc } as const;

export type NodeState = 'full' | 'mined' | 'regrowing';

/** An iron vein: a rocky base with steel-blue crystal shards poking out. */
export function createIronNode(seed = 1, state: NodeState = 'full'): Group {
  const group = new Group();

  const base = solid(new Mesh(new IcosahedronGeometry(0.34, 0), matte(IRON.rockDeep)));
  base.scale.set(1.1 + wobble(seed, 1) * 0.2, 0.5 + wobble(seed, 2) * 0.1, 1.1 + wobble(seed, 3) * 0.2);
  base.position.y = 0.1;
  base.rotation.y = wobble(seed, 4) * Math.PI;
  group.add(base);

  const shard = (x: number, z: number, tall: number, s: number): void => {
    const crystal = solid(new Mesh(new OctahedronGeometry(0.09, 0), matte(IRON.crystal)));
    crystal.scale.set(0.7, tall, 0.7);
    crystal.position.set(x, 0.15 + tall * 0.09, z);
    crystal.rotation.y = wobble(s, 5) * Math.PI;
    group.add(crystal);
  };

  if (state === 'full') {
    shard(0, 0, 1.7, seed);
    shard(0.15, -0.1, 1.1, seed + 1);
    shard(-0.13, 0.12, 1.35, seed + 2);
    shard(0.05, 0.16, 0.9, seed + 3);
  } else if (state === 'regrowing') {
    shard(0.02, 0, 0.8, seed);
    shard(-0.1, 0.09, 0.55, seed + 1);
  } else {
    // Mined out: only loose rubble left in the hollow.
    for (let i = 0; i < 3; i += 1) {
      const bit = solid(new Mesh(new IcosahedronGeometry(0.07, 0), matte(IRON.rock)));
      bit.position.set(wobble(seed + i, 1) * 0.2, 0.08, wobble(seed + i, 2) * 0.2);
      bit.rotation.y = wobble(seed + i, 3) * Math.PI;
      group.add(bit);
    }
  }

  return group;
}

/** A cultivation plot: tilled ridges that stay bare, sprout, or ripen. */
export function createFarmPlot(state: NodeState = 'full'): Group {
  const group = new Group();
  group.add(createGroundTile(0x6f5334));

  const rows = 4;
  for (let r = 0; r < rows; r += 1) {
    const z = -0.33 + r * 0.22;
    const ridge = solid(new Mesh(chamferedBox(0.86, 0.06, 0.12, 0.03, 0.01), matte(0x87683f)));
    ridge.position.set(0, 0.11, z);
    group.add(ridge);

    if (state === 'mined') continue; // fallow: bare ridges

    const ripe = state === 'full';
    for (let c = 0; c < 5; c += 1) {
      const x = -0.34 + c * 0.17;
      const h = ripe ? 0.16 : 0.08;
      const crop = new Mesh(new ConeGeometry(ripe ? 0.04 : 0.025, h, 5), matte(ripe ? 0xd2b24a : 0x6fae4c));
      crop.castShadow = true;
      crop.position.set(x, 0.14 + h / 2, z);
      group.add(crop);
    }
  }

  return group;
}
