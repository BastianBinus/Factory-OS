import { Editor } from './Editor';
import { ConsolePanel } from './ConsolePanel';
import { MODULE_NAME, type ModuleDoc } from '../game/modules';

/**
 * The code overlay. It slides in from the right and deliberately does not dim
 * the factory behind it — watching the robot while typing is the whole point of
 * the layout.
 *
 * The panel owns the documents: the main script and, once the player unlocks
 * modules, a named library of them. A tab strip switches which one the single
 * editor is showing; the active document is the only place edits are written, so
 * one editor can stand in for the whole library without ever crossing them.
 */

const MAIN_TAB = 0;

export interface CodePanelOptions {
  parent: HTMLElement;
  script: string;
  modules: ModuleDoc[];
  /** Whether the module tabs are shown; false until `script_modules` is bought. */
  modulesEnabled: boolean;
  commands: string[];
  onScriptChange?: (script: string) => void;
  onModulesChange?: (modules: ModuleDoc[]) => void;
  onRun?: () => void;
  onStop?: () => void;
  onToggle?: (open: boolean) => void;
}

export class CodePanel {
  readonly element: HTMLElement;
  readonly editor: Editor;
  readonly console = new ConsolePanel();

  private readonly onToggle: ((open: boolean) => void) | undefined;
  private readonly onScriptChange: ((script: string) => void) | undefined;
  private readonly onModulesChange: ((modules: ModuleDoc[]) => void) | undefined;

  private script: string;
  private modules: ModuleDoc[];
  private modulesEnabled: boolean;
  /** 0 is the main script; 1..n index into `modules`. */
  private active = MAIN_TAB;
  /** Set while the editor is loaded programmatically, so a swap is not an edit. */
  private swapping = false;

  private readonly tabs: HTMLElement;
  private open = false;

  constructor(options: CodePanelOptions) {
    this.onToggle = options.onToggle;
    this.onScriptChange = options.onScriptChange;
    this.onModulesChange = options.onModulesChange;
    this.script = options.script;
    this.modules = options.modules.map((module) => ({ ...module }));
    this.modulesEnabled = options.modulesEnabled;

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

    this.tabs = document.createElement('div');
    this.tabs.className = 'codepanel__tabs';
    this.tabs.setAttribute('role', 'tablist');

    const editorHost = document.createElement('div');
    editorHost.className = 'codepanel__editor';

    this.element.append(head, this.tabs, editorHost, this.console.element);
    options.parent.appendChild(this.element);

    this.editor = new Editor({
      parent: editorHost,
      doc: this.script,
      commands: options.commands,
      onChange: (doc) => this.onEditorChange(doc),
      ...(options.onRun ? { onRun: options.onRun } : {}),
      ...(options.onStop ? { onStop: options.onStop } : {}),
    });

    this.console.onLine((line) => this.editor.revealLine(line));
    this.renderTabs();
    this.setOpen(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The main script — what the robots run. */
  getScript(): string {
    return this.script;
  }

  getModules(): ModuleDoc[] {
    return this.modules.map((module) => ({ ...module }));
  }

  /** Replaces both documents, used when a save is loaded from elsewhere. */
  setDocs(script: string, modules: ModuleDoc[]): void {
    this.script = script;
    this.modules = modules.map((module) => ({ ...module }));
    this.active = MAIN_TAB;
    this.load(this.script);
    this.renderTabs();
  }

  setModulesEnabled(enabled: boolean): void {
    if (enabled === this.modulesEnabled) return;
    this.modulesEnabled = enabled;
    // A panel that just lost its tabs must not be left showing a module.
    if (!enabled && this.active !== MAIN_TAB) this.select(MAIN_TAB);
    this.renderTabs();
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

  // Documents ----------------------------------------------------------------

  private onEditorChange(doc: string): void {
    if (this.swapping) return;
    if (this.active === MAIN_TAB) {
      this.script = doc;
      this.onScriptChange?.(doc);
      return;
    }
    const module = this.modules[this.active - 1];
    if (!module) return;
    module.source = doc;
    this.onModulesChange?.(this.getModules());
  }

  /** Loads text into the editor without it counting as a player edit. */
  private load(text: string): void {
    this.swapping = true;
    this.editor.value = text;
    this.swapping = false;
  }

  private select(index: number): void {
    if (index === this.active) return;
    this.active = index;
    const text = index === MAIN_TAB ? this.script : (this.modules[index - 1]?.source ?? '');
    this.load(text);
    this.renderTabs();
    this.editor.focus();
  }

  private addModule(): void {
    const name = this.uniqueName('module');
    this.modules.push({ name, source: '' });
    this.onModulesChange?.(this.getModules());
    this.select(this.modules.length); // 1-based tab index of the new module
  }

  private renameModule(index: number): void {
    const module = this.modules[index - 1];
    if (!module) return;
    const raw = window.prompt('Rename module', module.name);
    if (raw === null) return;
    const name = raw.trim();
    if (name === module.name) return;
    if (!MODULE_NAME.test(name) || this.nameTaken(name)) {
      window.alert(`'${name}' is not a free, valid module name.`);
      return;
    }
    module.name = name;
    this.onModulesChange?.(this.getModules());
    this.renderTabs();
  }

  private deleteModule(index: number): void {
    const module = this.modules[index - 1];
    if (!module) return;
    if (!window.confirm(`Delete module '${module.name}'?`)) return;
    this.modules.splice(index - 1, 1);
    if (this.active === index) this.active = MAIN_TAB;
    else if (this.active > index) this.active -= 1;
    this.onModulesChange?.(this.getModules());
    this.load(this.active === MAIN_TAB ? this.script : (this.modules[this.active - 1]?.source ?? ''));
    this.renderTabs();
  }

  private nameTaken(name: string): boolean {
    return this.modules.some((module) => module.name === name);
  }

  private uniqueName(base: string): string {
    if (!this.nameTaken(base)) return base;
    for (let n = 2; ; n += 1) {
      const candidate = `${base}-${n}`;
      if (!this.nameTaken(candidate)) return candidate;
    }
  }

  private renderTabs(): void {
    this.tabs.replaceChildren();
    // Before the module system is unlocked the strip stays empty and hidden, so
    // the panel is exactly what it always was.
    this.tabs.hidden = !this.modulesEnabled;
    if (!this.modulesEnabled) return;

    this.tabs.appendChild(this.tabButton('Script', MAIN_TAB, false));
    this.modules.forEach((module, i) => {
      this.tabs.appendChild(this.tabButton(module.name, i + 1, true));
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'codepanel__tab codepanel__tab--add';
    add.title = 'New module';
    add.setAttribute('aria-label', add.title);
    add.textContent = '+';
    add.addEventListener('click', () => this.addModule());
    this.tabs.appendChild(add);
  }

  private tabButton(label: string, index: number, removable: boolean): HTMLElement {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'codepanel__tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', index === this.active ? 'true' : 'false');
    if (index === this.active) tab.classList.add('codepanel__tab--active');

    const text = document.createElement('span');
    text.textContent = label;
    tab.appendChild(text);
    tab.addEventListener('click', () => this.select(index));

    if (removable) {
      tab.addEventListener('dblclick', () => this.renameModule(index));
      const remove = document.createElement('span');
      remove.className = 'codepanel__tab-x';
      remove.textContent = '×';
      remove.title = `Delete ${label}`;
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        this.deleteModule(index);
      });
      tab.appendChild(remove);
    }

    return tab;
  }
}
