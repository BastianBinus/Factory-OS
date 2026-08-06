import './style/index';
import './boot.css';
import { createThemeToggle, initTheme, onThemeChange } from './ui/ThemeToggle';
import { createInitialState, primaryRobot, resetWorld } from './game/GameState';
import { unlockedCommands } from './game/progression';
import { describeInventory } from './game/resources';
import { advanceWorld } from './engine/commands';
import { runCommand } from './engine/dispatch';
import { ActionQueue } from './engine/ActionQueue';
import { TickScheduler } from './engine/TickScheduler';
import { ScriptRunner } from './engine/ScriptRunner';
import type { StopReason } from './engine/ScriptRunner';
import type { StateSnapshot } from './worker/protocol';
import { readPalette } from './render/palette';
import { Scene } from './render/Scene';
import { WorldView } from './render/WorldView';
import type { HoverInfo } from './render/WorldView';
import { CameraControls } from './render/CameraControls';
import { CodePanel } from './ui/CodePanel';

initTheme();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing from index.html');

/*
 * Bootstrap. The status bar at the top is still scaffolding — phase 4 turns it
 * into the real HUD with resource pills and the mission tracker.
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
  <div class="bar bar--bottom" id="controls"></div>
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
const controlBar = required<HTMLDivElement>('#controls');
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

// Script, queue and clock ------------------------------------------------------

const queue = new ActionQueue();

/** What the script can read between ticks without spending one. */
function snapshot(): StateSnapshot {
  const robot = primaryRobot(state);
  return {
    x: robot?.x ?? 0,
    y: robot?.y ?? 0,
    facing: robot?.facing ?? 'south',
    inventory: { ...(robot?.inventory ?? {}) },
    credits: state.credits,
    tick: state.tick,
  };
}

const runner = new ScriptRunner({
  onReady(lineNumbers) {
    if (!lineNumbers) {
      codePanel.console.system('This browser hides line numbers from us — errors will not point at a line.');
    }
  },

  onAction(action) {
    // reset() is not something the robot does, so it never waits for a tick —
    // it is answered the moment it arrives, with the fresh world in the reply.
    if (action.command === 'reset') {
      resetFloor('Script reset the floor.');
      runner.resolve(action.id, null, snapshot());
      return;
    }

    const robot = primaryRobot(state);
    if (!robot) return;
    queue.push({
      id: action.id,
      robotId: robot.id,
      command: action.command,
      args: action.args,
      line: action.line,
    });
  },

  onLog(text) {
    codePanel.console.print(text);
  },

  onError(error) {
    codePanel.console.error(error.message, error.line);
  },

  onStopped(reason) {
    scheduler.stop();
    queue.clear();
    paintControls();
    codePanel.console.system(stopMessage(reason));
  },
});

function stopMessage(reason: StopReason): string {
  switch (reason) {
    case 'finished':
      return 'Script finished.';
    case 'timeout':
      return 'Script stopped: it was not performing any actions.';
    case 'error':
      return 'Script stopped after an error.';
    default:
      return 'Script stopped.';
  }
}

const scheduler = new TickScheduler({
  tickRateMs: state.tickRateMs,
  onTick: () => tick(),
});

/**
 * One tick: run at most one action per robot, let the machines advance, then
 * answer the script. The answer goes last so the snapshot it carries already
 * includes everything this tick changed.
 */
function tick(): void {
  state.tick += 1;

  const robot = primaryRobot(state);
  const action = robot ? queue.take(robot.id) : undefined;
  let outcome: { id: number; ok: boolean; value: unknown; error: string } | null = null;

  if (robot && action) {
    const result = runCommand(action.command, { state, robot }, action.args);
    outcome = result.ok
      ? { id: action.id, ok: true, value: result.value, error: '' }
      : { id: action.id, ok: false, value: null, error: result.error };
  }

  advanceWorld(state);
  worldView.sync(state);
  paintStatus();

  if (!outcome) return;
  if (outcome.ok) runner.resolve(outcome.id, outcome.value, snapshot());
  else runner.reject(outcome.id, outcome.error, snapshot());
}

// Controls ---------------------------------------------------------------------

const codePanel = new CodePanel({
  parent: app,
  doc: state.script,
  commands: unlockedCommands(state),
  onChange: (doc) => {
    state.script = doc;
  },
  onRun: () => runScript(),
  onStop: () => stopScript(),
});

const runButton = document.createElement('button');
runButton.type = 'button';
runButton.className = 'btn btn--primary';
runButton.textContent = 'Run';
runButton.title = 'Run the script (Ctrl+Enter)';
runButton.addEventListener('click', () => runScript());

const pauseButton = document.createElement('button');
pauseButton.type = 'button';
pauseButton.className = 'btn';
pauseButton.textContent = 'Pause';
pauseButton.addEventListener('click', () => {
  if (scheduler.isPaused) scheduler.resume();
  else scheduler.pause();
  paintControls();
});

const stopButton = document.createElement('button');
stopButton.type = 'button';
stopButton.className = 'btn';
stopButton.textContent = 'Stop';
stopButton.title = 'Stop the script (Esc)';
stopButton.addEventListener('click', () => stopScript());

const resetButton = document.createElement('button');
resetButton.type = 'button';
resetButton.className = 'btn';
resetButton.textContent = 'Reset';
resetButton.title = 'Put the floor back to the start. Stops a running script.';
resetButton.addEventListener('click', () => {
  // A script mid-run is holding a promise about a world that is about to change
  // under it, so the honest move is to end the run rather than lie to it.
  if (runner.running) runner.stop('user');
  resetFloor('Floor reset.');
});

const codeButton = document.createElement('button');
codeButton.type = 'button';
codeButton.className = 'btn';
codeButton.textContent = 'Code';
codeButton.title = 'Show or hide the editor (E)';
codeButton.addEventListener('click', () => codePanel.toggle());

const separator = document.createElement('span');
separator.className = 'bar__sep';
controlBar.append(runButton, pauseButton, stopButton, separator, resetButton, codeButton);

/**
 * Back to the opening floor, keeping everything the player earned. Whatever was
 * queued belongs to the old world and goes with it.
 */
function resetFloor(note: string): void {
  queue.clear();
  resetWorld(state);
  worldView.sync(state);
  worldView.snapRobots();
  paintStatus();
  codePanel.console.system(note);
}

function runScript(): void {
  queue.clear();
  codePanel.console.system('Run started.');
  runner.start(codePanel.editor.value, unlockedCommands(state), snapshot());
  scheduler.setTickRate(state.tickRateMs);
  scheduler.start();
  paintControls();
}

function stopScript(): void {
  if (!runner.running) {
    scheduler.stop();
    paintControls();
    return;
  }
  runner.stop('user');
}

function paintControls(): void {
  const running = runner.running;
  runButton.disabled = running;
  pauseButton.disabled = !running;
  stopButton.disabled = !running;
  pauseButton.textContent = scheduler.isPaused ? 'Resume' : 'Pause';
}

// Status -----------------------------------------------------------------------

function paintStatus(): void {
  const robot = primaryRobot(state);
  creditsOut.textContent = String(state.credits);
  tickOut.textContent = String(state.tick);
  carryingOut.textContent = `carrying ${robot ? describeInventory(robot.inventory) : 'nothing'}`;
}

// Hover ------------------------------------------------------------------------

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

// Keyboard ---------------------------------------------------------------------

document.addEventListener('keydown', (event) => {
  const target = event.target;
  const typing = target instanceof HTMLElement && target.closest('.cm-editor') !== null;

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    runScript();
    return;
  }

  if (event.key === 'Escape' && !typing) {
    stopScript();
    return;
  }

  // A bare letter must never steal a keystroke from the editor.
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'e') {
    codePanel.toggle();
  }
});

// Theme ------------------------------------------------------------------------

onThemeChange(() => {
  const next = readPalette();
  scene.applyPalette(next);
  worldView.applyPalette(next);
});

paintStatus();
paintControls();
codePanel.console.system('Press E for the editor, then Ctrl+Enter to run.');
