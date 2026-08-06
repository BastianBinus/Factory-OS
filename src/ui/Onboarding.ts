import { ONBOARDING_DONE } from '../game/GameState';

/**
 * The first three minutes: open the editor, write a line, run it.
 *
 * Every step waits for the player to actually do the thing — there is no Next
 * button, because a tutorial you can click through without acting teaches the
 * clicking. `check()` is handed the current situation and advances as far as
 * that situation allows, so it is safe to call from anywhere and cannot get out
 * of step with what is on screen.
 */

export interface OnboardingStep {
  title: string;
  body: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: 'Open the editor',
    body: 'Press E, or use the Code button below. Your script lives there, next to the console that answers you.',
  },
  {
    title: 'Write your first command',
    body:
      "Uncomment the loop, or type await move('south'); on a line of its own. " +
      'The await is not decoration: without it the line does not wait for the robot.',
  },
  {
    title: 'Run it',
    body: 'Press Ctrl+Enter. The line the robot is working on lights up while it works.',
  },
];

export interface OnboardingContext {
  editorOpen: boolean;
  script: string;
  /** True once the player has started a run at least once. */
  ranScript: boolean;
}

export interface OnboardingOptions {
  parent: HTMLElement;
  step: number;
  onChange: (step: number) => void;
}

export class Onboarding {
  readonly element: HTMLElement;

  private readonly counter: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly onChange: (step: number) => void;
  private step: number;

  constructor(options: OnboardingOptions) {
    this.onChange = options.onChange;
    this.step = options.step;

    this.element = document.createElement('aside');
    this.element.className = 'coach';
    this.element.setAttribute('aria-label', 'Getting started');

    const head = document.createElement('div');
    head.className = 'coach__head';

    this.counter = document.createElement('span');
    this.counter.className = 't-label';

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn btn--ghost btn--sm';
    skip.textContent = 'Skip';
    skip.title = 'Hide the tutorial. Everything it covers stays in the mission log.';
    skip.addEventListener('click', () => this.finish());

    head.append(this.counter, skip);

    this.title = document.createElement('h2');
    this.title.className = 't-title';

    this.body = document.createElement('p');
    this.body.className = 't-body t-muted';

    this.element.append(head, this.title, this.body);
    options.parent.appendChild(this.element);

    this.paint();
  }

  get done(): boolean {
    return this.step >= ONBOARDING_DONE;
  }

  /**
   * Advances past every step the situation already satisfies. More than one can
   * fall at once — a returning player opens the editor to a script that already
   * has a command in it — and stopping at the first would leave the card asking
   * for something that is done.
   */
  check(context: OnboardingContext): void {
    const before = this.step;
    while (!this.done && this.satisfied(this.step, context)) this.step += 1;
    if (this.step === before) return;

    this.paint();
    this.onChange(this.step);
  }

  private satisfied(step: number, context: OnboardingContext): boolean {
    switch (step) {
      case 0:
        return context.editorOpen;
      case 1:
        return hasLiveCommand(context.script);
      case 2:
        return context.ranScript;
      default:
        return true;
    }
  }

  private finish(): void {
    if (this.done) return;
    this.step = ONBOARDING_DONE;
    this.paint();
    this.onChange(this.step);
  }

  private paint(): void {
    const current = STEPS[this.step];
    this.element.hidden = this.done || current === undefined;
    if (!current) return;

    this.counter.textContent = `Step ${this.step + 1} of ${STEPS.length}`;
    this.title.textContent = current.title;
    this.body.textContent = current.body;
  }
}

/**
 * Whether the script contains a command call that will actually run.
 *
 * Line comments are cut first, because the starter script is one long comment
 * containing exactly the line we are asking the player to write. This misreads a
 * // inside a string literal, which is a price worth paying: the alternative is
 * a parser, and the question being asked is only "has anything live been typed".
 *
 * Exported for the tests — if this ever returns true for the starter script, the
 * second tutorial step completes itself and the tutorial is quietly broken.
 */
export function hasLiveCommand(script: string): boolean {
  const code = script
    .split('\n')
    .map((line) => {
      const comment = line.indexOf('//');
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join('\n');

  return /await\s+[A-Za-z_$][\w$]*\s*\(/.test(code);
}
