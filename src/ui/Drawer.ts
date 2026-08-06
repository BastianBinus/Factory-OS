/**
 * The chrome the shop and the mission log share: a panel that slides in from the
 * right, a title, a close button, a scrolling body.
 *
 * It sits in the same slot as the code overlay on purpose. Two panels stacked on
 * top of each other would hide the factory completely, and the factory is the
 * thing the player is supposed to be looking at — so `main.ts` keeps exactly one
 * of them open at a time.
 */

export interface DrawerOptions {
  parent: HTMLElement;
  title: string;
  /** Small line under the title, for a running total or a hint. */
  note?: string;
  onToggle?: (open: boolean) => void;
}

export class Drawer {
  readonly element: HTMLElement;
  readonly body: HTMLElement;

  private readonly noteOut: HTMLElement;
  private readonly onToggle: ((open: boolean) => void) | undefined;
  private open = false;

  constructor(options: DrawerOptions) {
    this.onToggle = options.onToggle;

    this.element = document.createElement('aside');
    this.element.className = 'drawer';
    this.element.setAttribute('aria-label', options.title);

    const head = document.createElement('div');
    head.className = 'drawer__head';

    const heading = document.createElement('span');
    heading.className = 't-label';
    heading.textContent = options.title;

    this.noteOut = document.createElement('span');
    this.noteOut.className = 'drawer__note';
    this.noteOut.textContent = options.note ?? '';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost btn--icon';
    close.title = `Close ${options.title.toLowerCase()}`;
    close.setAttribute('aria-label', close.title);
    close.textContent = '×';
    close.addEventListener('click', () => this.setOpen(false));

    head.append(heading, this.noteOut, close);

    this.body = document.createElement('div');
    this.body.className = 'drawer__body';

    this.element.append(head, this.body);
    options.parent.appendChild(this.element);

    this.setOpen(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setNote(note: string): void {
    this.noteOut.textContent = note;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.element.classList.toggle('drawer--open', open);
    this.element.setAttribute('aria-hidden', open ? 'false' : 'true');
    this.onToggle?.(open);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }
}
