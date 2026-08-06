/**
 * The button group at the bottom. Transport controls first — Run, Pause, Stop —
 * then a separator and the things that open panels.
 *
 * Only Run is yellow. The styleguide gives one primary button per screen and
 * this is it; everything else is a plain button so the eye knows where to go
 * when nothing is running.
 */

export interface ControlsOptions {
  parent: HTMLElement;
  onRun: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onCode: () => void;
}

export interface ControlsState {
  running: boolean;
  paused: boolean;
}

export class Controls {
  readonly element: HTMLElement;

  private readonly run: HTMLButtonElement;
  private readonly pause: HTMLButtonElement;
  private readonly stop: HTMLButtonElement;

  constructor(options: ControlsOptions) {
    this.element = document.createElement('div');
    this.element.className = 'bar bar--bottom';

    this.run = button('Run', 'Run the script (Ctrl+Enter)', options.onRun, 'btn btn--primary');
    this.pause = button('Pause', 'Hold the ticks without ending the run', options.onPause);
    this.stop = button('Stop', 'Stop the script (Esc)', options.onStop);

    const separator = document.createElement('span');
    separator.className = 'bar__sep';

    const reset = button('Reset', 'Put the floor back to the start. Stops a running script.', options.onReset);
    const code = button('Code', 'Show or hide the editor (E)', options.onCode);

    this.element.append(this.run, this.pause, this.stop, separator, reset, code);
    options.parent.appendChild(this.element);
  }

  /** Later phases hang Shop and Missions off the right-hand group. */
  addButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const extra = button(label, title, onClick);
    this.element.appendChild(extra);
    return extra;
  }

  update(state: ControlsState): void {
    this.run.disabled = state.running;
    this.pause.disabled = !state.running;
    this.stop.disabled = !state.running;
    this.pause.textContent = state.paused ? 'Resume' : 'Pause';
  }
}

function button(label: string, title: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.title = title;
  element.addEventListener('click', onClick);
  return element;
}
