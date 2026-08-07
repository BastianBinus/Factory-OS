import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/GameState';
import {
  CONCEPTS,
  CONCEPT_COUNT,
  cloudConcepts,
  conceptNumber,
  getConcept,
  markConceptSeen,
  reachedConcepts,
  unseenConcepts,
} from '../src/game/concepts';
import { MISSIONS, UNLOCKS, buyUnlock, evaluateMissions } from '../src/game/progression';

function ids(concepts: { id: string }[]): string[] {
  return concepts.map((concept) => concept.id);
}

describe('the concept registry', () => {
  it('has no duplicate ids', () => {
    expect(new Set(ids(CONCEPTS)).size).toBe(CONCEPT_COUNT);
  });

  it('numbers concepts in teaching order, counting from one', () => {
    expect(conceptNumber('await')).toBe(1);
    // The seven earned in the factory come first, the cloud lessons after them.
    expect(conceptNumber('for_of')).toBe(7);
    expect(conceptNumber('database_row')).toBe(CONCEPT_COUNT);
  });

  it('carries a title, a body and an example for every concept', () => {
    for (const concept of CONCEPTS) {
      expect(concept.title.length, concept.id).toBeGreaterThan(0);
      expect(concept.body.length, concept.id).toBeGreaterThan(40);
      expect(concept.codeExample.length, concept.id).toBeGreaterThan(0);
    }
  });

  // A row pointing at a concept that does not exist would silently teach nothing.
  it('resolves every conceptId named by an unlock or a mission', () => {
    for (const unlock of UNLOCKS) {
      if (unlock.conceptId) expect(getConcept(unlock.conceptId), unlock.id).toBeDefined();
    }
    for (const mission of MISSIONS) {
      if (mission.conceptId) expect(getConcept(mission.conceptId), mission.id).toBeDefined();
    }
  });

  it('is reachable in full — no concept is stranded without a trigger', () => {
    const triggered = new Set<string>();
    for (const unlock of UNLOCKS) if (unlock.conceptId) triggered.add(unlock.conceptId);
    for (const mission of MISSIONS) if (mission.conceptId) triggered.add(mission.conceptId);
    // The second trigger: signing in, which no row in the tech tree can express.
    for (const concept of cloudConcepts()) triggered.add(concept.id);

    for (const concept of CONCEPTS) expect(triggered.has(concept.id), concept.id).toBe(true);
  });

  it('reaches the cloud lessons only through the cloud', () => {
    const cloud = ids(cloudConcepts());
    expect(cloud).toEqual(['promises', 'fetch', 'status_codes', 'database_row']);

    for (const unlock of UNLOCKS) expect(cloud).not.toContain(unlock.conceptId);
    for (const mission of MISSIONS) expect(cloud).not.toContain(mission.conceptId);
  });
});

describe('what the player has reached', () => {
  it('starts with await alone, because move() is there from the first tick', () => {
    expect(ids(reachedConcepts(createInitialState()))).toEqual(['await']);
  });

  it('adds while once the first mission is done', () => {
    const state = createInitialState();
    state.stats.tilesMoved = 20;
    evaluateMissions(state);

    expect(ids(reachedConcepts(state))).toContain('while');
  });

  it('adds a concept when the unlock carrying it is bought', () => {
    const state = createInitialState();
    state.stats.tilesMoved = 20;
    state.stats.oreMined = 15;
    evaluateMissions(state); // m2 is what scan() waits for
    state.credits = 1000;

    expect(ids(reachedConcepts(state))).not.toContain('if_else');
    buyUnlock(state, 'scan');
    expect(ids(reachedConcepts(state))).toContain('if_else');
  });

  it('keeps the teaching order regardless of the order things were earned', () => {
    const state = createInitialState();
    state.credits = 10_000;
    buyUnlock(state, 'grid_12'); // arrays, taught fifth
    state.stats.tilesMoved = 20;
    evaluateMissions(state); // while, taught second

    expect(ids(reachedConcepts(state))).toEqual(['await', 'while', 'arrays']);
  });
});

describe('what the player has been shown', () => {
  it('owes an explanation for everything reached but unseen', () => {
    const state = createInitialState();
    expect(ids(unseenConcepts(state))).toEqual(['await']);
  });

  it('owes nothing once it has been marked seen', () => {
    const state = createInitialState();
    markConceptSeen(state, 'await');

    expect(unseenConcepts(state)).toEqual([]);
    expect(reachedConcepts(state)).toHaveLength(1);
  });

  it('does not record the same concept twice', () => {
    const state = createInitialState();
    markConceptSeen(state, 'await');
    markConceptSeen(state, 'await');

    expect(state.seenConcepts).toEqual(['await']);
  });

  /**
   * The cloud lessons invert the usual rule. Nothing in the factory can reach
   * them, so being shown is what puts them in the list — otherwise they would
   * disappear from the mission log the moment they were read.
   */
  it('counts a cloud lesson as reached once it has been shown', () => {
    const state = createInitialState();
    expect(ids(reachedConcepts(state))).not.toContain('promises');

    markConceptSeen(state, 'promises');

    expect(ids(reachedConcepts(state))).toContain('promises');
    // Reached and seen at the same moment: it is never owed a second showing.
    expect(ids(unseenConcepts(state))).not.toContain('promises');
  });

  // A save from an older build can name a concept this build no longer has.
  it('ignores a seen id that is not in the registry', () => {
    const state = createInitialState();
    state.seenConcepts.push('generators');

    expect(ids(unseenConcepts(state))).toEqual(['await']);
  });
});
