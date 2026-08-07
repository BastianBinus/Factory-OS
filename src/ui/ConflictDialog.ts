import type { SaveSummary } from '../cloud/conflict';

/**
 * Two factories, both real, and only one can continue.
 *
 * This is the one modal in the game with no way out. There is no backdrop click,
 * no Escape and no close button, because every one of those would mean "decide
 * later" and there is no later - the next save writes over whichever one was not
 * chosen. Better one unavoidable question than a factory quietly deleted.
 *
 * Both sides are described in the same words, in the order that actually matters
 * to the player: how far along it is, then how much it is worth, then when it was
 * last touched. The timestamp comes last on purpose. It is the least trustworthy
 * number here - see the note in `conflict.ts` - and putting it first would invite
 * exactly the decision it cannot support.
 */

type Choice = 'local' | 'cloud';

export interface ConflictDialogOptions {
  parent: HTMLElement;
}

export class ConflictDialog {
  readonly element: HTMLElement;

  private readonly localCard: HTMLElement;
  private readonly cloudCard: HTMLElement;
  private readonly localButton: HTMLButtonElement;
  private readonly cloudButton: HTMLButtonElement;

  private settle: ((choice: Choice) => void) | null = null;

  constructor(options: ConflictDialogOptions) {
    this.element = document.createElement('div');
    this.element.className = 'modal';
    this.element.hidden = true;

    const card = document.createElement('div');
    card.className = 'panel conflict';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Two saves');

    const head = document.createElement('div');
    head.className = 'panel__head';

    const kind = document.createElement('span');
    kind.className = 't-label';
    kind.textContent = 'Two saves';
    head.appendChild(kind);

    const body = document.createElement('div');
    body.className = 'panel__body conflict__body';

    const title = document.createElement('h2');
    title.className = 't-display';
    title.textContent = 'Which factory should continue?';

    const prose = document.createElement('p');
    prose.className = 't-prose t-muted';
    prose.textContent =
      'This browser and the cloud each hold progress the other never saw, so neither one can be kept without losing part of the other. The one you do not pick is replaced.';

    this.localButton = choiceButton('Keep this browser');
    this.cloudButton = choiceButton('Use the cloud');

    this.localCard = side('In this browser', this.localButton);
    this.cloudCard = side('In the cloud', this.cloudButton);

    this.localButton.addEventListener('click', () => this.answer('local'));
    this.cloudButton.addEventListener('click', () => this.answer('cloud'));

    const columns = document.createElement('div');
    columns.className = 'conflict__columns';
    columns.append(this.localCard, this.cloudCard);

    body.append(title, prose, columns);
    card.append(head, body);
    this.element.appendChild(card);
    options.parent.appendChild(this.element);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  ask(local: SaveSummary, cloud: SaveSummary, now = Date.now()): Promise<Choice> {
    fill(this.localCard, local, now);
    fill(this.cloudCard, cloud, now);

    this.element.hidden = false;
    this.localButton.focus();

    return new Promise<Choice>((resolve) => {
      this.settle = resolve;
    });
  }

  private answer(choice: Choice): void {
    const settle = this.settle;
    this.settle = null;
    this.element.hidden = true;
    settle?.(choice);
  }
}

function side(caption: string, action: HTMLButtonElement): HTMLElement {
  const root = document.createElement('div');
  root.className = 'conflict__side';

  const label = document.createElement('span');
  label.className = 't-label';
  label.textContent = caption;

  const facts = document.createElement('dl');
  facts.className = 'conflict__facts';

  root.append(label, facts, action);
  return root;
}

function fill(root: HTMLElement, summary: SaveSummary, now: number): void {
  const facts = root.querySelector('.conflict__facts');
  if (!facts) return;

  facts.replaceChildren();
  addFact(facts, 'Ticks', String(summary.tick));
  addFact(facts, 'Credits', String(summary.credits));
  addFact(facts, 'Saved', describeAge(summary.savedAt, now));
}

function addFact(facts: Element, name: string, value: string): void {
  const term = document.createElement('dt');
  term.textContent = name;

  const detail = document.createElement('dd');
  detail.textContent = value;

  facts.append(term, detail);
}

function choiceButton(label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'btn';
  element.textContent = label;
  return element;
}

/** Rough on purpose: the exact minute is noise, and the clock may be wrong anyway. */
function describeAge(savedAt: number, now: number): string {
  if (savedAt <= 0) return 'unknown';

  const minutes = Math.round((now - savedAt) / 60_000);
  if (minutes < 0) return 'in the future';
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
