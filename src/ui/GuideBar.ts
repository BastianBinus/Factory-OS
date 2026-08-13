import type { GameState } from '../game/types';
import { ONBOARDING_DONE } from '../game/GameState';
import { getConcept } from '../game/concepts';
import { missingResources } from '../game/economy';
import { nextUnlock } from '../game/progression';
import { describeInventory, totalItems } from '../game/resources';

/**
 * One line, always on screen, answering the only question a new player actually
 * has: what am I working toward right now.
 *
 * There are no missions to track, so this points at the next node the tech tree
 * makes reachable — what it costs, how close the fleet is to affording it, and
 * what it teaches. Clicking it opens the full tree. It is a signpost, never an
 * instruction: nothing here tells the player what to do, only what is next.
 *
 * It stays out of the way while the tutorial is running: two boxes of
 * instructions at once is one box too many.
 */

export interface GuideBarOptions {
  parent: HTMLElement;
  onOpen: () => void;
}

export class GuideBar {
  readonly element: HTMLButtonElement;

  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly count: HTMLElement;
  private readonly reward: HTMLElement;

  constructor(options: GuideBarOptions) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'guide';
    this.element.title = 'Open the tech tree';
    this.element.addEventListener('click', options.onOpen);

    const label = document.createElement('span');
    label.className = 't-label';
    label.textContent = 'Now';

    this.title = document.createElement('span');
    this.title.className = 'guide__title';

    this.text = document.createElement('span');
    this.text.className = 'guide__text';

    const bar = document.createElement('span');
    bar.className = 'progress guide__progress';
    this.fill = document.createElement('i');
    this.fill.className = 'progress__fill';
    bar.appendChild(this.fill);

    this.count = document.createElement('span');
    this.count.className = 'guide__count';

    this.reward = document.createElement('span');
    this.reward.className = 'guide__reward';

    this.element.append(label, this.title, this.text, bar, this.count, this.reward);
    options.parent.appendChild(this.element);
  }

  update(state: GameState): void {
    this.element.hidden = state.onboardingStep < ONBOARDING_DONE;

    const next = nextUnlock(state);
    if (!next) {
      this.title.textContent = 'The tree is bought out';
      this.text.textContent = 'Every upgrade is yours. Now make it faster.';
      this.count.textContent = '';
      this.reward.textContent = '';
      this.fill.style.width = '100%';
      return;
    }

    // How close the fleet is to affording it, so the bar fills as ore comes in.
    const need = totalItems(next.cost);
    const short = totalItems(missingResources(state, next.cost));
    const share = need === 0 ? 1 : (need - short) / need;

    this.title.textContent = `Next: ${next.label}`;
    this.text.textContent = next.description;
    this.count.textContent = describeInventory(next.cost);
    this.fill.style.width = `${Math.round(share * 100)}%`;

    const concept = next.conceptId ? getConcept(next.conceptId) : undefined;
    this.reward.textContent = concept ? `Teaches ${concept.title}` : '';
  }
}
