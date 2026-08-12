import type { ConceptDef, GameState, UnlockDef } from '../game/types';
import { CONCEPTS, conceptNumber, getConcept, reachedConcepts } from '../game/concepts';
import { UNLOCKS, getUnlock, purchaseBlocker } from '../game/progression';
import { hasUnlock } from '../game/GameState';
import { missingResources } from '../game/economy';
import { describeInventory, totalItems } from '../game/resources';
import { Drawer } from './Drawer';

/**
 * The tech tree as the whole goal structure — there are no missions. Every
 * upgrade is listed in order, owned or not, so the player can see what is coming
 * and read the price as the objective. A locked node states its prerequisite or,
 * when the fleet just cannot cover the bill yet, exactly what it is short of.
 *
 * Under the tree sits every concept the game has explained: a modal you
 * dismissed is gone, and nobody remembers how for…of works on the first reading,
 * so this is where it lives afterwards.
 *
 * (The file is still MissionPanel.ts and the class still MissionPanel: the panel
 * kept its overlay slot when missions were removed, and only its contents changed.)
 */

export interface MissionPanelOptions {
  parent: HTMLElement;
  onToggle?: (open: boolean) => void;
  onOpenConcept?: (concept: ConceptDef) => void;
}

interface Row {
  unlock: UnlockDef;
  root: HTMLElement;
  status: HTMLElement;
  note: HTMLElement;
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
      title: 'Tech tree',
      ...(options.onToggle ? { onToggle: options.onToggle } : {}),
    });

    // The dependency graph is a forest of linear chains — every unlock has at
    // most one prerequisite — so it draws as a real tree: each root starts a
    // branch, and its single descendant chain hangs off it, indented and wired
    // with an elbow connector. A flat list threw that structure away.
    const tree = document.createElement('ul');
    tree.className = 'tree';

    for (const root of UNLOCKS.filter((unlock) => !unlock.requiresUnlocks?.length)) {
      tree.appendChild(this.buildBranch(root));
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
    this.drawer.body.append(tree, this.conceptSection);
  }

  /** A node, then its single descendant chain nested and wired beneath it. */
  private buildBranch(unlock: UnlockDef): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'tree__node';

    const card = buildCard(unlock);
    this.rows.push(card);
    li.appendChild(card.root);

    const child = UNLOCKS.find((other) => other.requiresUnlocks?.includes(unlock.id));
    if (child) {
      const kids = document.createElement('ul');
      kids.className = 'tree__kids';
      kids.appendChild(this.buildBranch(child));
      li.appendChild(kids);
    }

    return li;
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
    const owned = state.unlocks.length;
    this.drawer.setNote(`${owned} of ${UNLOCKS.length}`);

    for (const row of this.rows) {
      const has = hasUnlock(state, row.unlock.id);
      const blocker = has ? undefined : purchaseBlocker(state, row.unlock.id);

      row.root.classList.toggle('mission--done', has);
      row.root.classList.toggle('mission--active', blocker === undefined && !has);

      row.status.textContent = statusWord(has, blocker);
      const note = has ? '' : requirementNote(state, row.unlock, blocker);
      row.note.textContent = note;
      row.note.hidden = note === '';
    }

    const reached = new Set(reachedConcepts(state).map((concept) => concept.id));
    for (const row of this.conceptRows) row.root.hidden = !reached.has(row.concept.id);
    // Before the first concept lands the heading would be promising nothing.
    this.conceptSection.hidden = reached.size === 0;
  }
}

function statusWord(owned: boolean, blocker: ReturnType<typeof purchaseBlocker>): string {
  if (owned) return 'Owned';
  if (blocker === undefined) return 'Ready';
  if (blocker === 'unlock_locked') return 'Locked';
  return 'Saving';
}

function buildCard(unlock: UnlockDef): Row {
  const root = document.createElement('div');
  root.className = 'mission';
  root.dataset['unlock'] = unlock.id;

  const head = document.createElement('div');
  head.className = 'mission__head';

  const title = document.createElement('span');
  title.className = 't-title';
  title.textContent = unlock.label;

  const status = document.createElement('span');
  status.className = 'mission__status';

  head.append(title, status);

  const summary = document.createElement('p');
  summary.className = 't-body t-muted';
  summary.textContent = unlock.description;

  const note = document.createElement('p');
  note.className = 'mission__reward';

  const cost = document.createElement('p');
  cost.className = 'mission__reward';
  cost.textContent = describeCost(unlock);

  root.append(head, summary, cost, note);
  return { unlock, root, status, note };
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

function describeCost(unlock: UnlockDef): string {
  const teaches = unlock.conceptId ? getConcept(unlock.conceptId)?.title : undefined;
  const price = totalItems(unlock.cost) === 0 ? 'Free' : `Costs ${describeInventory(unlock.cost)}`;
  return teaches ? `${price} · teaches ${teaches}` : price;
}

/** The prerequisite that is missing, or the resources the fleet is short of. */
function requirementNote(
  state: GameState,
  unlock: UnlockDef,
  blocker: ReturnType<typeof purchaseBlocker>,
): string {
  if (blocker === 'unlock_locked') {
    const missing = (unlock.requiresUnlocks ?? [])
      .filter((id) => !hasUnlock(state, id))
      .map((id) => getUnlock(id)?.label ?? id);
    return `Needs ${missing.join(' and ')} first.`;
  }

  if (blocker === 'missing_resources') {
    return `Short ${describeInventory(missingResources(state, unlock.cost))}.`;
  }

  return '';
}
