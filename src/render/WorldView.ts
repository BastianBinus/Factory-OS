import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Raycaster,
  Vector2,
} from 'three';
import type { GameState, Grid, MachineId, Robot, Tile } from '../game/types';
import { indexOf, tileAt } from '../game/grid';
import type { WorldPalette } from './palette';
import type { GroundView, MachineView } from './meshFactory';
import {
  WorldGeometry,
  WorldMaterials,
  createGround,
  createMachine,
  createMarket,
  createRobot,
} from './meshFactory';
import type { Scene } from './Scene';

/**
 * Turns a GameState into a scene graph and keeps it there. It reads the state
 * and never writes to it — all it knows how to do is show what already happened.
 *
 * Geometry is created once and shared. A theme change disposes only the
 * materials and rebuilds the graph around the same geometry, so switching back
 * and forth cannot pile up GPU memory.
 */

export interface HoverInfo {
  x: number;
  y: number;
  tile: Tile;
}

interface TileView {
  ground?: GroundView;
  machine?: MachineView;
  group: Group;
}

interface RobotView {
  group: Group;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromAngle: number;
  toAngle: number;
  /** 0…1 progress of the move started on the last tick. */
  t: number;
  duration: number;
}

const FACING_ANGLE = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 } as const;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Shortest way round the circle, so turning west from north does not spin 270°. */
function shortestDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export class WorldView {
  private readonly scene: Scene;
  private readonly geometry = new WorldGeometry();
  private materials: WorldMaterials;
  private palette: WorldPalette;

  private readonly tiles = new Map<number, TileView>();
  private readonly robots = new Map<string, RobotView>();

  private floor: InstancedMesh | null = null;
  private gridLines: LineSegments | null = null;
  private readonly highlight: LineLoop;
  private readonly picker: Mesh;

  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private hovered: HoverInfo | null = null;
  private hoverHandler: ((info: HoverInfo | null) => void) | null = null;

  private state: GameState | null = null;
  private gridSignature = '';
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly cleanups: (() => void)[] = [];

  constructor(scene: Scene, palette: WorldPalette) {
    this.scene = scene;
    this.palette = palette;
    this.materials = new WorldMaterials(palette);

    this.highlight = new LineLoop(
      tileOutlineGeometry(),
      new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.9 }),
    );
    this.highlight.visible = false;
    this.highlight.position.y = 0.06;
    this.scene.world.add(this.highlight);

    // An invisible sheet on the ground is all the raycaster needs; testing
    // against every mesh in the factory would cost far more per pointer move.
    this.picker = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ visible: false, depthWrite: false }),
    );
    this.picker.rotation.x = -Math.PI / 2;
    this.scene.world.add(this.picker);

    const canvas = this.scene.renderer.domElement;
    const onMove = (event: PointerEvent) => this.updateHover(event);
    const onLeave = () => this.setHovered(null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    this.cleanups.push(() => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    });
  }

  // Building ----------------------------------------------------------------

  /** Full sync. Rebuilds the static layer only when the map itself changed. */
  sync(state: GameState): void {
    this.state = state;

    const signature = gridSignature(state.grid);
    if (signature !== this.gridSignature) {
      this.gridSignature = signature;
      this.buildStatic(state.grid);
    }

    this.syncTiles(state);
    this.syncRobots(state);
  }

  private buildStatic(grid: Grid): void {
    this.clearStatic();

    const matrix = new Matrix4();
    const floor = new InstancedMesh(this.geometry.floorTile, this.materials.floor, grid.width * grid.height);
    floor.receiveShadow = true;

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const index = indexOf(grid, x, y);
        matrix.makeTranslation(x, -0.08, y);
        floor.setMatrixAt(index, matrix);
        // The checkerboard is almost invisible on purpose — it gives the eye a
        // sense of scale without turning the floor into a pattern.
        floor.setColorAt(index, (x + y) % 2 === 0 ? this.palette.floor : this.palette.floorAlt);
      }
    }

    floor.instanceMatrix.needsUpdate = true;
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
    this.floor = floor;
    this.scene.world.add(floor);

    this.gridLines = new LineSegments(
      gridLineGeometry(grid.width, grid.height),
      new LineBasicMaterial({ color: this.palette.grid, transparent: true, opacity: 0.4 }),
    );
    this.scene.world.add(this.gridLines);

    this.picker.scale.set(grid.width, grid.height, 1);
    this.picker.position.set((grid.width - 1) / 2, 0, (grid.height - 1) / 2);

    for (let y = 0; y < grid.height; y += 1) {
      for (let x = 0; x < grid.width; x += 1) {
        const tile = tileAt(grid, x, y);
        if (!tile) continue;
        const view = this.buildTile(tile);
        if (!view) continue;
        view.group.position.set(x, 0, y);
        this.scene.world.add(view.group);
        this.tiles.set(indexOf(grid, x, y), view);
      }
    }
  }

  private buildTile(tile: Tile): TileView | null {
    switch (tile.kind) {
      case 'ground': {
        const ground = createGround(this.geometry, this.materials);
        return { ground, group: ground.group };
      }
      case 'machine': {
        const machine = createMachine(this.geometry, this.materials, tile.machine);
        return { machine, group: machine.group };
      }
      case 'market':
        return { group: createMarket(this.geometry, this.materials) };
      default:
        return null;
    }
  }

  private syncTiles(state: GameState): void {
    for (const [index, view] of this.tiles) {
      const tile = state.grid.tiles[index];
      if (!tile) continue;
      if (tile.kind === 'ground') view.ground?.setState(tile.state, tile.resource);
      if (tile.kind === 'machine') view.machine?.setBusy(tile.job !== null);
    }
  }

  private syncRobots(state: GameState): void {
    const seen = new Set<string>();

    for (const robot of state.robots) {
      seen.add(robot.id);
      const existing = this.robots.get(robot.id);
      if (existing) this.retarget(existing, robot, state.tickRateMs);
      else this.robots.set(robot.id, this.spawnRobot(robot, state.tickRateMs));
    }

    for (const [id, view] of this.robots) {
      if (seen.has(id)) continue;
      this.scene.world.remove(view.group);
      this.robots.delete(id);
    }
  }

  private spawnRobot(robot: Robot, tickRateMs: number): RobotView {
    const group = createRobot(this.geometry, this.materials);
    const angle = FACING_ANGLE[robot.facing];
    group.position.set(robot.x, 0, robot.y);
    group.rotation.y = angle;
    this.scene.world.add(group);

    return {
      group,
      fromX: robot.x,
      fromY: robot.y,
      toX: robot.x,
      toY: robot.y,
      fromAngle: angle,
      toAngle: angle,
      t: 1,
      duration: tickRateMs / 1000,
    };
  }

  /** Starts a new glide from wherever the robot is drawn right now. */
  private retarget(view: RobotView, robot: Robot, tickRateMs: number): void {
    const angle = FACING_ANGLE[robot.facing];
    const moved = view.toX !== robot.x || view.toY !== robot.y;
    const turned = Math.abs(shortestDelta(view.toAngle, angle)) > 0.001;
    if (!moved && !turned) return;

    view.fromX = view.group.position.x;
    view.fromY = view.group.position.z;
    view.fromAngle = view.group.rotation.y;
    view.toX = robot.x;
    view.toY = robot.y;
    view.toAngle = angle;
    view.duration = Math.max(tickRateMs / 1000, 0.001);
    view.t = this.reducedMotion ? 1 : 0;

    if (this.reducedMotion) {
      view.group.position.set(robot.x, 0, robot.y);
      view.group.rotation.y = angle;
    }
  }

  /**
   * Puts robots exactly where the state says with no glide. Used after a reset,
   * where sliding home across the whole floor would read as a journey the robot
   * never made.
   */
  snapRobots(): void {
    for (const view of this.robots.values()) {
      view.fromX = view.toX;
      view.fromY = view.toY;
      view.fromAngle = view.toAngle;
      view.t = 1;
      view.group.position.set(view.toX, 0, view.toY);
      view.group.rotation.y = view.toAngle;
    }
  }

  // Frame -------------------------------------------------------------------

  update(delta: number): void {
    for (const view of this.robots.values()) {
      if (view.t >= 1) continue;
      view.t = Math.min(1, view.t + delta / view.duration);
      const eased = easeInOutCubic(view.t);
      view.group.position.x = view.fromX + (view.toX - view.fromX) * eased;
      view.group.position.z = view.fromY + (view.toY - view.fromY) * eased;
      view.group.rotation.y = view.fromAngle + shortestDelta(view.fromAngle, view.toAngle) * eased;
    }

    for (const view of this.tiles.values()) view.machine?.animate(delta);
  }

  // Hover -------------------------------------------------------------------

  onHover(handler: (info: HoverInfo | null) => void): void {
    this.hoverHandler = handler;
  }

  private updateHover(event: PointerEvent): void {
    const state = this.state;
    if (!state) return;

    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    this.raycaster.setFromCamera(this.pointer, this.scene.camera);
    const hit = this.raycaster.intersectObject(this.picker, false)[0];
    if (!hit) {
      this.setHovered(null);
      return;
    }

    const x = Math.round(hit.point.x);
    const y = Math.round(hit.point.z);
    const tile = tileAt(state.grid, x, y);
    this.setHovered(tile ? { x, y, tile } : null);
  }

  private setHovered(info: HoverInfo | null): void {
    const same = info?.x === this.hovered?.x && info?.y === this.hovered?.y;
    if (same && (info === null) === (this.hovered === null)) return;

    this.hovered = info;
    this.highlight.visible = info !== null;
    if (info) this.highlight.position.set(info.x, 0.06, info.y);
    this.hoverHandler?.(info);
  }

  // Theme -------------------------------------------------------------------

  applyPalette(palette: WorldPalette): void {
    this.palette = palette;
    this.materials.dispose();
    this.materials = new WorldMaterials(palette);
    (this.highlight.material as LineBasicMaterial).color.copy(palette.accent);

    // Force a rebuild against the new materials; the geometry is untouched.
    this.gridSignature = '';
    if (this.state) this.sync(this.state);
  }

  // Teardown ----------------------------------------------------------------

  private clearStatic(): void {
    for (const view of this.tiles.values()) {
      this.scene.world.remove(view.group);
      disposeGroup(view.group);
    }
    this.tiles.clear();

    for (const view of this.robots.values()) {
      this.scene.world.remove(view.group);
      disposeGroup(view.group);
    }
    this.robots.clear();

    if (this.floor) {
      this.scene.world.remove(this.floor);
      this.floor.dispose();
      this.floor = null;
    }
    if (this.gridLines) {
      this.scene.world.remove(this.gridLines);
      this.gridLines.geometry.dispose();
      (this.gridLines.material as LineBasicMaterial).dispose();
      this.gridLines = null;
    }
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.clearStatic();
    this.scene.world.remove(this.highlight, this.picker);
    this.highlight.geometry.dispose();
    (this.highlight.material as LineBasicMaterial).dispose();
    this.picker.geometry.dispose();
    (this.picker.material as MeshBasicMaterial).dispose();
    this.materials.dispose();
    this.geometry.dispose();
  }
}

// Helpers ---------------------------------------------------------------------

/** Machines clone a material for their own glow; give them a chance to free it. */
function disposeGroup(group: Object3D): void {
  const dispose = group.userData['dispose'];
  if (typeof dispose === 'function') dispose();
}

function tileOutlineGeometry(): BufferGeometry {
  const h = 0.5;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h], 3),
  );
  return geometry;
}

function gridLineGeometry(width: number, height: number): BufferGeometry {
  const points: number[] = [];
  const x0 = -0.5;
  const z0 = -0.5;

  for (let x = 0; x <= width; x += 1) {
    points.push(x0 + x, 0, z0, x0 + x, 0, z0 + height);
  }
  for (let y = 0; y <= height; y += 1) {
    points.push(x0, 0, z0 + y, x0 + width, 0, z0 + y);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.translate(0, 0.011, 0);
  return geometry;
}

const MACHINE_MARK: Record<MachineId, string> = {
  smelter: 's',
  assembler: 'a',
  seeder: 'd',
  refinery: 'r',
  press: 'p',
};

/**
 * Cheap way to notice a rebuild is needed: size plus what sits on every tile.
 *
 * Every ground state maps to the same character deliberately. A tile going from
 * prepared to growing to ripe is a change the *views* handle in `syncTiles`; if
 * it changed the signature instead, the whole floor would be torn down and
 * rebuilt on the tick a single crop came in.
 *
 * Exported for the test that holds that promise to it.
 */
export function gridSignature(grid: Grid): string {
  const kinds = grid.tiles
    .map((tile) => {
      if (tile.kind === 'ground') return '.';
      if (tile.kind === 'machine') return MACHINE_MARK[tile.machine];
      return tile.kind === 'market' ? 'm' : '.';
    })
    .join('');
  return `${grid.width}x${grid.height}:${kinds}`;
}
