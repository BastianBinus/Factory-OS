import { Editor } from './Editor';
import { ConsolePanel } from './ConsolePanel';

/**
 * The code overlay. It slides in from the right and deliberately does not dim
 * the factory behind it — watching the robot while typing is the whole point of
 * the layout.
 */

export interface CodePanelOptions {
  parent: HTMLElement;
  doc: string;
  commands: string[];
  onChange?: (doc: string) => void;
  onRun?: () => void;
  onStop?: () => void;
  onToggle?: (open: boolean) => void;
}

export class CodePanel {
  readonly element: HTMLElement;
  readonly editor: Editor;
  readonly console = new ConsolePanel();

  private readonly onToggle: ((open: boolean) => void) | undefined;
  private open = false;

  constructor(options: CodePanelOptions) {
    this.onToggle = options.onToggle;

    this.element = document.createElement('aside');
    this.element.className = 'codepanel';
    this.element.setAttribute('aria-label', 'Script editor');

    const head = document.createElement('div');
    head.className = 'codepanel__head';
    head.innerHTML = '<span class="t-label">Script</span>';

    const hint = document.createElement('span');
    hint.className = 'codepanel__hint';
    hint.textContent = 'Ctrl+Enter runs · Esc stops';
    head.appendChild(hint);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--ghost btn--icon';
    close.title = 'Close the editor (E)';
    close.setAttribute('aria-label', close.title);
    close.textContent = '×';
    close.addEventListener('click', () => this.setOpen(false));
    head.appendChild(close);

    const editorHost = document.createElement('div');
    editorHost.className = 'codepanel__editor';

    this.element.append(head, editorHost, this.console.element);
    options.parent.appendChild(this.element);

    this.editor = new Editor({
      parent: editorHost,
      doc: options.doc,
      commands: options.commands,
      ...(options.onChange ? { onChange: options.onChange } : {}),
      ...(options.onRun ? { onRun: options.onRun } : {}),
      ...(options.onStop ? { onStop: options.onStop } : {}),
    });

    this.console.onLine((line) => this.editor.revealLine(line));
    this.setOpen(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.element.classList.toggle('codepanel--open', open);
    this.element.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) this.editor.focus();
    this.onToggle?.(open);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }
}
