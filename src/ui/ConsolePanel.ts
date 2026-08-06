/**
 * The console under the editor. Three kinds of line, each with a coloured bar so
 * the eye can separate them without reading: what the script printed, what the
 * game says, and what went wrong.
 */

export type LogKind = 'print' | 'system' | 'error';

export interface LogEntry {
  kind: LogKind;
  text: string;
  /** Set for errors; shown as a clickable `line 7`. */
  line?: number | null;
  /** What to do about it, printed under the message in a quieter tone. */
  detail?: string;
}

/** Old lines are dropped rather than kept forever — a loop can print fast. */
const MAX_LINES = 400;

export class ConsolePanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private onLineClick: ((line: number) => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'console';

    const head = document.createElement('div');
    head.className = 'console__head';
    head.innerHTML = '<span class="t-label">Console</span>';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn btn--ghost btn--sm';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => this.clear());
    head.appendChild(clear);

    this.list = document.createElement('div');
    this.list.className = 'console__lines';

    // Lives outside the list so the MAX_LINES trim cannot count it or drop it.
    // An empty console is not broken, but saying nothing looks like it is.
    this.empty = document.createElement('p');
    this.empty.className = 'console__empty t-body t-muted';
    this.empty.textContent = 'Nothing printed yet. print() writes here, and so does every error.';

    this.element.append(head, this.empty, this.list);
  }

  onLine(handler: (line: number) => void): void {
    this.onLineClick = handler;
  }

  append(entry: LogEntry): void {
    const row = document.createElement('div');
    row.className = `console__line console__line--${entry.kind}`;

    const text = document.createElement('span');
    text.className = 'console__text';
    text.textContent = entry.text;
    row.appendChild(text);

    if (typeof entry.line === 'number') {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'console__jump';
      link.textContent = `line ${entry.line}`;
      link.addEventListener('click', () => this.onLineClick?.(entry.line as number));
      row.appendChild(link);
    }

    this.list.appendChild(row);
    this.empty.hidden = true;

    if (entry.detail) {
      const note = document.createElement('div');
      note.className = `console__line console__line--${entry.kind} console__line--detail`;
      note.textContent = entry.detail;
      this.list.appendChild(note);
    }

    while (this.list.childElementCount > MAX_LINES) this.list.firstElementChild?.remove();

    // Following the output is the point; jumping to the newest line is expected.
    this.list.scrollTop = this.list.scrollHeight;
  }

  print(text: string): void {
    this.append({ kind: 'print', text });
  }

  system(text: string): void {
    this.append({ kind: 'system', text });
  }

  error(text: string, line: number | null = null, detail = ''): void {
    this.append({ kind: 'error', text, line, detail });
  }

  clear(): void {
    this.list.replaceChildren();
    this.empty.hidden = false;
  }
}
