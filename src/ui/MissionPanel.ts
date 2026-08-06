import type { GameState, MissionDef } from '../game/types';
import { MISSIONS, activeMission, getUnlock, missionProgress } from '../game/progression';
import { Drawer } from './Drawer';

/**
 * The mission chain, in order, with the one being worked on marked.
 *
 * Every mission is listed from the start, including the ones far ahead. Seeing
 * that gears come after ingots is what makes the next command worth buying —
 * hiding the chain would turn a learning path back into a guessing game.
 */

export interface MissionPanelOptions {
  parent: HTMLElement;
  onToggle?: (open: boolean) => void;
}

interface Row {
  mission: MissionDef;
  root: HTMLElement;
  status: HTMLElement;
  fill: HTMLElement;
}

export class MissionPanel {
  readonly drawer: Drawer;

  private readonly rows: Row[] = [];

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

    this.drawer.body.appendChild(list);
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

function describeReward(mission: MissionDef): string {
  const parts = [`${mission.rewardCredits} cr`];
  for (const id of mission.grants) parts.push(getUnlock(id)?.label ?? id);
  return `Reward: ${parts.join(' · ')}`;
}
