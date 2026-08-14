/**
 * Named script modules: the player's own reusable library.
 *
 * A module is a pure helper. Its source is compiled to a synchronous function
 * that returns an exports object; `use('name')` runs it once and hands back
 * those exports. There is no `await` and no game command inside a module — data
 * comes in as arguments and the answer comes back as a return value. That keeps
 * `use()` synchronous (`const { bfs } = use('pathfinding')`) and the idea clean:
 * a module is a library, not a second robot.
 *
 * This file owns the whole mechanism and touches no worker: the resolver is a
 * plain function so the tests can exercise compile, cache, unknown-name and
 * cycle handling without a `Worker`.
 */

export interface ModuleDoc {
  name: string;
  source: string;
}

/** A legal module name — a JS-ish identifier, so it can be typed and read. */
export const MODULE_NAME = /^[A-Za-z_][\w-]*$/;

type Exports = Record<string, unknown>;
type ModuleFn = (use: (name: string) => Exports) => Exports;
type SyncFunctionConstructor = new (...args: string[]) => ModuleFn;

const SyncFunction = Function as unknown as SyncFunctionConstructor;

/**
 * An error already attributed to a specific module. Carrying the marker means a
 * failure deep in a chain (`a` uses `b` uses `c`) is named once, at `c`, and
 * passes back out untouched rather than being re-blamed on every module above it.
 */
export class ModuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleError';
  }
}

/**
 * Turns the player's `export`s into a returned object so a plain function body
 * can hand them back. Three shapes are understood, each only at the start of a
 * line: `export function/const/let/var/class NAME`, and `export { a, b as c }`.
 *
 * The exports return is always appended at the very end. An author who writes
 * their own top-level `return` still wins — theirs runs first and ours becomes
 * unreachable — so `return { ... }` by hand is respected without having to parse
 * for it (which no regex can do reliably through nested functions).
 */
export function wrapModuleSource(source: string): string {
  // Each entry is a property for the exports object: `name` or `alias: local`.
  const entries: string[] = [];

  let body = source.replace(
    /^[ \t]*export[ \t]+(function\*?|const|let|var|class)[ \t]+([A-Za-z_$][\w$]*)/gm,
    (_match, keyword: string, name: string) => {
      entries.push(name);
      return `${keyword} ${name}`;
    },
  );

  body = body.replace(/^[ \t]*export[ \t]*\{([^}]*)\}[ \t]*;?[ \t]*$/gm, (_match, group: string) => {
    for (const part of group.split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      // `a as b` exports the value of `a` under the name `b`; bare `a` is `a: a`.
      const [local = piece, alias] = piece.split(/\s+as\s+/).map((token) => token.trim());
      entries.push(alias ? `${alias}: ${local}` : local);
    }
    return '';
  });

  return `${body}\n;return { ${entries.join(', ')} };`;
}

/**
 * A resolver over a fixed set of modules. Each name compiles and runs at most
 * once; the exports are cached, so a diamond (`a` and `b` both use `c`) runs `c`
 * a single time. A name that uses itself, directly or through a chain, is caught
 * before it recurses forever and named in the message.
 */
export function createModuleResolver(modules: readonly ModuleDoc[]): (name: string) => Exports {
  const sources = new Map<string, string>();
  for (const module of modules) sources.set(module.name, module.source);

  const cache = new Map<string, Exports>();
  const resolving: string[] = [];

  const use = (name: string): Exports => {
    const cached = cache.get(name);
    if (cached) return cached;

    const source = sources.get(name);
    if (source === undefined) {
      throw new ModuleError(`There is no module named '${name}'.`);
    }

    if (resolving.includes(name)) {
      const loop = [...resolving, name].join(' → ');
      throw new ModuleError(`Modules use each other in a loop: ${loop}.`);
    }

    resolving.push(name);
    try {
      const compiled = compile(name, source);
      const exports = run(name, compiled, use);
      const result: Exports = exports && typeof exports === 'object' ? exports : {};
      cache.set(name, result);
      return result;
    } finally {
      resolving.pop();
    }
  };

  return use;
}

/** A syntax error in a module reads with its name, not a nameless stack frame. */
function compile(name: string, source: string): ModuleFn {
  try {
    return new SyncFunction('use', wrapModuleSource(source));
  } catch (error) {
    throw new ModuleError(`Module '${name}' has an error: ${messageOf(error)}`);
  }
}

/** Runs a module body, blaming a raw throw on this module — but only the first time. */
function run(name: string, compiled: ModuleFn, use: (name: string) => Exports): Exports {
  try {
    return compiled(use);
  } catch (error) {
    if (error instanceof ModuleError) throw error;
    throw new ModuleError(`Module '${name}' failed: ${messageOf(error)}`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
