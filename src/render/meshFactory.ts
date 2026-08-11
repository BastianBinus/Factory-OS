import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Shape,
  SphereGeometry,
} from 'three';
import type { GroundState, MachineId, ResourceId } from '../game/types';
import type { WorldPalette } from './palette';
import { colorFor } from './palette';

/**
 * Every object in the factory is built from code — no external models, no
 * textures. The shared vocabulary is one shape: a box with chamfered edges.
 * That single detail is what stops procedural geometry from looking like
 * untouched primitives.
 *
 * A tile is 1 unit. Tile (x, y) sits at world (x, 0, y); the ground plane is
 * y = 0 and everything is built upwards from it.
 */

const SURFACE = { roughness: 0.55, metalness: 0.15 } as const;
const METAL = { roughness: 0.35, metalness: 0.6 } as const;

/** A rounded rectangle in the XY plane, used as the profile for every box. */
function roundedRect(width: number, depth: number, radius: number): Shape {
  const r = Math.min(radius, width / 2 - 0.001, depth / 2 - 0.001);
  const x = width / 2;
  const z = depth / 2;
  const shape = new Shape();

  shape.moveTo(-x + r, -z);
  shape.lineTo(x - r, -z);
  shape.quadraticCurveTo(x, -z, x, -z + r);
  shape.lineTo(x, z - r);
  shape.quadraticCurveTo(x, z, x - r, z);
  shape.lineTo(-x + r, z);
  shape.quadraticCurveTo(-x, z, -x, z - r);
  shape.lineTo(-x, -z + r);
  shape.quadraticCurveTo(-x, -z, -x + r, -z);

  return shape;
}

/**
 * A box whose vertical edges are rounded and whose top and bottom are chamfered.
 * The result sits on y = 0 and is centred on x and z.
 */
export function chamferedBox(
  width: number,
  height: number,
  depth: number,
  radius = 0.05,
  bevel = 0.025,
): BufferGeometry {
  const b = Math.min(bevel, height / 2 - 0.001, radius);
  const shape = roundedRect(width - b * 2, depth - b * 2, Math.max(radius - b, 0.005));

  const geometry = new ExtrudeGeometry(shape, {
    depth: height - b * 2,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 4,
  });

  // ExtrudeGeometry grows along +z; stand it up and drop it onto the ground.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height - b, 0);
  geometry.computeVertexNormals();

  return geometry;
}

// Materials -----------------------------------------------------------------

/**
 * One set of materials per theme. Kept together so a theme switch can dispose
 * the whole set at once instead of leaking a copy per change.
 */
export class WorldMaterials {
  readonly floor: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  readonly metalDark: MeshStandardMaterial;
  readonly robot: MeshStandardMaterial;
  readonly accent: MeshStandardMaterial;
  readonly heat: MeshStandardMaterial;
  readonly gear: MeshStandardMaterial;
  readonly groundPrepared: MeshStandardMaterial;
  readonly ore: Record<ResourceId, MeshStandardMaterial>;

  constructor(palette: WorldPalette) {
    // White base colour: the floor is an InstancedMesh and gets its checkerboard
    // from per-instance colours, which multiply this one.
    this.floor = new MeshStandardMaterial({ color: 0xffffff, ...SURFACE });
    this.metal = new MeshStandardMaterial({ color: palette.metal, ...METAL });
    this.metalDark = new MeshStandardMaterial({ color: palette.metalDark, ...METAL });
    this.robot = new MeshStandardMaterial({ color: palette.robot, ...SURFACE });
    this.gear = new MeshStandardMaterial({ color: palette.gear, ...METAL });
    this.groundPrepared = new MeshStandardMaterial({ color: palette.groundPrepared, ...SURFACE });
    this.accent = new MeshStandardMaterial({
      color: palette.accent,
      emissive: palette.accent,
      emissiveIntensity: 0.4,
      ...SURFACE,
    });
    this.heat = new MeshStandardMaterial({
      color: palette.heat,
      emissive: palette.heat,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0,
    });

    this.ore = {
      iron_ore: new MeshStandardMaterial({ color: colorFor(palette, 'iron_ore'), ...SURFACE }),
      copper_ore: new MeshStandardMaterial({ color: colorFor(palette, 'copper_ore'), ...SURFACE }),
      iron_ingot: new MeshStandardMaterial({ color: colorFor(palette, 'iron_ingot'), ...METAL }),
      copper_ingot: new MeshStandardMaterial({
        color: colorFor(palette, 'copper_ingot'),
        ...METAL,
      }),
      gear: new MeshStandardMaterial({ color: colorFor(palette, 'gear'), ...METAL }),
      seed_crystal: new MeshStandardMaterial({ color: colorFor(palette, 'seed_crystal'), ...METAL }),
    };
  }

  dispose(): void {
    this.floor.dispose();
    this.metal.dispose();
    this.metalDark.dispose();
    this.robot.dispose();
    this.accent.dispose();
    this.heat.dispose();
    this.gear.dispose();
    this.groundPrepared.dispose();
    for (const material of Object.values(this.ore)) material.dispose();
  }
}

// Shared geometry -----------------------------------------------------------

/**
 * Geometry is theme independent, so it is built once and reused by every
 * instance. Only `dispose()` at teardown touches it.
 */
export class WorldGeometry {
  readonly floorTile = chamferedBox(0.97, 0.08, 0.97, 0.06, 0.02);
  readonly oreChunk = chamferedBox(0.24, 0.2, 0.24, 0.07, 0.04);
  readonly groundSlab = chamferedBox(0.7, 0.03, 0.7, 0.06, 0.012);
  readonly robotBody = chamferedBox(0.56, 0.3, 0.56, 0.09, 0.035);
  readonly robotDome = new SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  readonly robotStripe = chamferedBox(0.58, 0.05, 0.58, 0.09, 0.015);
  readonly machineBase = chamferedBox(0.82, 0.34, 0.82, 0.08, 0.03);
  readonly smelterBody = chamferedBox(0.58, 0.42, 0.58, 0.08, 0.03);
  readonly smelterStack = chamferedBox(0.2, 0.34, 0.2, 0.05, 0.02);
  readonly smelterPort = chamferedBox(0.34, 0.16, 0.06, 0.03, 0.015);
  readonly assemblerPost = chamferedBox(0.1, 0.44, 0.1, 0.03, 0.015);
  readonly assemblerHead = chamferedBox(0.5, 0.14, 0.5, 0.05, 0.02);
  readonly assemblerGear = new CylinderGeometry(0.19, 0.19, 0.09, 12);
  readonly seederHopper = chamferedBox(0.44, 0.4, 0.44, 0.1, 0.03);
  readonly seederSpout = chamferedBox(0.16, 0.22, 0.16, 0.04, 0.02);
  readonly marketDeck = chamferedBox(0.88, 0.14, 0.88, 0.07, 0.03);
  readonly marketPost = chamferedBox(0.08, 0.5, 0.08, 0.025, 0.012);
  readonly marketRoof = chamferedBox(0.94, 0.1, 0.94, 0.08, 0.03);
  readonly marketTrim = chamferedBox(0.9, 0.04, 0.9, 0.07, 0.015);

  dispose(): void {
    for (const value of Object.values(this)) {
      if (value instanceof BufferGeometry) value.dispose();
    }
  }
}

// Objects -------------------------------------------------------------------

function solid(geometry: BufferGeometry, material: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Four chunks in a fixed, deliberately uneven arrangement — never random. */
const ORE_CHUNKS = [
  { x: -0.16, z: -0.13, scale: 1.0, rotation: 0.4 },
  { x: 0.15, z: -0.17, scale: 0.78, rotation: -0.9 },
  { x: 0.17, z: 0.16, scale: 0.92, rotation: 1.2 },
  { x: -0.14, z: 0.18, scale: 0.66, rotation: -0.3 },
] as const;

export interface OreView {
  group: Group;
  /** Shows fewer chunks as the node empties; hides the last one at zero. */
  setFill(ratio: number): void;
}

export function createOre(
  geometry: WorldGeometry,
  materials: WorldMaterials,
  resource: ResourceId,
): OreView {
  const group = new Group();
  const chunks: Mesh[] = [];

  for (const chunk of ORE_CHUNKS) {
    const mesh = solid(geometry.oreChunk, materials.ore[resource]);
    mesh.position.set(chunk.x, 0, chunk.z);
    mesh.rotation.y = chunk.rotation;
    mesh.scale.setScalar(chunk.scale);
    group.add(mesh);
    chunks.push(mesh);
  }

  return {
    group,
    setFill(ratio) {
      const visible = Math.ceil(Math.max(0, Math.min(1, ratio)) * chunks.length);
      chunks.forEach((mesh, index) => {
        mesh.visible = index < visible;
      });
    },
  };
}

export interface GroundView {
  group: Group;
  /** Redraws for the tile's current state. Only toggles and rescales — no allocation. */
  setState(state: GroundState, resource: ResourceId | null): void;
}

/**
 * One of these exists for every ground tile on the floor, which at 16x16 means
 * 256 groups. That is the price of the four-state cycle being visible; if it
 * ever shows up in a frame profile, the fix is one InstancedMesh per state, not
 * a cheaper tile.
 *
 * It reuses the ore chunk and its four fixed positions on purpose: a harvest and
 * a mined node should look like the same substance, because they are.
 */
export function createGround(geometry: WorldGeometry, materials: WorldMaterials): GroundView {
  const group = new Group();

  // Tilled soil. Flat enough that the checkerboard still reads underneath it.
  const slab = new Mesh(geometry.groundSlab, materials.groundPrepared);
  slab.receiveShadow = true;
  slab.position.y = 0.005;
  group.add(slab);

  const crops: Mesh[] = [];
  for (const chunk of ORE_CHUNKS) {
    const mesh = solid(geometry.oreChunk, materials.ore.iron_ore);
    mesh.position.set(chunk.x, 0.02, chunk.z);
    mesh.rotation.y = chunk.rotation;
    group.add(mesh);
    crops.push(mesh);
  }

  return {
    group,
    setState(state, resource) {
      slab.visible = state !== 'raw';

      // Two half-sized chunks while it grows, four full ones when it is ripe:
      // the tile says at a glance whether walking over there is worth a tick.
      const shown = state === 'ripe' ? crops.length : state === 'growing' ? 2 : 0;
      const scale = state === 'ripe' ? 1 : 0.5;
      const material = resource === null ? materials.ore.iron_ore : materials.ore[resource];

      crops.forEach((mesh, index) => {
        mesh.visible = index < shown;
        if (!mesh.visible) return;
        mesh.material = material;
        mesh.scale.setScalar((ORE_CHUNKS[index]?.scale ?? 1) * scale);
      });
    },
  };
}

export interface MachineView {
  group: Group;
  /** Lights the furnace or spins the assembler while a job runs. */
  setBusy(busy: boolean): void;
  /** Called every frame with seconds elapsed, for the moving parts. */
  animate(delta: number): void;
}

export function createMachine(
  geometry: WorldGeometry,
  materials: WorldMaterials,
  machine: MachineId,
): MachineView {
  switch (machine) {
    case 'smelter':
      return createSmelter(geometry, materials);
    case 'assembler':
      return createAssembler(geometry, materials);
    case 'seeder':
      return createSeeder(geometry, materials);
  }
}

function createSmelter(geometry: WorldGeometry, materials: WorldMaterials): MachineView {
  const group = new Group();

  const base = solid(geometry.machineBase, materials.metalDark);
  const body = solid(geometry.smelterBody, materials.metal);
  body.position.y = 0.34;
  const stack = solid(geometry.smelterStack, materials.metalDark);
  stack.position.set(0.16, 0.76, -0.16);

  // Its own copy of the heat material: each furnace glows on its own schedule.
  const heat = materials.heat.clone();
  const port = solid(geometry.smelterPort, heat);
  port.position.set(0, 0.5, 0.29);

  // Only lit while the furnace runs; the dark theme leans on this for depth.
  const glow = new PointLight(heat.color, 0, 2.4, 2);
  glow.position.set(0, 0.55, 0.3);

  group.add(base, body, stack, port, glow);
  group.userData['dispose'] = () => heat.dispose();

  let busy = false;
  let phase = 0;

  return {
    group,
    setBusy(next) {
      busy = next;
      heat.emissiveIntensity = next ? 1 : 0.04;
      glow.intensity = next ? 1.5 : 0;
    },
    animate(delta) {
      if (!busy) return;
      // A slow flicker reads as heat without turning into a distraction.
      phase += delta * 6;
      const pulse = 1 + Math.sin(phase) * 0.18;
      heat.emissiveIntensity = pulse;
      glow.intensity = 1.5 * pulse;
    },
  };
}

function createAssembler(geometry: WorldGeometry, materials: WorldMaterials): MachineView {
  const group = new Group();

  const base = solid(geometry.machineBase, materials.metalDark);
  for (const [x, z] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ] as const) {
    const post = solid(geometry.assemblerPost, materials.metal);
    post.position.set(x, 0.34, z);
    group.add(post);
  }

  const head = solid(geometry.assemblerHead, materials.metal);
  head.position.y = 0.78;

  const gear = solid(geometry.assemblerGear, materials.gear);
  gear.position.y = 0.97;

  group.add(base, head, gear);

  let busy = false;
  return {
    group,
    setBusy(next) {
      busy = next;
    },
    animate(delta) {
      if (busy) gear.rotation.y += delta * 4;
    },
  };
}

/**
 * A hopper with a stirrer and a spout aimed at the floor. It borrows the
 * assembler's gear rather than owning a shape of its own — the two machines are
 * meant to read as the same family of thing.
 */
function createSeeder(geometry: WorldGeometry, materials: WorldMaterials): MachineView {
  const group = new Group();

  const base = solid(geometry.machineBase, materials.metalDark);

  const hopper = solid(geometry.seederHopper, materials.metal);
  hopper.position.y = 0.34;

  const spout = solid(geometry.seederSpout, materials.accent);
  spout.position.set(0, 0.1, 0.28);

  const stirrer = solid(geometry.assemblerGear, materials.gear);
  stirrer.position.y = 0.76;

  group.add(base, hopper, spout, stirrer);

  let busy = false;
  return {
    group,
    setBusy(next) {
      busy = next;
    },
    animate(delta) {
      // Slower than the assembler: this one is grinding, not cutting.
      if (busy) stirrer.rotation.y += delta * 2.5;
    },
  };
}

export function createMarket(geometry: WorldGeometry, materials: WorldMaterials): Group {
  const group = new Group();

  const deck = solid(geometry.marketDeck, materials.metalDark);
  const trim = solid(geometry.marketTrim, materials.accent);
  trim.position.y = 0.14;

  for (const [x, z] of [
    [-0.38, -0.38],
    [0.38, -0.38],
    [-0.38, 0.38],
    [0.38, 0.38],
  ] as const) {
    const post = solid(geometry.marketPost, materials.metal);
    post.position.set(x, 0.18, z);
    group.add(post);
  }

  const roof = solid(geometry.marketRoof, materials.metal);
  roof.position.y = 0.68;

  group.add(deck, trim, roof);
  return group;
}

export function createRobot(geometry: WorldGeometry, materials: WorldMaterials): Group {
  const group = new Group();

  const body = solid(geometry.robotBody, materials.metal);
  body.position.y = 0.06;

  const stripe = solid(geometry.robotStripe, materials.accent);
  stripe.position.y = 0.2;

  const dome = solid(geometry.robotDome, materials.robot);
  dome.position.y = 0.36;

  // A small nose so the facing direction is readable at a glance.
  const nose = solid(geometry.smelterPort, materials.accent);
  nose.scale.set(0.5, 0.5, 1);
  nose.position.set(0, 0.22, 0.3);

  group.add(body, stripe, dome, nose);
  return group;
}
