import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { tags } from '@lezer/highlight';

/**
 * The code editor. Everything visual comes from the CSS tokens, so the editor
 * follows the theme without a second palette, and the ligatures of JetBrains
 * Mono stay off — a beginner should see `=>` as the two characters they typed.
 */

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  /** Names currently unlocked; they drive autocomplete. */
  commands: string[];
  onChange?: (doc: string) => void;
  onRun?: () => void;
  onStop?: () => void;
}

const COMMAND_INFO: Record<string, { detail: string; info: string }> = {
  move: { detail: "await move('north')", info: 'Drive one tile. north, east, south or west.' },
  mine: { detail: 'await mine()', info: 'Take one unit of ore from the tile below the robot.' },
  drop: { detail: 'await drop()', info: 'Load what the robot carries into the machine below it.' },
  craft: { detail: 'await craft()', info: 'Start the machine below the robot.' },
  take: { detail: 'await take()', info: 'Collect what the machine below the robot produced.' },
  sell: { detail: 'await sell()', info: 'Sell everything the robot carries. Market tile only.' },
  wait: { detail: 'await wait(5)', info: 'Do nothing for a number of ticks.' },
  scan: { detail: 'await scan()', info: 'Read what is on the tile below the robot.' },
  scanAt: { detail: 'await scanAt(x, y)', info: 'Read any tile in the factory.' },
  print: { detail: 'print(value)', info: 'Write a value into the console. Costs no tick.' },
  position: { detail: 'position()', info: 'The robot position as {x, y}. Costs no tick.' },
  inventory: { detail: 'inventory()', info: 'What the robot carries. Costs no tick.' },
  credits: { detail: 'credits()', info: 'Your credits right now. Costs no tick.' },
  reset: {
    detail: 'await reset()',
    info: 'Put the floor back to the start: robot parked, ore full, machines empty. Your credits and unlocks stay. Costs no tick.',
  },
};

/** Commands that block are worth spelling out with their `await`. */
const INSTANT = new Set(['print', 'position', 'inventory', 'credits']);

function completionsFor(commands: string[]): Completion[] {
  return commands.map((name) => {
    const meta = COMMAND_INFO[name];
    const apply = INSTANT.has(name) ? `${name}()` : `await ${name}()`;
    return {
      label: name,
      type: 'function',
      apply,
      detail: meta?.detail ?? `${name}()`,
      info: meta?.info ?? '',
    };
  });
}

const THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    color: 'var(--text)',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    fontVariantLigatures: 'none',
    lineHeight: '1.6',
    padding: 'var(--sp-3) 0',
    caretColor: 'var(--accent)',
  },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-faint)',
    border: 'none',
    paddingRight: 'var(--sp-2)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--syn-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-muted)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--syn-selection)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--surface-2)',
    outline: '1px solid var(--border-strong)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    boxShadow: 'var(--sh-2)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--text)',
  },
  '.cm-completionDetail': { color: 'var(--text-muted)', fontStyle: 'normal' },
});

const HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: 'var(--syn-keyword)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-command)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--syn-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--syn-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [tags.punctuation, tags.bracket, tags.operator], color: 'var(--syn-punct)' },
  { tag: tags.propertyName, color: 'var(--text)' },
  { tag: tags.variableName, color: 'var(--text)' },
]);

export class Editor {
  private readonly view: EditorView;
  private commands: string[];

  constructor(options: EditorOptions) {
    this.commands = [...options.commands];

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => {
          options.onRun?.();
          return true;
        },
      },
      {
        key: 'Escape',
        run: () => {
          options.onStop?.();
          return true;
        },
      },
    ]);

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      autocompletion({ override: [(context) => this.complete(context)], icons: false }),
      javascript(),
      syntaxHighlighting(HIGHLIGHT),
      THEME,
      runKeymap,
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange?.(update.state.doc.toString());
      }),
    ];

    this.view = new EditorView({
      parent: options.parent,
      state: EditorState.create({ doc: options.doc, extensions }),
    });
  }

  /** Only unlocked names are offered — the editor never suggests a locked command. */
  private complete(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return { from: word.from, options: completionsFor(this.commands) };
  }

  setCommands(commands: string[]): void {
    this.commands = [...commands];
  }

  get value(): string {
    return this.view.state.doc.toString();
  }

  set value(next: string) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: next } });
  }

  focus(): void {
    this.view.focus();
  }

  /** Puts the cursor on a line, used when a console error is clicked. */
  revealLine(line: number): void {
    const doc = this.view.state.doc;
    if (line < 1 || line > doc.lines) return;
    const info = doc.line(line);
    this.view.dispatch({
      selection: { anchor: info.from },
      scrollIntoView: true,
    });
    this.view.focus();
  }

  destroy(): void {
    this.view.destroy();
  }
}
