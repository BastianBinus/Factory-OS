import './style/index';
import { Color, Group, type Object3D } from 'three';
import { Scene } from './render/Scene';
import { Thumbnailer } from './render/thumbnailer';
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
 *
 * The chrome follows a dark, editorial "control-room" language: floating pill
 * groups over a deep viewport and a grouped, thumbnailed asset rail — matched
 * from the Claude Design mock (`Showroom Nachbau`).
 */

// The showroom is always dark, whatever the game theme is — the 3D palette reads
// the dark --w-* tokens so the viewport background sits at #0b0e13 like the mock.
document.documentElement.dataset['theme'] = 'dark';

const app = document.createElement('div');
app.style.cssText = 'position:fixed;inset:0;overflow:hidden;';
document.body.style.margin = '0';
document.body.style.background = '#0b0e13';
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
// `group` is the section it lives under in the asset rail.
interface Entry {
  name: string;
  group: string;
  make: () => Object3D;
  ground?: boolean;
}

const ASSETS: Entry[] = [
  { group: 'Böden', name: 'Boden — Wiese', make: () => createGroundTile(NATURE.grass), ground: true },
  { group: 'Böden', name: 'Boden — Erde', make: () => createGroundTile(NATURE.soil), ground: true },
  { group: 'Böden', name: 'Boden — Sand', make: () => createGroundTile(NATURE.sand), ground: true },
  { group: 'Böden', name: 'Boden — Fels', make: () => createGroundTile(NATURE.rock), ground: true },
  { group: 'Böden', name: 'Boden — Wasser', make: () => waterAsset(), ground: true },
  { group: 'Natur', name: 'Nadelbaum', make: () => createPine(3) },
  { group: 'Natur', name: 'Laubbaum', make: () => createBroadleaf(4) },
  { group: 'Natur', name: 'Fels', make: () => createRock(5) },
  { group: 'Natur', name: 'Grasbüschel', make: () => createGrassTuft(1) },
  { group: 'Natur', name: 'Busch', make: () => createBush(2) },
  { group: 'Natur', name: 'Blume', make: () => createFlower(2) },
  { group: 'Tiles', name: 'Tile — Wald (3 Bäume)', make: () => createForestTile(3), ground: true },
  { group: 'Tiles', name: 'Tile — Wiese', make: () => createMeadowTile(2), ground: true },
  { group: 'Tiles', name: 'Tile — Hain', make: () => createGroveTile(1), ground: true },
  { group: 'Tiles', name: 'Tile — Fels-Cluster', make: () => createRockClusterTile(4), ground: true },
  { group: 'Produktion', name: 'Smelter', make: () => machineMesh('smelter') },
  { group: 'Produktion', name: 'Assembler', make: () => machineMesh('assembler') },
  { group: 'Produktion', name: 'Foundry', make: () => machineMesh('foundry') },
  { group: 'Produktion', name: 'Seeder', make: () => machineMesh('seeder') },
  { group: 'Produktion', name: 'Refinery', make: () => machineMesh('refinery') },
  { group: 'Produktion', name: 'Press', make: () => machineMesh('press') },
  { group: 'Logistik', name: 'Belt', make: () => createBelt(geometry, materials, 'east') },
  { group: 'Logistik', name: 'Wand', make: () => createWall(geometry, materials) },
  { group: 'Logistik', name: 'Roboter', make: () => createRobot(geometry, materials) },
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

  singleLabel.textContent =
    `${String(index + 1).padStart(2, '0')}/${ASSETS.length}  ·  ${entry.name}`;
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

// Random grid ----------------------------------------------------------------

/**
 * A quick "what does a patch of world look like" roll: a square grid where each
 * cell is a randomly chosen tile on a fresh random seed. Re-rolls every call.
 */
function buildRandom(): void {
  clearStage();
  const N = 6;
  const makers: ((seed: number) => Object3D)[] = [
    (s) => createForestTile(s),
    (s) => createMeadowTile(s),
    (s) => createGroveTile(s),
    (s) => createRockClusterTile(s),
    () => waterAsset(),
    (s) => {
      const g = new Group();
      g.add(createGroundTile(NATURE.grass));
      const prop = s % 2 ? createBush(s) : createRock(s);
      prop.position.set(0, 0.07, 0);
      prop.scale.multiplyScalar(0.72);
      g.add(prop);
      return g;
    },
  ];

  for (let z = 0; z < N; z += 1) {
    for (let x = 0; x < N; x += 1) {
      const make = makers[Math.floor(Math.random() * makers.length)]!;
      const tile = make(Math.floor(Math.random() * 9999) + 1);
      tile.position.set(x - (N - 1) / 2, 0, z - (N - 1) / 2);
      stage.add(tile);
    }
  }

  scene.setTarget(0, 0);
  scene.setViewSize(5.4);
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
  night.sky = new Color(0x0a0d1a);
  night.floor = new Color(0x141826);
  night.shadow = 0.5;
  return night;
}

let night = false;
const dark = nightPalette(palette);

// Chrome ---------------------------------------------------------------------
// The design language, matched from the mock: dark surfaces, hairline #262c36
// borders, floating blurred pill groups, and a single yellow accent.

const C = {
  border: '#262c36',
  borderStrong: '#39414e',
  surface: '#151922',
  surface2: '#1c2029',
  glass: 'rgba(21,25,34,.88)',
  text: '#e6e9ef',
  muted: '#8a93a2',
  faint: '#5d6674',
  accent: '#f2c12e',
  ease: '120ms cubic-bezier(.2,.7,.3,1)',
} as const;

const style = document.createElement('style');
style.textContent = `
  .sr-group {
    display: inline-flex; align-items: center; gap: 4px; padding: 4px;
    border: 1px solid ${C.border}; border-radius: 999px; background: ${C.glass};
    backdrop-filter: blur(12px);
  }
  .sr-group--top { box-shadow: 0 4px 16px rgb(0 0 0 / .45); }
  .sr-group--float { box-shadow: 0 16px 48px rgb(0 0 0 / .6); pointer-events: auto; }

  .sr-pill {
    padding: 6px 14px; border: 1px solid transparent; border-radius: 999px;
    background: transparent; color: ${C.muted};
    font: 600 12px var(--font-ui); letter-spacing: -.01em; white-space: nowrap;
    cursor: pointer; transition: all ${C.ease};
  }
  .sr-pill:hover { background: ${C.surface2}; color: ${C.text}; }
  .sr-pill.is-active { background: ${C.surface2}; color: ${C.text}; }

  .sr-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border: 1px solid transparent; border-radius: 999px;
    background: transparent; color: ${C.muted}; font-size: 15px; line-height: 1;
    cursor: pointer; transition: all ${C.ease};
  }
  .sr-icon:hover { background: ${C.surface2}; color: ${C.text}; }

  .sr-single {
    padding: 0 12px; color: ${C.muted};
    font: 500 11px/30px var(--font-mono); letter-spacing: .04em; white-space: nowrap;
  }
  .sr-sep { width: 1px; align-self: stretch; margin: 0 4px; background: ${C.border}; }

  .sr-panel {
    position: fixed; right: 20px; top: 20px; bottom: 20px; width: 288px;
    display: flex; flex-direction: column;
    border: 1px solid ${C.border}; border-radius: 14px; background: ${C.glass};
    backdrop-filter: blur(12px); box-shadow: 0 16px 48px rgb(0 0 0 / .6);
    overflow: hidden; font-family: var(--font-ui);
  }
  .sr-panel__head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding: 12px 14px 10px; border-bottom: 1px solid ${C.border};
  }
  .sr-panel__title { color: ${C.text}; font-size: 12px; font-weight: 600; letter-spacing: -.01em; }
  .sr-panel__meta { color: ${C.faint}; font: 500 10px var(--font-mono); letter-spacing: .08em; }

  .sr-grid {
    display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: min-content;
    gap: 8px; padding: 12px; overflow-y: auto; scroll-behavior: smooth;
  }
  .sr-grid::-webkit-scrollbar { width: 8px; }
  .sr-grid::-webkit-scrollbar-track { background: transparent; }
  .sr-grid::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 999px; }
  .sr-grid::-webkit-scrollbar-thumb:hover { background: ${C.borderStrong}; }

  .sr-section {
    grid-column: 1 / -1; display: flex; align-items: baseline; gap: 8px;
    padding: 6px 2px 0; color: ${C.faint};
    font: 600 9.5px var(--font-mono); letter-spacing: .14em; text-transform: uppercase;
  }
  .sr-section__rule { flex: 1; height: 1px; background: ${C.border}; }

  .sr-asset {
    display: flex; flex-direction: column; gap: 7px; padding: 7px;
    border-left: 2px solid transparent;
    border-top: 1px solid ${C.border}; border-right: 1px solid ${C.border};
    border-bottom: 1px solid ${C.border}; border-radius: 8px;
    background: ${C.surface}; cursor: pointer; box-shadow: 0 1px 2px rgb(0 0 0 / .4);
    transition: all ${C.ease};
  }
  .sr-asset:hover { border-color: ${C.borderStrong}; background: ${C.surface2}; }
  .sr-asset.is-active { border-left-color: ${C.accent}; background: ${C.surface2}; }

  @keyframes srShimmer { 0% { background-position: -160px 0; } 100% { background-position: 160px 0; } }
  .sr-thumb {
    display: flex; align-items: flex-end; padding: 6px; aspect-ratio: 1;
    border-radius: 4px; border: 1px solid ${C.border};
    background: linear-gradient(90deg, ${C.surface} 0%, ${C.surface2} 50%, ${C.surface} 100%);
    background-size: 320px 100%; animation: srShimmer 1.1s linear infinite;
    color: ${C.faint}; font: 500 8.5px/1.2 var(--font-mono);
    letter-spacing: .06em; text-transform: uppercase; overflow: hidden;
  }
  .sr-thumb.is-loaded {
    background-color: #12151c; background-repeat: no-repeat;
    background-position: center; background-size: cover; animation: none;
  }
  .sr-asset__label {
    display: block; padding: 0 2px; color: ${C.muted};
    font: 600 10.5px/1.25 var(--font-ui); letter-spacing: -.01em; text-align: left;
  }
  .sr-asset.is-active .sr-asset__label { color: ${C.text}; }
`;
document.head.appendChild(style);

// Tab bar (top-left) ---------------------------------------------------------

type Tab = 'Diorama' | 'Einzeln' | 'Variationen' | 'Zufall';

const tabbar = document.createElement('div');
tabbar.className = 'sr-group sr-group--top';
tabbar.style.cssText += ';position:fixed;left:20px;top:20px;';
app.appendChild(tabbar);

const tabButtons: Record<Tab, HTMLButtonElement> = {} as Record<Tab, HTMLButtonElement>;
for (const name of ['Diorama', 'Einzeln', 'Variationen', 'Zufall'] as Tab[]) {
  const btn = document.createElement('button');
  btn.className = 'sr-pill';
  btn.textContent = name;
  btn.addEventListener('click', () => setTab(name));
  tabbar.appendChild(btn);
  tabButtons[name] = btn;
}

// Control bar (bottom, centred in the free space left of the panel) ----------

const bottomWrap = document.createElement('div');
bottomWrap.style.cssText =
  'position:fixed;left:20px;right:20px;bottom:28px;display:flex;justify-content:center;' +
  'pointer-events:none;';
app.appendChild(bottomWrap);

const controls = document.createElement('div');
controls.className = 'sr-group sr-group--float';
bottomWrap.appendChild(controls);

const prev = document.createElement('button');
prev.className = 'sr-icon';
prev.setAttribute('aria-label', 'Zurück');
prev.textContent = '‹';
prev.addEventListener('click', () => {
  index = (index - 1 + ASSETS.length) % ASSETS.length;
  buildSingle();
});

const singleLabel = document.createElement('span');
singleLabel.className = 'sr-single';

const nextBtn = document.createElement('button');
nextBtn.className = 'sr-icon';
nextBtn.setAttribute('aria-label', 'Weiter');
nextBtn.textContent = '›';
nextBtn.addEventListener('click', () => {
  index = (index + 1) % ASSETS.length;
  buildSingle();
});

const sep = document.createElement('span');
sep.className = 'sr-sep';

const nightBtn = document.createElement('button');
nightBtn.className = 'sr-pill';
nightBtn.addEventListener('click', () => {
  night = !night;
  scene.applyPalette(night ? dark : palette);
  updateControls();
});

const spinBtn = document.createElement('button');
spinBtn.className = 'sr-pill';
spinBtn.addEventListener('click', () => {
  auto = !auto;
  updateControls();
});

// Only shown on the Zufall tab — re-rolls the random grid in place.
const diceBtn = document.createElement('button');
diceBtn.className = 'sr-pill';
diceBtn.textContent = '⚄ Würfeln';
diceBtn.addEventListener('click', () => buildRandom());

controls.append(prev, singleLabel, nextBtn, sep, nightBtn, spinBtn, diceBtn);

function updateControls(): void {
  nightBtn.textContent = night ? 'Tag' : 'Nacht';
  nightBtn.classList.toggle('is-active', night);
  spinBtn.textContent = auto ? 'Drehen · An' : 'Drehen · Aus';
  spinBtn.classList.toggle('is-active', auto);
}

// Asset rail (right, single-asset browser only) ------------------------------

const panel = document.createElement('div');
panel.className = 'sr-panel';
app.appendChild(panel);

const panelHead = document.createElement('div');
panelHead.className = 'sr-panel__head';
const panelTitle = document.createElement('span');
panelTitle.className = 'sr-panel__title';
panelTitle.textContent = 'Assets';
const panelMeta = document.createElement('span');
panelMeta.className = 'sr-panel__meta';
panelHead.append(panelTitle, panelMeta);
panel.appendChild(panelHead);

function updateMeta(): void {
  panelMeta.textContent =
    `${String(loaded.size).padStart(2, '0')}/${ASSETS.length} geladen`;
}

const gridEl = document.createElement('div');
gridEl.className = 'sr-grid';
panel.appendChild(gridEl);

/** A short thumbnail caption: drop the "Boden — " / "Tile — " prefix. */
function shortLabel(name: string): string {
  return name.replace(/^(Boden|Tile) — /, '');
}

/** The same composition the single view shows: bare props get a grass tile. */
function composed(entry: Entry): Object3D {
  const object = entry.make();
  if (entry.ground) return object;
  const group = new Group();
  group.add(createGroundTile(NATURE.grass));
  object.position.y = 0.07;
  group.add(object);
  return group;
}

// Real per-asset previews, rendered off-screen and lazily as cards scroll in.
const thumbnailer = new Thumbnailer(160);
const thumbEls: HTMLElement[] = new Array(ASSETS.length);
const loaded = new Set<number>();
const queued = new Set<number>();
const queue: number[] = [];

// Render one thumbnail per tick so a scroll never renders a dozen at once.
let draining = false;
function drain(): void {
  const i = queue.shift();
  if (i === undefined) {
    draining = false;
    return;
  }
  draining = true;
  const thumb = thumbEls[i];
  const entry = ASSETS[i];
  if (thumb && entry && !loaded.has(i)) {
    thumb.style.backgroundImage = `url(${thumbnailer.render(composed(entry))})`;
    thumb.textContent = '';
    thumb.classList.add('is-loaded');
    loaded.add(i);
    updateMeta();
  }
  setTimeout(drain, 60);
}

function enqueueThumb(i: number): void {
  if (loaded.has(i) || queued.has(i)) return;
  queued.add(i);
  queue.push(i);
  if (!draining) drain();
}

const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      thumbObserver.unobserve(entry.target);
      enqueueThumb(Number((entry.target as HTMLElement).dataset['idx']));
    }
  },
  { root: gridEl, rootMargin: '140px 0px' },
);

// Build the grouped rail once — the catalogue is static, only selection changes.
const gridButtons: HTMLButtonElement[] = new Array(ASSETS.length);
let seen = '';
ASSETS.forEach((entry, i) => {
  if (entry.group !== seen) {
    seen = entry.group;
    const count = ASSETS.filter((a) => a.group === entry.group).length;
    const section = document.createElement('div');
    section.className = 'sr-section';
    section.innerHTML =
      `<span>${entry.group}</span>` +
      `<span class="sr-section__rule"></span>` +
      `<span>${String(count).padStart(2, '0')}</span>`;
    gridEl.appendChild(section);
  }

  const btn = document.createElement('button');
  btn.className = 'sr-asset';

  const thumb = document.createElement('span');
  thumb.className = 'sr-thumb';
  thumb.dataset['idx'] = String(i);
  thumb.textContent = shortLabel(entry.name);

  const nameEl = document.createElement('span');
  nameEl.className = 'sr-asset__label';
  nameEl.textContent = entry.name;

  btn.append(thumb, nameEl);
  btn.addEventListener('click', () => {
    index = i;
    buildSingle();
  });
  gridEl.appendChild(btn);
  gridButtons[i] = btn;
  thumbEls[i] = thumb;
  thumbObserver.observe(thumb);
});

updateMeta();

/** Mark the active asset in the rail and scroll it into view. */
function highlightGrid(): void {
  gridButtons.forEach((btn, i) => {
    const active = i === index;
    btn.classList.toggle('is-active', active);
    if (active) btn.scrollIntoView({ block: 'nearest' });
  });
}

// Tab switching --------------------------------------------------------------

function setTab(next: Tab): void {
  for (const [name, btn] of Object.entries(tabButtons))
    btn.classList.toggle('is-active', name === next);

  const isSingle = next === 'Einzeln';
  // The stepper (‹ label ›, separator) and the asset rail belong to the browser.
  prev.style.display = isSingle ? '' : 'none';
  singleLabel.style.display = isSingle ? '' : 'none';
  nextBtn.style.display = isSingle ? '' : 'none';
  sep.style.display = isSingle ? '' : 'none';
  panel.style.display = isSingle ? 'flex' : 'none';
  diceBtn.style.display = next === 'Zufall' ? '' : 'none';
  // Keep the control bar centred in the space left of the open rail.
  bottomWrap.style.paddingRight = isSingle ? '308px' : '0px';

  auto = next !== 'Variationen';
  updateControls();

  if (next === 'Diorama') buildDiorama();
  else if (isSingle) buildSingle();
  else if (next === 'Variationen') buildVariations();
  else buildRandom();
}

setTab('Diorama');
