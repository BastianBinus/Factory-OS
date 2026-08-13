import './style/index';
import './boot.css';
import { initTheme, onThemeChange } from './ui/ThemeToggle';
import { ONBOARDING_DONE, primaryRobot, resetWorld } from './game/GameState';
import type { GameState, GroundTile, UnlockId } from './game/types';
import { buyUnlock, getUnlock, unlockedCommands } from './game/progression';
import { cloudConcepts, markConceptSeen, unseenConcepts } from './game/concepts';
import { loadOrCreate, localSavedAt, saveGame } from './game/saveLoad';
import { isCloudConfigured } from './cloud/supabaseClient';
import { currentEmail } from './cloud/session';
import { pushSave } from './cloud/saveApi';
import { syncWithCloud } from './cloud/sync';
import { advanceWorld } from './engine/commands';
import { recordSample } from './game/rates';
import { runCommand } from './engine/dispatch';
import { ActionQueue } from './engine/ActionQueue';
import { TickScheduler } from './engine/TickScheduler';
import { ScriptRunner } from './engine/ScriptRunner';
import type { StopReason } from './engine/ScriptRunner';
import { Fleet } from './engine/Fleet';
import { explainError } from './engine/errorHints';
import type { StateSnapshot } from './worker/protocol';
import { readPalette } from './render/palette';
import { Scene } from './render/Scene';
import { WorldView } from './render/WorldView';
import type { HoverInfo } from './render/WorldView';
import { CameraControls } from './render/CameraControls';
import { AuthPanel } from './ui/AuthPanel';
import { CodePanel } from './ui/CodePanel';
import { ConceptPanel } from './ui/ConceptPanel';
import { ConflictDialog } from './ui/ConflictDialog';
import { Controls } from './ui/Controls';
import { GuideBar } from './ui/GuideBar';
import { Hud } from './ui/Hud';
import { MissionPanel } from './ui/MissionPanel';
import { RatesPanel } from './ui/RatesPanel';
import { Onboarding } from './ui/Onboarding';
import { ShopPanel } from './ui/ShopPanel';
import { Toasts } from './ui/Toast';

initTheme();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing from index.html');

/*
 * Bootstrap. Everything visible is built here and wired to three things: the
 * game state, the tick scheduler, and the worker the player's script runs in.
 */

app.className = 'app';
app.innerHTML = `
  <div class="viewport" id="viewport"></div>
  <div class="topstack" id="topstack"></div>
  <div class="tiletip" id="tiletip" hidden></div>
`;

/** The markup above is a constant, so a miss here is a typo, not a runtime case. */
function required<T extends HTMLElement>(selector: string): T {
  const element = app?.querySelector<T>(selector);
  if (!element) throw new Error(`Viewport shell is missing ${selector}`);
  return element;
}

const viewport = required<HTMLDivElement>('#viewport');
const topStack = required('#topstack');
const tooltip = required('#tiletip');

// A save that cannot be read must never block the game: loadOrCreate always
// hands back something playable, and the reason is reported in the console once
// the console exists.
const { state, result: loadResult } = loadOrCreate();
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
const cameraControls = new CameraControls(scene);

scene.frameGrid(state.grid.width, state.grid.height);
cameraControls.setBounds(state.grid.width, state.grid.height);
worldView.sync(state);
scene.start((delta) => worldView.update(delta));

// Script, queue and clock ------------------------------------------------------

const queue = new ActionQueue();

/** What the script in one robot's worker can read between ticks. */
function snapshotOf(robotId: string): StateSnapshot {
  const index = state.robots.findIndex((entry) => entry.id === robotId);
  const robot = index === -1 ? undefined : state.robots[index];
  return {
    robotId,
    index: Math.max(index, 0),
    x: robot?.x ?? 0,
    y: robot?.y ?? 0,
    facing: robot?.facing ?? 'south',
    inventory: { ...(robot?.inventory ?? {}) },
    tick: state.tick,
  };
}

/** How a robot is named in the console, once there is more than one of them. */
function robotLabel(robotId: string): string {
  const index = state.robots.findIndex((entry) => entry.id === robotId);
  return `robot ${Math.max(index, 0) + 1}`;
}

/** Only worth saying once per run, no matter how many workers report it. */
let lineNumbersReported = false;

/**
 * The line each robot is on right now. Kept here rather than in the editor
 * because a robot that stops mid-run has to lose its mark without disturbing
 * the others.
 */
const runningLines = new Map<string, number>();

function markRunningLine(robotId: string, line: number | null): void {
  if (line === null) runningLines.delete(robotId);
  else runningLines.set(robotId, line);
  codePanel.editor.setRunningLines([...runningLines.values()]);
}

const fleet = new Fleet({
  createRunner: (_robotId, handlers) => new ScriptRunner(handlers),

  handlers: {
    onReady(_robotId, lineNumbers) {
      if (lineNumbers || lineNumbersReported) return;
      lineNumbersReported = true;
      codePanel.console.system('This browser hides line numbers from us — errors will not point at a line.');
    },

    onAction(robotId, action) {
      // reset() is not something the robot does, so it never waits for a tick —
      // it is answered the moment it arrives, with the fresh world in the reply.
      if (action.command === 'reset') {
        resetFromScript(robotId, action.id, action.line);
        return;
      }

      queue.push({
        id: action.id,
        robotId,
        command: action.command,
        args: action.args,
        line: action.line,
      });
    },

    onLog(robotId, text, line) {
      // print() costs no tick, so this is the only moment its line is the live one.
      markRunningLine(robotId, line);
      codePanel.console.print(prefixed(robotId, text));
    },

    onError(robotId, error) {
      reportError(error, robotId);
    },

    onIdle(reason) {
      scheduler.stop();
      queue.clear();
      runningLines.clear();
      codePanel.editor.setRunningLines([]);
      controls.update({ running: false, paused: false });
      codePanel.console.system(stopMessage(reason));
    },
  },
});

/** Says who is talking, but only while there is someone to confuse them with. */
function prefixed(robotId: string, text: string): string {
  return state.robots.length > 1 ? `[${robotLabel(robotId)}] ${text}` : text;
}

const RESET_REFUSED =
  'reset() may only be called by robot 1. Every robot runs this same script, so the others ' +
  'would reset the floor a second time in the same tick. Guard it with me().index === 0.';

/**
 * A reset asked for by the script. Refused for everyone but the first robot,
 * with a sentence that says what to write instead — a silent no-op would look
 * like reset() being broken.
 */
function resetFromScript(robotId: string, actionId: number, line: number | null): void {
  if (primaryRobot(state)?.id !== robotId) {
    fleet.reject(robotId, actionId, RESET_REFUSED, snapshotOf(robotId));
    return;
  }

  markRunningLine(robotId, line);
  resetFloor('Script reset the floor.');
  fleet.resolve(robotId, actionId, null, snapshotOf(robotId));
}

/**
 * A raw engine error becomes a sentence the player can act on, in the console
 * where it can be re-read — and, if the editor is closed, as a toast, because a
 * script that stopped for a reason nobody saw is the worst version of this.
 */
function reportError(
  error: { name: string; message: string; line: number | null },
  robotId?: string,
): void {
  const hint = explainError(error, unlockedCommands(state));
  const message = robotId === undefined ? hint.message : prefixed(robotId, hint.message);
  codePanel.console.error(message, hint.line, hint.detail);
  if (!codePanel.isOpen) toasts.show(message, hint.detail, 'error');
}

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

  const outcomes: { robotId: string; id: number; ok: boolean; value: unknown; error: string }[] = [];

  // Array order, always: with two robots reaching for the same ore, the tick
  // that decides who gets it has to be the same one every time.
  for (const robot of state.robots) {
    const action = queue.take(robot.id);
    if (!action) continue;

    // The highlight moves as the action runs, which is what makes it read as a
    // program stepping rather than a robot wandering.
    markRunningLine(robot.id, action.line);
    const result = runCommand(action.command, { state, robot }, action.args);
    outcomes.push(
      result.ok
        ? { robotId: robot.id, id: action.id, ok: true, value: result.value, error: '' }
        : { robotId: robot.id, id: action.id, ok: false, value: null, error: result.error },
    );
  }

  advanceWorld(state);
  recordSample(state);
  worldView.sync(state);
  paintStatus();
  renderPanels();
  scheduleSave();

  // Answered last, and only after every robot has moved, so the snapshot each
  // script wakes up with already contains what its neighbours did this tick.
  for (const outcome of outcomes) {
    const snapshot = snapshotOf(outcome.robotId);
    if (outcome.ok) fleet.resolve(outcome.robotId, outcome.id, outcome.value, snapshot);
    else fleet.reject(outcome.robotId, outcome.id, outcome.error, snapshot);
  }
}

// Shell ------------------------------------------------------------------------

const hud = new Hud({ parent: topStack });
const guide = new GuideBar({ parent: topStack, onOpen: () => missions.setOpen(true) });
const toasts = new Toasts({ parent: app });
const conceptPanel = new ConceptPanel({ parent: app });
const conflictDialog = new ConflictDialog({ parent: app });

const authPanel = new AuthPanel({
  parent: app,
  onSignedIn: (email) => {
    paintAccount(email);
    codePanel.console.system(`Signed in as ${email}.`);
    // The lesson waits for the sync: a conflict question first, then the reading.
    void syncNow().then(() => showCloudConcepts());
  },
  onSignedOut: () => {
    paintAccount(null);
    // The factory itself is untouched: it lives in this browser too, and always did.
    codePanel.console.system('Signed out. This browser keeps its own save.');
  },
  onSync: () => void syncNow(),
});

const codePanel = new CodePanel({
  parent: app,
  doc: state.script,
  commands: unlockedCommands(state),
  onChange: (doc) => {
    state.script = doc;
    checkOnboarding();
    scheduleSave();
  },
  onRun: () => runScript(),
  onStop: () => stopScript(),
  onToggle: (open) => onPanelToggle('code', open),
});

const shop = new ShopPanel({
  parent: app,
  onBuy: (id) => buy(id),
  onToggle: (open) => onPanelToggle('shop', open),
});

const missions = new MissionPanel({
  parent: app,
  onToggle: (open) => onPanelToggle('missions', open),
  // A re-read is not an announcement, so it opens without the "new" label.
  onOpenConcept: (concept) => conceptPanel.show(concept, false),
});

const rates = new RatesPanel({
  parent: app,
  onToggle: (open) => onPanelToggle('rates', open),
});

/**
 * The overlays share one slot on the right, so opening one closes the others.
 * Two of them at once would leave nothing of the factory visible, and watching
 * the factory is the reason the panels are overlays in the first place.
 */
function onPanelToggle(source: 'code' | 'shop' | 'missions' | 'rates', open: boolean): void {
  if (open) {
    if (source !== 'code') codePanel.setOpen(false);
    if (source !== 'shop') shop.setOpen(false);
    if (source !== 'missions') missions.setOpen(false);
    if (source !== 'rates') rates.setOpen(false);
    renderPanels();
    if (source === 'code') checkOnboarding();
  }
  // Read from the DOM rather than the panels: this also runs while they are
  // still being constructed, and it cannot fall out of sync with them.
  const anyOpen = app?.querySelector('.codepanel--open, .drawer--open') != null;
  app?.classList.toggle('app--panel-open', anyOpen);
}

function renderPanels(): void {
  if (shop.isOpen) shop.render(state);
  if (missions.isOpen) missions.render(state);
  if (rates.isOpen) rates.render(state);
}

/** The two readouts that answer "how am I doing" — kept in step, always. */
function paintStatus(): void {
  hud.update(state);
  guide.update(state);
}

// Guidance ---------------------------------------------------------------------

const onboarding = new Onboarding({
  parent: app,
  step: state.onboardingStep,
  onChange: (step) => {
    state.onboardingStep = step;
    // Getting through the tutorial and then being asked to do it again after a
    // reload would be the single most annoying bug this file could have.
    saveNow();
    paintStatus();
    if (step >= ONBOARDING_DONE) showNewConcepts();
  },
});

/** Whether the player has ever pressed Run — the last thing the tutorial waits for. */
let ranScript = false;

function checkOnboarding(): void {
  onboarding.check({ editorOpen: codePanel.isOpen, script: state.script, ranScript });
}

/**
 * Opens the panel for every concept the player has reached but never had
 * explained. Held back until the tutorial is over, because the tutorial owns the
 * first one — `await` is reached from the very first tick, and a modal on top of
 * a step-one instruction would be two teachers talking at once.
 */
function showNewConcepts(): void {
  if (!onboarding.done) return;

  for (const concept of unseenConcepts(state)) {
    markConceptSeen(state, concept.id);
    conceptPanel.show(concept);
  }

  if (cloudLessonsPending) showCloudConcepts();
}

/** Set when someone signs in mid-tutorial: the lesson is owed, just not yet. */
let cloudLessonsPending = false;

/**
 * What signing in teaches. Held back during the tutorial for the same reason
 * every other concept is — step one of learning to move a robot is no place for
 * four panels about HTTP.
 */
function showCloudConcepts(): void {
  if (!onboarding.done) {
    cloudLessonsPending = true;
    return;
  }

  cloudLessonsPending = false;
  for (const concept of cloudConcepts()) {
    if (state.seenConcepts.includes(concept.id)) continue;
    markConceptSeen(state, concept.id);
    conceptPanel.show(concept);
  }
}

const controls = new Controls({
  parent: app,
  onRun: () => runScript(),
  onPause: () => {
    if (scheduler.isPaused) scheduler.resume();
    else scheduler.pause();
    controls.update({ running: fleet.running, paused: scheduler.isPaused });
  },
  onStop: () => stopScript(),
  onReset: () => {
    // A script mid-run is holding a promise about a world that is about to change
    // under it, so the honest move is to end the run rather than lie to it.
    if (fleet.running) fleet.stop('user');
    resetFloor('Floor reset.');
  },
  onCode: () => codePanel.toggle(),
});

controls.addButton('Shop', 'Spend resources on commands and upgrades', () => shop.toggle());
controls.addButton('Tech tree', 'The upgrade graph and what each node teaches', () => missions.toggle());
controls.addButton('Throughput', 'Output per stage, and where the line is starved', () => rates.toggle());

const accountButton = controls.addButton('Sign in', 'Keep this factory across browsers', () =>
  authPanel.toggle(),
);

/**
 * Empties the queue and tells every script that was waiting on it why. Silence
 * would be worse than an error: a robot awaiting an answer that never comes does
 * not even trip the watchdog, because as far as it knows it is waiting on us.
 */
function dropQueued(message: string): void {
  for (const action of queue.drain()) {
    fleet.reject(action.robotId, action.id, message, snapshotOf(action.robotId));
  }
}

/**
 * Back to the opening floor, keeping everything the player earned. Whatever was
 * queued belongs to the old world and goes with it.
 */
function resetFloor(note: string): void {
  dropQueued('The floor was reset while this action was waiting.');
  resetWorld(state);
  worldView.sync(state);
  worldView.snapRobots();
  paintStatus();
  renderPanels();
  scheduleSave();
  codePanel.console.system(note);
}

// Progression ------------------------------------------------------------------

function buy(id: UnlockId): void {
  const result = buyUnlock(state, id);
  if (!result.ok) {
    // The card was already disabled, so this only fires when the state moved
    // between paint and click. Saying why is cheaper than leaving it silent.
    toasts.show('Not available yet', result.message, 'error');
    shop.render(state);
    return;
  }

  announceUnlock(id);
  applyProgress();
}

function announceUnlock(id: UnlockId): void {
  const unlock = getUnlock(id);
  if (!unlock) return;

  const commands = unlock.commands ?? [];
  const detail = commands.length
    ? `${commands.map((command) => `${command}()`).join(', ')} now works in the editor.`
    : unlock.description;

  codePanel.console.system(`Unlocked: ${unlock.label}`);
  toasts.show(`Unlocked: ${unlock.label}`, detail, 'success');
}

/** Width, height and robot count — the things a rebuild of the scene depends on. */
function worldShape(): string {
  return `${state.grid.width}x${state.grid.height}x${state.robots.length}`;
}

let lastShape = worldShape();

/**
 * Everything an unlock can change outside the state object itself. WorldView
 * notices a new grid on its own, but the camera framing and the tick clock live
 * outside it and have to be told.
 */
function applyProgress(): void {
  codePanel.editor.setCommands(unlockedCommands(state));
  scheduler.setTickRate(state.tickRateMs);

  const shape = worldShape();
  if (shape !== lastShape) {
    lastShape = shape;
    scene.frameGrid(state.grid.width, state.grid.height);
    cameraControls.setBounds(state.grid.width, state.grid.height);
    worldView.sync(state);
    // A new robot, or a robot on a rebuilt floor, has no previous position to
    // glide from — animating one would show a journey it never made.
    worldView.snapRobots();
  }

  paintStatus();
  renderPanels();
  showNewConcepts();
  saveNow();
}

// Saving -------------------------------------------------------------------------

/** Long enough that a fast tick rate does not serialise the grid every frame. */
const SAVE_DELAY_MS = 1000;
let saveTimer: number | null = null;

function scheduleSave(): void {
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    saveGame(state);
    scheduleCloudSave();
  }, SAVE_DELAY_MS);
}

/** For the moments worth losing nothing over: an unlock, a mission, leaving. */
function saveNow(): void {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveGame(state);
  pushCloudNow();
}

window.addEventListener('beforeunload', () => saveNow());

// Cloud --------------------------------------------------------------------------

/**
 * Signing in adds a copy of the save; it never becomes the only one. Every write
 * below happens after the local save, and every read is filtered through the same
 * conflict rules, so the worst a broken network can do is leave the cloud behind.
 * The game itself does not notice either way.
 */

/** Long, because this is a network round trip and not a string in localStorage. */
const CLOUD_SAVE_DELAY_MS = 20_000;

let signedInAs: string | null = null;
let cloudTimer: number | null = null;

function paintAccount(email: string | null): void {
  signedInAs = email;
  authPanel.setEmail(email);
  accountButton.textContent = email === null ? 'Sign in' : 'Account';
  accountButton.title = email === null ? 'Keep this factory across browsers' : `Signed in as ${email}`;
}

function scheduleCloudSave(): void {
  if (signedInAs === null || cloudTimer !== null) return;
  cloudTimer = window.setTimeout(() => {
    cloudTimer = null;
    // Silent on failure on purpose: this fires on a timer the player never asked
    // for, and a toast about the network every twenty seconds helps nobody.
    void pushSave(state);
  }, CLOUD_SAVE_DELAY_MS);
}

/** The moments worth a round trip immediately: an unlock, a mission, leaving. */
function pushCloudNow(): void {
  if (signedInAs === null) return;
  if (cloudTimer !== null) {
    window.clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  void pushSave(state).then((result) => {
    if (!result.ok) codePanel.console.error('The cloud save was refused.', null, result.message);
  });
}

async function syncNow(): Promise<void> {
  if (signedInAs === null) return;

  const outcome = await syncWithCloud({
    state,
    localSavedAt: localSavedAt(),
    ask: (local, cloud) => conflictDialog.ask(local, cloud),
    adopt: (next) => adoptCloudSave(next),
  });

  switch (outcome.kind) {
    case 'failed':
      toasts.show('Cloud sync failed', outcome.message, 'error');
      codePanel.console.error('Cloud sync failed.', null, outcome.message);
      return;
    case 'adopted':
      toasts.show('Cloud save loaded', 'This browser now matches the cloud.', 'success');
      codePanel.console.system('The cloud save was further along, so it was loaded.');
      return;
    default:
      codePanel.console.system('This factory is now in the cloud.');
  }
}

/**
 * Installing a save that came from somewhere else. The state object is refilled
 * rather than replaced, because every module in this file holds a reference to it
 * and a swap would leave half the game looking at the old world.
 */
function adoptCloudSave(next: GameState): void {
  if (fleet.running) fleet.stop('user');
  queue.clear();

  Object.assign(state, next);
  codePanel.editor.value = state.script;

  applyProgress();
  worldView.sync(state);
  // Nothing here travelled: the robot is simply somewhere else now.
  worldView.snapRobots();
}

/** A session outlives a reload, so the button has to catch up with it at boot. */
async function restoreAccount(): Promise<void> {
  const email = await currentEmail();
  if (email === null) return;

  paintAccount(email);
  codePanel.console.system(`Signed in as ${email}.`);
  await syncNow();
}

if (isCloudConfigured()) void restoreAccount();

function runScript(): void {
  queue.clear();
  runningLines.clear();
  codePanel.editor.setRunningLines([]);
  lineNumbersReported = false;
  codePanel.console.system('Run started.');

  // Every robot gets the same source and its own worker. Which one it is arrives
  // in the snapshot, because it cannot be read off a script they all share.
  const members = state.robots.map((robot) => ({
    robotId: robot.id,
    snapshot: snapshotOf(robot.id),
  }));

  fleet.start(members, codePanel.editor.value, unlockedCommands(state));
  scheduler.setTickRate(state.tickRateMs);
  scheduler.start();
  controls.update({ running: true, paused: false });

  ranScript = true;
  checkOnboarding();
}

function stopScript(): void {
  if (!fleet.running) {
    scheduler.stop();
    controls.update({ running: false, paused: false });
    return;
  }
  fleet.stop('user');
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
    case 'ground':
      return describeGround(tile);
    case 'machine':
      return tile.job === null ? tile.machine : `${tile.machine}, running`;
    case 'market':
      return 'market';
    default:
      return 'unknown tile';
  }
}

function describeGround(tile: GroundTile): string {
  switch (tile.state) {
    case 'raw':
      return 'raw ground — clear() it';
    case 'prepared':
      return 'prepared — seed() it';
    case 'growing':
      return `${tile.resource ?? 'crop'}, growing`;
    case 'ripe':
      return `${tile.resource ?? 'crop'}, ripe (${tile.yield})`;
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
    // Innermost first: the modal, then a drawer, and only with nothing in the
    // way does Escape mean stop. Anything else ends a run nobody asked to end.

    // The conflict dialog swallows the key rather than closing. Dismissing it
    // would be answering its question with silence, and it has no silent answer.
    if (conflictDialog.isOpen) return;

    if (authPanel.isOpen) {
      authPanel.close();
      return;
    }
    if (conceptPanel.isOpen) {
      conceptPanel.close();
      return;
    }
    if (shop.isOpen || missions.isOpen || rates.isOpen) {
      shop.setOpen(false);
      missions.setOpen(false);
      rates.setOpen(false);
      return;
    }
    stopScript();
    return;
  }

  // A bare letter must never steal a keystroke from the editor. Opening the
  // panel focuses the editor synchronously, so without this the same 'e' that
  // opened it would land as the first character of the script.
  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'e') {
    event.preventDefault();
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
controls.update({ running: false, paused: false });
codePanel.console.system('Press E for the editor, then Ctrl+Enter to run.');
reportLoad();

// A returning player may have earned a concept in a build that did not have
// concepts yet. Those are marked without a modal — nobody wants to be lectured
// by a page they just loaded; the mission log has them if they want them.
if (onboarding.done) {
  for (const concept of unseenConcepts(state)) markConceptSeen(state, concept.id);
}

/** Says what happened to the previous save, but only when there is news. */
function reportLoad(): void {
  if (loadResult.ok) {
    if (loadResult.migratedFrom !== undefined) {
      codePanel.console.system(`Save loaded and upgraded from version ${loadResult.migratedFrom}.`);
    } else {
      codePanel.console.system('Save loaded.');
    }
    return;
  }

  // 'empty' is a first visit, not a problem worth a line in the console.
  if (loadResult.reason === 'empty') return;
  codePanel.console.error('Your save could not be read, so this is a fresh factory.', null, loadResult.message);
}
