import type { ConceptDef, ConceptId, GameState } from './types';
import { UNLOCKS } from './progression';
import { hasUnlock } from './GameState';

/**
 * The JavaScript curriculum, as data.
 *
 * A concept is not attached to a lesson but to a moment: the unlock or the
 * mission that first makes it useful carries its `conceptId`, so the explanation
 * arrives when the player has a reason to want it. That is the whole point of
 * teaching through a game — nothing here is introduced before it is needed.
 *
 * The order below is the teaching order and never changes, because the panel
 * numbers itself against this list ("3 of 7").
 */

export const CONCEPTS: ConceptDef[] = [
  {
    id: 'await',
    title: 'await — waiting for the robot',
    body:
      'Every command that makes the robot do something takes time, so it does not hand you a result straight away. ' +
      'It hands back a promise, and await pauses your script until that promise is fulfilled. ' +
      'Leave the await out and the next line starts while the robot is still busy with the last one.',
    codeExample: `// One step, then the next
await move('south');
await mine();

// Without await both lines fire at once
move('south');
mine();`,
  },
  {
    id: 'while',
    title: 'while — repeating without repeating yourself',
    body:
      'A while loop runs the block between its braces again and again, for as long as the condition in the parentheses stays true. ' +
      'while (true) never becomes false, so it keeps going until you press Stop — which is exactly what a factory robot should do. ' +
      'Almost everything the robot does for a living lives inside one of these.',
    codeExample: `while (true) {
  await move('south');
  await mine();
}`,
  },
  {
    id: 'if_else',
    title: 'if and else — making a decision',
    body:
      'An if statement runs its block only when the condition is true, and the else block runs when it is not. ' +
      'Comparisons build those conditions: === asks whether two values are exactly the same. ' +
      'scan() tells the robot what state the tile below it is in, which is what turns a guess into a decision.',
    codeExample: `const tile = await scan();

if (tile.state === 'ripe') {
  await mine();
} else {
  await move('east');
}`,
  },
  {
    id: 'functions',
    title: 'Functions — naming a piece of work',
    body:
      'A function gives a block of code a name, so you can run it from anywhere by writing that name with parentheses. ' +
      'The values in the parentheses are parameters: the same function does a slightly different job each time you call it. ' +
      'Because your commands need await, a function that uses them has to be declared async — and you await the call.',
    codeExample: `async function drive(direction, steps) {
  let done = 0;
  while (done < steps) {
    await move(direction);
    done += 1;
  }
}

await drive('south', 4);
await drive('east', 2);`,
  },
  {
    id: 'arrays',
    title: 'Arrays — a list of values',
    body:
      'An array holds several values in one place, written between square brackets and separated by commas. ' +
      'You reach an item by its position, counting from zero, and length tells you how many there are. ' +
      'A route across your bigger factory floor is nothing more than a list of directions.',
    codeExample: `const route = ['south', 'south', 'east', 'east'];

let step = 0;
while (step < route.length) {
  await move(route[step]);
  step += 1;
}`,
  },
  {
    id: 'objects',
    title: 'Objects — values with names',
    body:
      'An object groups values under names instead of positions, written between curly braces as name: value pairs. ' +
      'You read one back with a dot, like spot.x. ' +
      'Most things the game hands you are objects already — position() gives you an x and a y, and scanAt() describes a tile the same way.',
    codeExample: `const smelter = { x: 3, y: 3 };
const here = position();

print(here.x, here.y);
print(await scanAt(smelter.x, smelter.y));`,
  },
  {
    id: 'for_of',
    title: 'for…of — one turn per item',
    body:
      'A for…of loop walks through an array and hands you one item at a time, without you counting positions yourself. ' +
      'It replaces the counter, the condition and the index lookup with a single line. ' +
      'On a floor this wide a route is a long list, and that is the difference between a script you can read and one you cannot.',
    codeExample: `const route = ['south', 'south', 'east'];

for (const direction of route) {
  await move(direction);
}`,
  },
  {
    id: 'sorting',
    title: 'Sorting — putting a list in order',
    body:
      'Sorting rearranges a list so its items climb (or fall) by some key — here, purity. ' +
      'The simplest way is a bubble sort: walk the list comparing each pair of neighbours, swap the ones out of order, and repeat the whole pass until a pass makes no swaps. ' +
      'It is not the fastest sort, but it is the one you can write from memory, and the press does not care how you got there — only that the slots climb.',
    codeExample: `// Bubble sort the 8 press slots by purity.
for (let pass = 0; pass < 8; pass++) {
  for (let i = 0; i < 7; i++) {
    const here = (await scan()).slots[i];
    const next = (await scan()).slots[i + 1];
    if (next !== null && (here === null || here > next)) {
      await swapSlots(i, i + 1);
    }
  }
}
await press();`,
  },
  {
    id: 'recursion',
    title: 'Search — finding a path through the walls',
    body:
      'When walls block the straight route, you have to search for a way around. A breadth-first ' +
      'search fans out from the start one ring at a time, remembering where it came from, until it ' +
      'reaches the goal — and the first time it arrives is always by a shortest path. Keep a queue ' +
      'of tiles to visit and a set of the ones already seen, and you never walk in circles.',
    codeExample: `// Breadth-first search from [sx, sy] to [gx, gy].
const { width, height } = worldSize();
const seen = new Set([sx + ',' + sy]);
const queue = [[sx, sy]];

while (queue.length > 0) {
  const [x, y] = queue.shift();
  if (x === gx && y === gy) break;
  for (const [nx, ny] of neighbours(x, y)) {
    const key = nx + ',' + ny;
    const tile = await scanAt(nx, ny);
    if (tile.type !== 'wall' && !seen.has(key)) {
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
}`,
  },
  {
    id: 'modules',
    title: 'Modules — a library of your own',
    body:
      'Once a helper is worth keeping, it should live in one place instead of being pasted into ' +
      'every script. A module is a separate file that ends by exporting the pieces other scripts ' +
      'may use; the main script pulls them in with use(\'name\'), which runs the module once and ' +
      'hands back exactly what it exported. Keep a module pure — data goes in as arguments, answers ' +
      'come back as return values — and the same pathfinder serves every robot.',
    codeExample: `// Module "pathfinding": export the search, keep it pure.
export function bfs(start, goal, passable) {
  const seen = new Set([start.join(',')]);
  const queue = [[start, []]];
  while (queue.length > 0) {
    const [at, path] = queue.shift();
    if (at[0] === goal[0] && at[1] === goal[1]) return path;
    for (const step of steps(at)) {
      const key = step.join(',');
      if (passable(step) && !seen.has(key)) {
        seen.add(key);
        queue.push([step, [...path, step]]);
      }
    }
  }
  return null;
}

// Main script: bring it in and use it.
const { bfs } = use('pathfinding');
const route = bfs(position(), target, tileIsClear);`,
  },
  {
    id: 'promises',
    title: 'Promises — the thing await was waiting for',
    body:
      'A promise is an object that stands for a value that does not exist yet, and it always ends up in one of two states: fulfilled with a result, or rejected with an error. ' +
      'await is how you unwrap one — it hands you the result, or throws the error, once the promise settles. ' +
      'Signing in just made four of them: the game asked a server far away for your save and waited, exactly the way your script waits for the robot.',
    codeExample: `// await gives you the value inside
const tile = await scan();

// .then() is the same wait, written the older way
scan().then((tile) => print(tile));

// A rejected promise throws where you await it
try {
  await move('north');
} catch (error) {
  print('blocked:', error.message);
}`,
  },
  {
    id: 'fetch',
    title: 'fetch — asking another computer',
    body:
      'fetch sends a request over the network and returns a promise for the response. ' +
      'Nothing about it is instant, which is why it is a promise and why every line that uses it needs await. ' +
      'Your script cannot call it — the sandbox removes it, so a runaway loop can never talk to the internet — but this is what the game itself runs the moment you press Sign in.',
    codeExample: `const response = await fetch('https://example.com/save', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ credits: 400 }),
});

const data = await response.json();`,
  },
  {
    id: 'status_codes',
    title: 'Status codes — how a server answers',
    body:
      'Every HTTP response carries a three-digit number that says how it went, and the first digit is the whole story: 2xx worked, 4xx means the request was wrong, 5xx means the server broke. ' +
      '401 says you are not signed in and 403 says you are, but this is not yours — which is precisely what would come back if you asked for someone else’s save. ' +
      'A failed fetch does not throw; you have to look at response.ok yourself.',
    codeExample: `const response = await fetch(url);

if (!response.ok) {
  print('the server said', response.status);
}

// 200 ok - 401 not signed in
// 403 not yours - 404 no such thing
// 500 the server is having a bad day`,
  },
  {
    id: 'database_row',
    title: 'A row — where your factory now lives',
    body:
      'A database table is a grid: columns decide what can be stored, and each row is one thing that stores it. ' +
      'Your save is a single row in a table called game_saves, with a column for who you are, a column holding the entire factory as JSON, and a column for when it last changed. ' +
      'A rule on that table lets each row be read only by the account in its user_id column, which is why nobody else can load your factory even if they ask for it directly.',
    codeExample: `-- table: game_saves
-- user_id                              | state          | updated_at
-- 4f3c...  (you)                       | { "tick": 812 } | 15:04
-- 91ab...  (someone else)              | { "tick": 12 }  | 09:20

select state from game_saves;
-- returns exactly one row: yours`,
  },
];

/**
 * The four above that no purchase can reach.
 *
 * Everything else is earned inside the factory, but the cloud is not bought — it
 * is switched on, or never is. So these are reached by having been shown: the
 * first successful sign-in opens them and marks them seen, and from then on they
 * sit in the mission log alongside the rest. A player who never signs in never
 * meets them, which is correct: they would be answers to a question never asked.
 */
const CLOUD_CONCEPT_IDS: ConceptId[] = ['promises', 'fetch', 'status_codes', 'database_row'];

export function cloudConcepts(): ConceptDef[] {
  return CONCEPTS.filter((concept) => CLOUD_CONCEPT_IDS.includes(concept.id));
}

export const CONCEPT_COUNT = CONCEPTS.length;

export function getConcept(id: string): ConceptDef | undefined {
  return CONCEPTS.find((concept) => concept.id === id);
}

/** Position in the teaching order, counting from one — the "3 of 7" in the panel. */
export function conceptNumber(id: ConceptId): number {
  return CONCEPTS.findIndex((concept) => concept.id === id) + 1;
}

/**
 * Concepts the player has arrived at: an unlock they own introduces it. Each
 * concept now hangs from exactly one tech-tree node — the one whose mechanic
 * first makes the idea useful — so owning that node is what opens the lesson.
 */
export function reachedConcepts(state: GameState): ConceptDef[] {
  const reached = new Set<ConceptId>();

  for (const unlock of UNLOCKS) {
    if (unlock.conceptId && hasUnlock(state, unlock.id)) reached.add(unlock.conceptId);
  }
  // Seen is what reached means for these — see CLOUD_CONCEPT_IDS.
  for (const id of CLOUD_CONCEPT_IDS) {
    if (state.seenConcepts.includes(id)) reached.add(id);
  }

  return CONCEPTS.filter((concept) => reached.has(concept.id));
}

/** Reached but never shown — what the game still owes the player an explanation for. */
export function unseenConcepts(state: GameState): ConceptDef[] {
  return reachedConcepts(state).filter((concept) => !state.seenConcepts.includes(concept.id));
}

export function markConceptSeen(state: GameState, id: ConceptId): void {
  if (state.seenConcepts.includes(id)) return;
  state.seenConcepts.push(id);
}
