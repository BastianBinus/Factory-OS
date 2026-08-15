import './style/index';
import { Color, Group, type Object3D } from 'three';
import { Scene } from './render/Scene';
import { readPalette, type WorldPalette } from './render/palette';
import type { MachineId } from './game/types';
import {
  WorldGeometry,
  WorldMaterials,
  createBelt,
  createMachine,
  createRobot,
  createWall,
} from './render/meshFactory';
import {
  NATURE,
  createBroadleaf,
  createBush,
  createFlower,
  createForestTile,
  createGrassTuft,
  createGroundTile,
  createGroveTile,
  createMeadowTile,
  createPine,
  createRock,
  createRockClusterTile,
  createWaterTile,
} from './render/nature';

/**
 * The asset showroom — a standalone look-test, not part of the game.
 *
 * Three tabs: a keystone diorama for the overall vibe, a single-asset browser to
 * step through every piece in isolation, and a variation grid that proves each
 * biome tile arranges differently per seed instead of cloning. It exists to lock
 * the stylised low-poly direction before the living-world rebuild commits to the
 * full asset list.
 */

const app = document.createElement('div');
app.style.cssText = 'position:fixed;inset:0;overflow:hidden;';
document.body.style.margin = '0';
document.body.appendChild(app);

const palette = readPalette();
const scene = new Scene({ container: app, palette });
const geometry = new WorldGeometry();
const materials = new WorldMaterials(palette);

/** The turntable everything sits on, cleared and refilled when the tab changes. */
const stage = new Group();
scene.world.add(stage);

let frameHooks: ((delta: number) => void)[] = [];

function clearStage(): void {
  stage.clear();
  stage.rotation.y = 0;
  frameHooks = [];
}

function machineMesh(id: MachineId): Object3D {
  const view = createMachine(geometry, materials, id);
  view.setBusy(true);
  return view.group;
}

/** A water surface needs a bed under it to read as depth, not a floating pane. */
function waterAsset(): Group {
  const group = new Group();
  const bed = createGroundTile(0x3a6b57);
  bed.position.y = -0.02;
  group.add(bed, createWaterTile());
  return group;
}

// The catalogue for the single-asset browser. `ground` marks the pieces that
// bring their own floor, so a bare prop gets a grass tile placed under it.
interface Entry {
  name: string;
  make: () => Object3D;
  ground?: boolean;
}

const ASSETS: Entry[] = [
  { name: 'Boden — Wiese', make: () => createGroundTile(NATURE.grass), ground: true },
  { name: 'Boden — Erde', make: () => createGroundTile(NATURE.soil), ground: true },
  { name: 'Boden — Sand', make: () => createGroundTile(NATURE.sand), ground: true },
  { name: 'Boden — Fels', make: () => createGroundTile(NATURE.rock), ground: true },
  { name: 'Boden — Wasser', make: () => waterAsset(), ground: true },
  { name: 'Nadelbaum', make: () => createPine(3) },
  { name: 'Laubbaum', make: () => createBroadleaf(4) },
  { name: 'Fels', make: () => createRock(5) },
  { name: 'Grasbüschel', make: () => createGrassTuft(1) },
  { name: 'Busch', make: () => createBush(2) },
  { name: 'Blume', make: () => createFlower(2) },
  { name: 'Tile — Wald (3 Bäume)', make: () => createForestTile(3), ground: true },
  { name: 'Tile — Wiese', make: () => createMeadowTile(2), ground: true },
  { name: 'Tile — Hain', make: () => createGroveTile(1), ground: true },
  { name: 'Tile — Fels-Cluster', make: () => createRockClusterTile(4), ground: true },
  { name: 'Smelter', make: () => machineMesh('smelter') },
  { name: 'Assembler', make: () => machineMesh('assembler') },
  { name: 'Foundry', make: () => machineMesh('foundry') },
  { name: 'Seeder', make: () => machineMesh('seeder') },
  { name: 'Refinery', make: () => machineMesh('refinery') },
  { name: 'Press', make: () => machineMesh('press') },
  { name: 'Belt', make: () => createBelt(geometry, materials, 'east') },
  { name: 'Wand', make: () => createWall(geometry, materials) },
  { name: 'Roboter', make: () => createRobot(geometry, materials) },
];

// Diorama --------------------------------------------------------------------

const GROUND = ['..~~.', '...~.', '..##.', '...#.', '.....'];

function buildDiorama(): void {
  clearStage();
  for (let z = 0; z < GROUND.length; z += 1) {
    const row = GROUND[z] ?? '';
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      const wx = x - 2;
      const wz = z - 2;
      if (ch === '~') {
        const bed = createGroundTile(0x3a6b57);
        bed.position.set(wx, -0.02, wz);
        const water = createWaterTile();
        water.position.set(wx, water.position.y, wz);
        stage.add(bed, water);
      } else {
        const tile = createGroundTile(ch === '#' ? NATURE.soil : NATURE.grass);
        tile.position.set(wx, 0, wz);
        stage.add(tile);
      }
    }
  }

  const put = (object: Object3D, x: number, z: number): void => {
    object.position.set(x, 0.07, z);
    stage.add(object);
  };

  put(createPine(3), -2, -2);
  put(createPine(7), -1, -2);
  put(createBroadleaf(4), -2, -1);
  put(createPine(11), 2, -1);
  put(createBush(2), -1, -1);
  put(createRock(5), 2, 1);
  put(createRock(9), -2, 2);
  for (const [x, z, s] of [
    [0, -2, 1],
    [-1, 0, 6],
    [1, 2, 8],
    [-2, 0, 12],
  ] as const)
    put(createGrassTuft(s), x, z);
  for (const [x, z, s] of [
    [1, -2, 2],
    [-1, 1, 5],
    [0, 2, 9],
  ] as const)
    put(createFlower(s), x, z);

  const smelter = createMachine(geometry, materials, 'smelter');
  smelter.setBusy(true);
  put(smelter.group, 0, 0);
  frameHooks.push((d) => smelter.animate(d));

  put(createRobot(geometry, materials), 1, 1);

  scene.setTarget(0, 0);
  scene.setViewSize(4.2);
}

// Single asset ---------------------------------------------------------------

let index = 0;

function buildSingle(): void {
  clearStage();
  const entry = ASSETS[index]!;
  if (!entry.ground) {
    stage.add(createGroundTile(NATURE.grass));
  }
  const object = entry.make();
  if (!entry.ground) object.position.y = 0.07;
  stage.add(object);

  label.textContent = `${index + 1}/${ASSETS.length}  ·  ${entry.name}`;
  highlightGrid();
  scene.setTarget(0, 0);
  scene.setViewSize(1.35);
}

// Variations -----------------------------------------------------------------

function buildVariations(): void {
  clearStage();
  const rows: [string, (seed: number) => Group][] = [
    ['forest', createForestTile],
    ['meadow', createMeadowTile],
    ['grove', createGroveTile],
    ['rocks', createRockClusterTile],
  ];
  rows.forEach((entry, r) => {
    const make = entry[1];
    for (let c = 0; c < 5; c += 1) {
      const tile = make(r * 17 + c * 3 + 1);
      tile.position.set(c - 2, 0, r - 1.5);
      stage.add(tile);
    }
  });
  scene.setTarget(0, 0);
  scene.setViewSize(3.6);
}

// Frame ----------------------------------------------------------------------

let auto = true;
let dragging = false;

app.addEventListener('pointerdown', () => {
  dragging = true;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
app.addEventListener('pointermove', (event) => {
  if (dragging) stage.rotation.y += event.movementX * 0.01;
});

scene.start((delta) => {
  if (auto && !dragging) stage.rotation.y += delta * 0.25;
  for (const hook of frameHooks) hook(delta);
});

// Day / night ----------------------------------------------------------------

function nightPalette(day: WorldPalette): WorldPalette {
  const night = { ...day } as WorldPalette;
  night.sky = new Color(0x10162b);
  night.floor = new Color(0x1a2233);
  night.shadow = 0.5;
  return night;
}

let night = false;
const dark = nightPalette(palette);

// Chrome ---------------------------------------------------------------------

const tabbar = document.createElement('div');
tabbar.style.cssText =
  'position:fixed;left:16px;top:16px;display:flex;gap:6px;' +
  'font-family:var(--font-sans,sans-serif);';
app.appendChild(tabbar);

const bottom = document.createElement('div');
bottom.style.cssText =
  'position:fixed;left:16px;bottom:16px;display:flex;gap:8px;align-items:center;' +
  'font-family:var(--font-sans,sans-serif);';
app.appendChild(bottom);

const label = document.createElement('span');
label.style.cssText =
  'padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.45);color:#fff;' +
  'font-size:13px;backdrop-filter:blur(4px);';

// The quick-pick grid down the right edge — every asset as a small button so the
// single-asset browser is jump-to, not just click-through.
const grid = document.createElement('div');
grid.style.cssText =
  'position:fixed;right:16px;top:16px;bottom:16px;width:180px;display:grid;' +
  'grid-template-columns:1fr 1fr;grid-auto-rows:min-content;gap:6px;overflow-y:auto;' +
  'padding:4px;font-family:var(--font-sans,sans-serif);';
app.appendChild(grid);

const gridButtons = ASSETS.map((entry, i) => {
  const btn = document.createElement('button');
  btn.textContent = entry.name;
  btn.style.cssText =
    'padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.2);' +
    'background:rgba(0,0,0,.45);color:#fff;font-size:11px;line-height:1.2;cursor:pointer;' +
    'backdrop-filter:blur(4px);text-align:left;';
  btn.addEventListener('click', () => {
    index = i;
    buildSingle();
  });
  grid.appendChild(btn);
  return btn;
});

/** Mark the active asset in the quick-pick grid and scroll it into view. */
function highlightGrid(): void {
  gridButtons.forEach((btn, i) => {
    const active = i === index;
    btn.style.background = active ? 'rgba(120,200,120,.35)' : 'rgba(0,0,0,.45)';
    btn.style.borderColor = active ? 'rgba(150,230,150,.8)' : 'rgba(255,255,255,.2)';
    if (active) btn.scrollIntoView({ block: 'nearest' });
  });
}

function styleButton(btn: HTMLButtonElement, active = false): void {
  btn.style.cssText =
    'padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.25);' +
    `background:rgba(${active ? '255,255,255,.18' : '0,0,0,.45'});color:#fff;` +
    'font-size:13px;cursor:pointer;backdrop-filter:blur(4px);';
}

function button(parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  styleButton(btn);
  btn.addEventListener('click', onClick);
  parent.appendChild(btn);
  return btn;
}

type Tab = 'Diorama' | 'Einzeln' | 'Variationen';
const tabButtons: Record<Tab, HTMLButtonElement> = {} as Record<Tab, HTMLButtonElement>;

function setTab(next: Tab): void {
  for (const [name, btn] of Object.entries(tabButtons)) styleButton(btn, name === next);

  // The single-asset browser gets its stepper and quick-pick grid; others do not.
  prev.style.display = next === 'Einzeln' ? '' : 'none';
  nextBtn.style.display = next === 'Einzeln' ? '' : 'none';
  label.style.display = next === 'Einzeln' ? '' : 'none';
  grid.style.display = next === 'Einzeln' ? 'grid' : 'none';
  auto = next !== 'Variationen';

  if (next === 'Diorama') buildDiorama();
  else if (next === 'Einzeln') buildSingle();
  else buildVariations();
}

for (const name of ['Diorama', 'Einzeln', 'Variationen'] as Tab[]) {
  tabButtons[name] = button(tabbar, name, () => setTab(name));
}

const prev = button(bottom, '‹', () => {
  index = (index - 1 + ASSETS.length) % ASSETS.length;
  buildSingle();
});
bottom.appendChild(label);
const nextBtn = button(bottom, '›', () => {
  index = (index + 1) % ASSETS.length;
  buildSingle();
});

button(bottom, 'Nacht', function toggleNight(this: HTMLButtonElement) {
  night = !night;
  scene.applyPalette(night ? dark : palette);
  this.textContent = night ? 'Tag' : 'Nacht';
});

button(bottom, 'Drehen', () => {
  auto = !auto;
});

setTab('Diorama');
