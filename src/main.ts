import './style/index';
import './boot.css';
import { createThemeToggle, initTheme, onThemeChange } from './ui/ThemeToggle';
import { createInitialState, primaryRobot } from './game/GameState';
import { describeInventory } from './game/resources';
import type { CommandContext } from './engine/commands';
import { advanceWorld, craft, drop, mine, move, sell, take, wait } from './engine/commands';
import type { CommandResult, Direction } from './game/types';
import { readPalette } from './render/palette';
import { Scene } from './render/Scene';
import { WorldView } from './render/WorldView';
import type { HoverInfo } from './render/WorldView';
import { CameraControls } from './render/CameraControls';

initTheme();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing from index.html');

/*
 * Phase 2 shell: the viewport plus a debug bar that drives the robot by hand.
 * Phase 3 replaces the buttons with the script runner, Phase 4 the bars with
 * the real HUD.
 */

app.className = 'app';
app.innerHTML = `
  <div class="viewport" id="viewport"></div>
  <div class="bar bar--top">
    <span class="t-label">Credits</span>
    <span class="t-num" id="credits">0</span>
    <span class="bar__sep"></span>
    <span class="t-label">Tick</span>
    <span class="t-num" id="tick">0</span>
    <span class="bar__sep"></span>
    <span class="bar__note" id="carrying">carrying nothing</span>
    <span class="bar__sep"></span>
    <span class="bar__theme"></span>
  </div>
  <div class="bar bar--bottom" id="debug"></div>
  <div class="tiletip" id="tiletip" hidden></div>
`;

app.querySelector('.bar__theme')?.replaceWith(createThemeToggle());

/** The markup above is a constant, so a miss here is a typo, not a runtime case. */
function required<T extends HTMLElement>(selector: string): T {
  const element = app?.querySelector<T>(selector);
  if (!element) throw new Error(`Viewport shell is missing ${selector}`);
  return element;
}

const viewport = required<HTMLDivElement>('#viewport');
const debugBar = required<HTMLDivElement>('#debug');
const creditsOut = required('#credits');
const tickOut = required('#tick');
const carryingOut = required('#carrying');
const tooltip = required('#tiletip');

const state = createInitialState();
const palette = readPalette();

let scene: Scene;
try {
  scene = new Scene({ container: viewport, palette });
} catch (error) {
  app.className = '';
  app.innerHTML = `
    <div class="fallback">
      <div class="panel" style="max-width: 420px">
        <div class="panel__body">
          <h1 class="t-title">This browser cannot start WebGL.</h1>
          <p class="t-prose t-muted">Factory OS renders its floor in 3D and needs WebGL 2.</p>
        </div>
      </div>
    </div>
  `;
  throw error;
}

const worldView = new WorldView(scene, palette);
const controls = new CameraControls(scene);

scene.frameGrid(state.grid.width, state.grid.height);
controls.setBounds(state.grid.width, state.grid.height);
worldView.sync(state);
scene.start((delta) => worldView.update(delta));

// Debug controls --------------------------------------------------------------

/** One command, one tick — the same shape the tick scheduler will use later. */
function run(action: (ctx: CommandContext) => CommandResult): void {
  const robot = primaryRobot(state);
  if (!robot) return;

  state.tick += 1;
  const result = action({ state, robot });
  advanceWorld(state);
  worldView.sync(state);
  paintStatus(result);
}

function paintStatus(result?: CommandResult): void {
  const robot = primaryRobot(state);
  creditsOut.textContent = String(state.credits);
  tickOut.textContent = String(state.tick);

  const carrying = robot ? describeInventory(robot.inventory) : 'nothing';
  const problem = result && !result.ok ? ` — ${result.error}` : '';
  carryingOut.textContent = `carrying ${carrying}${problem}`;
  carryingOut.style.color = problem === '' ? '' : 'var(--danger)';
}

function addButton(label: string, action: (ctx: CommandContext) => CommandResult): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = label;
  button.addEventListener('click', () => run(action));
  debugBar.appendChild(button);
}

function addSeparator(): void {
  const separator = document.createElement('span');
  separator.className = 'bar__sep';
  debugBar.appendChild(separator);
}

const ARROWS: [string, Direction][] = [
  ['N', 'north'],
  ['W', 'west'],
  ['S', 'south'],
  ['E', 'east'],
];
for (const [label, direction] of ARROWS) {
  addButton(label, (ctx) => move(ctx, direction));
}

addSeparator();
addButton('mine', mine);
addButton('drop', drop);
addButton('craft', craft);
addButton('take', take);
addButton('sell', sell);
addButton('wait', () => wait());

addSeparator();

// Walks the robot on its own so the glide and the frame rate can be judged
// without hammering a button at the tick rate.
const autoButton = document.createElement('button');
autoButton.type = 'button';
autoButton.className = 'btn btn--primary';
autoButton.textContent = 'Auto walk';
let autoTimer: number | null = null;
let autoStep = 0;
autoButton.addEventListener('click', () => {
  if (autoTimer !== null) {
    clearInterval(autoTimer);
    autoTimer = null;
    autoButton.textContent = 'Auto walk';
    return;
  }
  autoButton.textContent = 'Stop';
  autoTimer = window.setInterval(() => {
    // A square lap, so every facing and both axes get exercised.
    const direction = ARROWS[Math.floor(autoStep / 4) % 4]?.[1] ?? 'north';
    autoStep += 1;
    run((ctx) => move(ctx, direction));
  }, state.tickRateMs);
});
debugBar.appendChild(autoButton);

// Hover tooltip ---------------------------------------------------------------

worldView.onHover((info) => paintTooltip(info));

function paintTooltip(info: HoverInfo | null): void {
  if (!info) {
    tooltip.hidden = true;
    return;
  }

  tooltip.hidden = false;
  tooltip.textContent = `${info.x},${info.y}  ${describeHoveredTile(info)}`;
}

function describeHoveredTile(info: HoverInfo): string {
  const tile = info.tile;
  switch (tile.kind) {
    case 'ore':
      return `${tile.resource} (${tile.amount})`;
    case 'machine':
      return tile.job === null ? tile.machine : `${tile.machine}, running`;
    case 'market':
      return 'market';
    default:
      return 'floor';
  }
}

viewport.addEventListener('pointermove', (event) => {
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 16}px`;
});

// Theme -----------------------------------------------------------------------

onThemeChange(() => {
  const next = readPalette();
  scene.applyPalette(next);
  worldView.applyPalette(next);
});

paintStatus();
