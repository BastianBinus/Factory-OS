import type { ConceptDef, GameState, MissionDef } from '../game/types';
import { CONCEPTS, conceptNumber, reachedConcepts } from '../game/concepts';
import { MISSIONS, activeMission, getUnlock, missionProgress } from '../game/progression';
import { Drawer } from './Drawer';

/**
 * The mission chain, in order, with the one being worked on marked, and under it
 * every concept the game has explained so far.
 *
 * Every mission is listed from the start, including the ones far ahead. Seeing
 * that gears come after ingots is what makes the next command worth buying —
 * hiding the chain would turn a learning path back into a guessing game.
 *
 * The concept list is the other half of that: a modal you dismissed is gone, and
 * nobody remembers how for…of works on the first reading. This is where it lives
 * afterwards.
 */

export interface MissionPanelOptions {
  parent: HTMLElement;
  onToggle?: (open: boolean) => void;
  onOpenConcept?: (concept: ConceptDef) => void;
}

interface Row {
  mission: MissionDef;
  root: HTMLElement;
  status: HTMLElement;
  fill: HTMLElement;
}

interface ConceptRow {
  concept: ConceptDef;
  root: HTMLElement;
}

export class MissionPanel {
  readonly drawer: Drawer;

  private readonly rows: Row[] = [];
  private readonly conceptRows: ConceptRow[] = [];
  private readonly conceptSection: HTMLElement;

  constructor(options: MissionPanelOptions) {
    this.drawer = new Drawer({
      parent: options.parent,
      title: 'Missions',
      ...(options.onToggle ? { onToggle: options.onToggle } : {}),
    });

    const list = document.createElement('ol');
    list.className = 'drawer__list';

    for (const mission of MISSIONS) {
      const row = buildRow(mission);
      this.rows.push(row);
      list.appendChild(row.root);
    }

    this.conceptSection = document.createElement('div');
    this.conceptSection.className = 'drawer__section';

    const heading = document.createElement('span');
    heading.className = 't-label';
    heading.textContent = 'Concepts explained so far';

    const conceptList = document.createElement('ul');
    conceptList.className = 'conceptlist';

    // Built once and hidden, like the shop cards: this panel repaints on every
    // tick while it is open, and a rebuilt list drops focus out of a link.
    for (const concept of CONCEPTS) {
      const row = buildConceptRow(concept, () => options.onOpenConcept?.(concept));
      this.conceptRows.push(row);
      conceptList.appendChild(row.root);
    }

    this.conceptSection.append(heading, conceptList);
    this.drawer.body.append(list, this.conceptSection);
  }

  get isOpen(): boolean {
    return this.drawer.isOpen;
  }

  setOpen(open: boolean): void {
    this.drawer.setOpen(open);
  }

  toggle(): void {
    this.drawer.toggle();
  }

  render(state: GameState): void {
    const current = activeMission(state);
    const done = state.completedMissions.length;
    this.drawer.setNote(current ? `${done + 1} of ${MISSIONS.length}` : 'All done');

    for (const row of this.rows) {
      const finished = state.completedMissions.includes(row.mission.id);
      const isCurrent = current?.id === row.mission.id;
      const progress = missionProgress(state, row.mission);

      row.root.classList.toggle('mission--done', finished);
      row.root.classList.toggle('mission--active', isCurrent);

      row.status.textContent = finished ? 'Done' : `${progress.current} / ${progress.target}`;
      const share = progress.target === 0 ? 1 : progress.current / progress.target;
      row.fill.style.width = `${Math.round((finished ? 1 : share) * 100)}%`;
    }

    const reached = new Set(reachedConcepts(state).map((concept) => concept.id));
    for (const row of this.conceptRows) row.root.hidden = !reached.has(row.concept.id);
    // Before the first concept lands the heading would be promising nothing.
    this.conceptSection.hidden = reached.size === 0;
  }
}

function buildRow(mission: MissionDef): Row {
  const root = document.createElement('li');
  root.className = 'mission';
  root.dataset['mission'] = mission.id;

  const head = document.createElement('div');
  head.className = 'mission__head';

  const title = document.createElement('span');
  title.className = 't-title';
  title.textContent = mission.title;

  const status = document.createElement('span');
  status.className = 'mission__status';

  head.append(title, status);

  const summary = document.createElement('p');
  summary.className = 't-body t-muted';
  summary.textContent = mission.summary;

  const bar = document.createElement('div');
  bar.className = 'progress';
  const fill = document.createElement('i');
  fill.className = 'progress__fill';
  bar.appendChild(fill);

  const reward = document.createElement('p');
  reward.className = 'mission__reward';
  reward.textContent = describeReward(mission);

  root.append(head, summary, bar, reward);
  return { mission, root, status, fill };
}

function buildConceptRow(concept: ConceptDef, onOpen: () => void): ConceptRow {
  const root = document.createElement('li');

  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'conceptlink';
  link.addEventListener('click', onOpen);

  const number = document.createElement('span');
  number.className = 'conceptlink__no';
  number.textContent = String(conceptNumber(concept.id));

  const title = document.createElement('span');
  title.textContent = concept.title;

  link.append(number, title);
  root.appendChild(link);
  return { concept, root };
}

function describeReward(mission: MissionDef): string {
  const parts = [`${mission.rewardCredits} cr`];
  for (const id of mission.grants) parts.push(getUnlock(id)?.label ?? id);
  return `Reward: ${parts.join(' · ')}`;
}
