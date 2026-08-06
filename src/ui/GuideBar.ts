import type { GameState } from '../game/types';
import { ONBOARDING_DONE } from '../game/GameState';
import { activeMission, getUnlock, missionProgress } from '../game/progression';

/**
 * One line, always on screen, answering the only question a new player actually
 * has: what am I supposed to be doing right now.
 *
 * The mission log says the same thing in more detail, but a drawer you have to
 * open is a drawer you forget exists. This is the smallest version of it that
 * still says what to do, how far along you are, and what you get — and clicking
 * it opens the full log.
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
    this.element.title = 'Open the mission log';
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

    const mission = activeMission(state);
    if (!mission) {
      this.title.textContent = 'Every mission is done';
      this.text.textContent = 'The shop still has upgrades left.';
      this.count.textContent = '';
      this.reward.textContent = '';
      this.fill.style.width = '100%';
      return;
    }

    const progress = missionProgress(state, mission);
    const share = progress.target === 0 ? 1 : progress.current / progress.target;

    this.title.textContent = mission.title;
    this.text.textContent = mission.summary;
    this.count.textContent = `${progress.current} / ${progress.target}`;
    this.fill.style.width = `${Math.round(share * 100)}%`;

    const grants = mission.grants.map((id) => getUnlock(id)?.label ?? id);
    // The credits are the boring half of the reward; the new command is the
    // reason to keep going, so it is the half that gets the space.
    this.reward.textContent = grants.length > 0 ? `Unlocks ${grants.join(', ')}` : `${mission.rewardCredits} cr`;
  }
}
