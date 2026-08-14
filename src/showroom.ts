import './style/index';
import { Group } from 'three';
import { Color } from 'three';
import { Scene } from './render/Scene';
import { readPalette, type WorldPalette } from './render/palette';
import { WorldGeometry, WorldMaterials, createMachine, createRobot } from './render/meshFactory';
import {
  NATURE,
  createBroadleaf,
  createBush,
  createFlower,
  createGrassTuft,
  createGroundTile,
  createPine,
  createRock,
  createWaterTile,
} from './render/nature';

/**
 * The asset showroom — a standalone look-test, not part of the game.
 *
 * It stages one keystone diorama (a corner of meadow with a tree line, a rock, a
 * water edge and a single factory building) so the stylised low-poly direction
 * can be judged in isolation and locked before the living-world rebuild spends
 * effort on the full asset list.
 */

const app = document.createElement('div');
app.style.cssText = 'position:fixed;inset:0;overflow:hidden;';
document.body.style.margin = '0';
document.body.appendChild(app);

const palette = readPalette();
const scene = new Scene({ container: app, palette });
const geometry = new WorldGeometry();
const materials = new WorldMaterials(palette);

// Diorama --------------------------------------------------------------------

/** A 5×5 patch, its objects placed by hand around the origin so it turns cleanly. */
const diorama = new Group();
scene.world.add(diorama);

// A cleared patch of ground where the factory sits: `.` meadow, `~` water, `#` cleared soil.
const GROUND = [
  '..~~.',
  '...~.',
  '..##.',
  '...#.',
  '.....',
];

for (let z = 0; z < GROUND.length; z += 1) {
  const row = GROUND[z] ?? '';
  for (let x = 0; x < row.length; x += 1) {
    const ch = row[x];
    const wx = x - 2;
    const wz = z - 2;
    if (ch === '~') {
      const bed = createGroundTile(0x3a6b57);
      bed.position.set(wx, -0.02, wz);
      diorama.add(bed);
      const water = createWaterTile();
      water.position.set(wx, water.position.y, wz);
      diorama.add(water);
    } else {
      const tile = createGroundTile(ch === '#' ? NATURE.soil : NATURE.grass);
      tile.position.set(wx, 0, wz);
      diorama.add(tile);
    }
  }
}

/** Drop an object on tile (x, z), where (0, 0) is the diorama's centre. */
function place(object: Group | import('three').Mesh, x: number, z: number, y = 0.07): void {
  object.position.set(x, y, z);
  diorama.add(object);
}

place(createPine(3), -2, -2);
place(createPine(7), -1, -2);
place(createBroadleaf(4), -2, -1);
place(createPine(11), 2, -1);
place(createBush(2), -1, -1);
place(createRock(5), 2, 1);
place(createRock(9), -2, 2, 0.07);
place(createGrassTuft(1), 0, -2);
place(createGrassTuft(6), -1, 0);
place(createGrassTuft(8), 1, 2);
place(createGrassTuft(12), -2, 0);
place(createFlower(2), 1, -2);
place(createFlower(5), -1, 1);
place(createFlower(9), 0, 2);

// The factory building on the cleared soil, with the robot beside it.
const smelter = createMachine(geometry, materials, 'smelter');
smelter.setBusy(true);
place(smelter.group, 0, 0);

const robot = createRobot(geometry, materials);
place(robot, 1, 1);

// Framing + turntable --------------------------------------------------------

scene.setTarget(0, 0);
scene.setViewSize(4.2);

let auto = true;
let dragging = false;

app.addEventListener('pointerdown', () => {
  dragging = true;
  auto = false;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});
app.addEventListener('pointermove', (event) => {
  if (dragging) diorama.rotation.y += event.movementX * 0.01;
});

scene.start((delta) => {
  if (auto && !dragging) diorama.rotation.y += delta * 0.25;
  smelter.animate(delta);
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
const dayNight = nightPalette(palette);

// Controls -------------------------------------------------------------------

const bar = document.createElement('div');
bar.style.cssText =
  'position:fixed;left:16px;bottom:16px;display:flex;gap:8px;font-family:var(--font-sans,sans-serif);';
app.appendChild(bar);

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText =
    'padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.25);' +
    'background:rgba(0,0,0,.45);color:#fff;font-size:13px;cursor:pointer;backdrop-filter:blur(4px);';
  btn.addEventListener('click', onClick);
  bar.appendChild(btn);
  return btn;
}

const nightBtn = button('Nacht', () => {
  night = !night;
  scene.applyPalette(night ? dayNight : palette);
  nightBtn.textContent = night ? 'Tag' : 'Nacht';
});

button('Drehen an/aus', () => {
  auto = !auto;
});
