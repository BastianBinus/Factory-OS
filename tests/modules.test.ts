import { describe, expect, it } from 'vitest';
import type { ModuleDoc } from '../src/game/modules';
import { createModuleResolver, wrapModuleSource } from '../src/game/modules';

function modules(...docs: ModuleDoc[]): ModuleDoc[] {
  return docs;
}

describe('wrapModuleSource', () => {
  it('turns an exported function into a returned binding', () => {
    const wrapped = wrapModuleSource('export function bfs() { return 1 }');
    const run = new Function('use', wrapped) as (use: unknown) => Record<string, unknown>;
    const exports = run(() => ({}));
    expect(typeof exports['bfs']).toBe('function');
  });

  it('collects an export list, alias and all', () => {
    const wrapped = wrapModuleSource('const a = 1\nconst b = 2\nexport { a, b as top }');
    const run = new Function('use', wrapped) as (use: unknown) => Record<string, unknown>;
    const exports = run(() => ({}));
    expect(exports).toEqual({ a: 1, top: 2 });
  });

  it('respects an author who writes their own return', () => {
    const wrapped = wrapModuleSource('const a = 1\nreturn { a }');
    const run = new Function('use', wrapped) as (use: unknown) => Record<string, unknown>;
    // Their return runs first; the appended one is unreachable.
    expect(run(() => ({}))).toEqual({ a: 1 });
  });
});

describe('createModuleResolver', () => {
  it('hands back a module’s exports', () => {
    const use = createModuleResolver(
      modules({ name: 'math', source: 'export function add(a, b) { return a + b }' }),
    );
    const { add } = use('math') as { add: (a: number, b: number) => number };
    expect(add(2, 3)).toBe(5);
  });

  it('lets one module use another', () => {
    const use = createModuleResolver(
      modules(
        { name: 'base', source: 'export const one = 1' },
        { name: 'top', source: "const { one } = use('base')\nexport const two = one + one" },
      ),
    );
    expect(use('top')).toEqual({ two: 2 });
  });

  it('runs each module body exactly once', () => {
    let runs = 0;
    // The counter lives outside the module; the module bumps it on load.
    (globalThis as Record<string, unknown>)['__moduleRuns'] = () => {
      runs += 1;
    };
    const use = createModuleResolver(
      modules({ name: 'counter', source: 'globalThis.__moduleRuns()\nexport const ok = true' }),
    );
    use('counter');
    use('counter');
    expect(runs).toBe(1);
    delete (globalThis as Record<string, unknown>)['__moduleRuns'];
  });

  it('names the module that does not exist', () => {
    const use = createModuleResolver(modules());
    expect(() => use('ghost')).toThrow(/no module named 'ghost'/i);
  });

  it('catches a cycle and spells out the loop', () => {
    const use = createModuleResolver(
      modules(
        { name: 'a', source: "export const x = use('b')" },
        { name: 'b', source: "export const y = use('a')" },
      ),
    );
    expect(() => use('a')).toThrow(/loop: a → b → a/);
  });

  it('reports a module’s own syntax error under its name', () => {
    const use = createModuleResolver(modules({ name: 'broken', source: 'export const = ' }));
    expect(() => use('broken')).toThrow(/Module 'broken' has an error/);
  });
});
