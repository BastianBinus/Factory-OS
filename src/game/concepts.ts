import type { ConceptDef, ConceptId, GameState } from './types';
import { MISSIONS, UNLOCKS } from './progression';
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
      'Now that scan() can tell the robot what it is standing on, it can decide instead of guessing.',
    codeExample: `const tile = await scan();

if (tile.type === 'ore') {
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
      'With a second robot and a list of places to be, that is the difference between a script you can read and one you cannot.',
    codeExample: `const route = ['south', 'south', 'east'];

for (const direction of route) {
  await move(direction);
}`,
  },
];

export const CONCEPT_COUNT = CONCEPTS.length;

export function getConcept(id: string): ConceptDef | undefined {
  return CONCEPTS.find((concept) => concept.id === id);
}

/** Position in the teaching order, counting from one — the "3 of 7" in the panel. */
export function conceptNumber(id: ConceptId): number {
  return CONCEPTS.findIndex((concept) => concept.id === id) + 1;
}

/**
 * Concepts the player has arrived at: something they own or have finished
 * introduces it. A concept can be carried by more than one row — scan() and the
 * mission that precedes it both point at `if_else` — so whichever comes first
 * opens it, and the other simply finds it already reached.
 */
export function reachedConcepts(state: GameState): ConceptDef[] {
  const reached = new Set<ConceptId>();

  for (const unlock of UNLOCKS) {
    if (unlock.conceptId && hasUnlock(state, unlock.id)) reached.add(unlock.conceptId);
  }
  for (const mission of MISSIONS) {
    if (mission.conceptId && state.completedMissions.includes(mission.id)) reached.add(mission.conceptId);
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
