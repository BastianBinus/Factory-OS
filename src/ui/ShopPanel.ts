import type { GameState, UnlockDef, UnlockId } from '../game/types';
import { hasUnlock } from '../game/GameState';
import { UNLOCKS, getMission, getUnlock, purchaseBlocker, visibleUnlocks } from '../game/progression';
import type { PurchaseFailure } from '../game/progression';
import { Drawer } from './Drawer';

/**
 * The tech tree as a grid of cards.
 *
 * Every card is built once and afterwards only re-dressed, never replaced. That
 * matters more than it looks: credits change on almost every tick while ore is
 * being sold, so this panel repaints constantly, and a rebuilt DOM would drop
 * keyboard focus out of the Buy button between two ticks.
 */

export interface ShopPanelOptions {
  parent: HTMLElement;
  onBuy: (id: UnlockId) => void;
  onToggle?: (open: boolean) => void;
}

interface Card {
  unlock: UnlockDef;
  root: HTMLElement;
  price: HTMLElement;
  note: HTMLElement;
  buy: HTMLButtonElement;
}

export class ShopPanel {
  readonly drawer: Drawer;

  private readonly cards: Card[] = [];

  constructor(options: ShopPanelOptions) {
    this.drawer = new Drawer({
      parent: options.parent,
      title: 'Shop',
      ...(options.onToggle ? { onToggle: options.onToggle } : {}),
    });

    const grid = document.createElement('div');
    grid.className = 'drawer__grid';

    for (const unlock of UNLOCKS) {
      const card = buildCard(unlock, () => options.onBuy(unlock.id));
      this.cards.push(card);
      grid.appendChild(card.root);
    }

    this.drawer.body.appendChild(grid);
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
    const visible = new Set(visibleUnlocks(state).map((unlock) => unlock.id));
    this.drawer.setNote(`${state.credits} cr`);

    for (const card of this.cards) {
      card.root.hidden = !visible.has(card.unlock.id);
      if (card.root.hidden) continue;
      dressCard(card, state);
    }
  }
}

function buildCard(unlock: UnlockDef, onBuy: () => void): Card {
  const root = document.createElement('article');
  root.className = 'card';
  root.dataset['unlock'] = unlock.id;

  const head = document.createElement('div');
  head.className = 'card__head';

  const title = document.createElement('span');
  title.className = 't-title';
  title.textContent = unlock.label;

  const price = document.createElement('span');
  price.className = 'card__price';

  head.append(title, price);

  const description = document.createElement('p');
  description.className = 't-body t-muted';
  description.textContent = unlock.description;

  const note = document.createElement('p');
  note.className = 'card__note';

  const buy = document.createElement('button');
  buy.type = 'button';
  buy.className = 'btn btn--sm';
  buy.textContent = 'Buy';
  buy.addEventListener('click', onBuy);

  const actions = document.createElement('div');
  actions.className = 'card__actions';

  // Which names appear in the editor is the reason to buy a command node, so it
  // is worth its own line rather than being buried in the description.
  if (unlock.commands?.length) {
    const grants = document.createElement('code');
    grants.className = 'card__grants';
    grants.textContent = unlock.commands.map((command) => `${command}()`).join(' ');
    actions.appendChild(grants);
  }

  const spacer = document.createElement('span');
  spacer.className = 'card__spacer';
  actions.append(spacer, buy);

  root.append(head, description, note, actions);
  return { unlock, root, price, note, buy };
}

function dressCard(card: Card, state: GameState): void {
  const blocker = purchaseBlocker(state, card.unlock.id);
  const owned = hasUnlock(state, card.unlock.id);

  card.root.classList.toggle('card--owned', owned);
  card.root.classList.toggle('card--affordable', blocker === undefined);
  card.root.classList.toggle('card--locked', blocker === 'mission_locked' || blocker === 'unlock_locked');

  card.price.className = owned ? 'card__check' : 'card__price';
  card.price.textContent = owned ? 'Owned' : `${card.unlock.cost} cr`;

  const note = owned ? '' : requirementNote(state, card.unlock, blocker);
  card.note.textContent = note;
  card.note.hidden = note === '';

  card.buy.hidden = owned;
  card.buy.disabled = blocker !== undefined;
}

/**
 * Only the requirements the price tag cannot express. `too_expensive` is left
 * silent on purpose — the card already shows the price and the drawer header
 * shows the balance, so a sentence saying the same thing is noise.
 */
function requirementNote(
  state: GameState,
  unlock: UnlockDef,
  blocker: PurchaseFailure | undefined,
): string {
  if (blocker === 'mission_locked') {
    const mission = unlock.requiresMission ? getMission(unlock.requiresMission) : undefined;
    return `Locked until the mission "${mission?.title ?? unlock.requiresMission}" is done.`;
  }

  if (blocker === 'unlock_locked') {
    const missing = (unlock.requiresUnlocks ?? [])
      .filter((id) => !hasUnlock(state, id))
      .map((id) => getUnlock(id)?.label ?? id);
    return `Needs ${missing.join(' and ')} first.`;
  }

  return '';
}
