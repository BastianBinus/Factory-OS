import type { GameState } from '../game/types';
import type { SaveSummary } from './conflict';
import { localSavedAt, saveGame } from '../game/saveLoad';
import { pushSave } from './saveApi';
import { syncWithCloud } from './sync';
import { currentEmail } from './session';

/**
 * Saving, on two clocks. The local save is a string in localStorage and happens
 * on a short debounce; the cloud save is a network round trip and happens on a
 * long one, only while signed in. Both were tangled into `main.ts`; here they are
 * one thing that owns its timers and its sign-in state.
 *
 * The controller is pure transport and scheduling. Everything that touches the
 * running game — installing a cloud save, refilling the editor, reframing the
 * camera, printing to the console — is handed in as a callback, so this file
 * never has to know what a WorldView or a CodePanel is.
 */

export interface SaveControllerDeps {
  /** The live state object. Held by reference; the adopt callback refills it. */
  state: GameState;
  /** Asked only when neither save contains the other (the conflict dialog). */
  ask: (local: SaveSummary, cloud: SaveSummary) => Promise<'local' | 'cloud'>;
  /** Install a cloud save that won: refill state, editor, camera. */
  adopt: (next: GameState) => void;
  /** Reflect the signed-in email in the account button and auth panel. */
  renderAccount: (email: string | null) => void;
  system: (message: string) => void;
  error: (message: string, detail: string) => void;
  toast: (title: string, body: string, kind: 'success' | 'error') => void;
}

/** Long enough that a fast tick rate does not serialise the grid every frame. */
const SAVE_DELAY_MS = 1000;
/** Long, because this is a network round trip and not a string in localStorage. */
const CLOUD_SAVE_DELAY_MS = 20_000;

export interface SaveController {
  /** Debounced local save, followed by a debounced cloud save when signed in. */
  scheduleSave(): void;
  /** For the moments worth losing nothing over: an unlock, leaving the page. */
  saveNow(): void;
  /** Resolve browser and cloud saves into one, asking the player only if it must. */
  syncNow(): Promise<void>;
  /** Record the signed-in email and update the account UI. */
  paintAccount(email: string | null): void;
  /** Catch the account button up with a session that outlived a reload. */
  restoreAccount(): Promise<void>;
}

export function createSaveController(deps: SaveControllerDeps): SaveController {
  let saveTimer: number | null = null;
  let cloudTimer: number | null = null;
  let signedInAs: string | null = null;

  function scheduleSave(): void {
    if (saveTimer !== null) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      saveGame(deps.state);
      scheduleCloudSave();
    }, SAVE_DELAY_MS);
  }

  function saveNow(): void {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveGame(deps.state);
    pushCloudNow();
  }

  function scheduleCloudSave(): void {
    if (signedInAs === null || cloudTimer !== null) return;
    cloudTimer = window.setTimeout(() => {
      cloudTimer = null;
      // Silent on failure on purpose: this fires on a timer the player never asked
      // for, and a toast about the network every twenty seconds helps nobody.
      void pushSave(deps.state);
    }, CLOUD_SAVE_DELAY_MS);
  }

  function pushCloudNow(): void {
    if (signedInAs === null) return;
    if (cloudTimer !== null) {
      window.clearTimeout(cloudTimer);
      cloudTimer = null;
    }
    void pushSave(deps.state).then((result) => {
      if (!result.ok) deps.error('The cloud save was refused.', result.message);
    });
  }

  async function syncNow(): Promise<void> {
    if (signedInAs === null) return;

    const outcome = await syncWithCloud({
      state: deps.state,
      localSavedAt: localSavedAt(),
      ask: (local, cloud) => deps.ask(local, cloud),
      adopt: (next) => deps.adopt(next),
    });

    switch (outcome.kind) {
      case 'failed':
        deps.toast('Cloud sync failed', outcome.message, 'error');
        deps.error('Cloud sync failed.', outcome.message);
        return;
      case 'adopted':
        deps.toast('Cloud save loaded', 'This browser now matches the cloud.', 'success');
        deps.system('The cloud save was further along, so it was loaded.');
        return;
      default:
        deps.system('This factory is now in the cloud.');
    }
  }

  function paintAccount(email: string | null): void {
    signedInAs = email;
    deps.renderAccount(email);
  }

  async function restoreAccount(): Promise<void> {
    const email = await currentEmail();
    if (email === null) return;

    paintAccount(email);
    deps.system(`Signed in as ${email}.`);
    await syncNow();
  }

  return { scheduleSave, saveNow, syncNow, paintAccount, restoreAccount };
}
