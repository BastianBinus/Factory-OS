import type { ConceptDef } from '../game/types';
import { CONCEPT_COUNT, conceptNumber } from '../game/concepts';

/**
 * The one modal in the game.
 *
 * Everything else in this interface is an overlay you can ignore, because the
 * factory is meant to stay visible. A concept is the exception: it is the moment
 * the game stops being a game and teaches something, and it has earned an
 * interruption. It gets exactly one, once per concept — afterwards the same text
 * is a click away in the mission log, with no modal attached.
 */

export interface ConceptPanelOptions {
  parent: HTMLElement;
  onClose?: () => void;
}

interface Entry {
  concept: ConceptDef;
  isNew: boolean;
}

export class ConceptPanel {
  readonly element: HTMLElement;

  private readonly card: HTMLElement;
  private readonly kind: HTMLElement;
  private readonly count: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly code: HTMLElement;
  private readonly dismiss: HTMLButtonElement;
  private readonly onClose: (() => void) | undefined;

  /** Two unlocks can land in the same tick, so arrivals wait rather than collide. */
  private readonly queue: Entry[] = [];
  private open = false;

  constructor(options: ConceptPanelOptions) {
    this.onClose = options.onClose;

    this.element = document.createElement('div');
    this.element.className = 'modal';
    this.element.hidden = true;
    // Clicking the dimmed area is the same request as pressing the button.
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.close();
    });

    this.card = document.createElement('div');
    this.card.className = 'panel concept';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');

    const head = document.createElement('div');
    head.className = 'panel__head';

    this.kind = document.createElement('span');
    this.kind.className = 't-label';

    this.count = document.createElement('span');
    this.count.className = 't-label';

    head.append(this.kind, this.count);

    const body = document.createElement('div');
    body.className = 'panel__body concept__body';

    this.title = document.createElement('h2');
    this.title.className = 't-display';

    this.body = document.createElement('p');
    this.body.className = 't-prose';

    this.code = document.createElement('pre');
    this.code.className = 'concept__code';

    this.dismiss = document.createElement('button');
    this.dismiss.type = 'button';
    this.dismiss.className = 'btn btn--primary';
    this.dismiss.textContent = 'Got it';
    this.dismiss.addEventListener('click', () => this.close());

    const actions = document.createElement('div');
    actions.className = 'concept__actions';
    actions.appendChild(this.dismiss);

    body.append(this.title, this.body, this.code, actions);
    this.card.append(head, body);
    this.element.appendChild(this.card);
    options.parent.appendChild(this.element);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** `isNew` only changes the label: a first showing announces itself, a re-read does not. */
  show(concept: ConceptDef, isNew = true): void {
    this.queue.push({ concept, isNew });
    if (!this.open) this.next();
  }

  close(): void {
    if (this.queue.length > 0) {
      this.next();
      return;
    }
    this.open = false;
    this.element.hidden = true;
    this.onClose?.();
  }

  private next(): void {
    const entry = this.queue.shift();
    if (!entry) return;

    this.kind.textContent = entry.isNew ? 'New concept' : 'Concept';
    this.count.textContent = `${conceptNumber(entry.concept.id)} of ${CONCEPT_COUNT}`;
    this.title.textContent = entry.concept.title;
    this.body.textContent = entry.concept.body;
    this.code.textContent = entry.concept.codeExample;
    this.card.setAttribute('aria-label', entry.concept.title);

    this.open = true;
    this.element.hidden = false;
    // Focus lands on the way out, so Enter and Escape both close it.
    this.dismiss.focus();
  }
}
