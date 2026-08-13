import type { GameState, StageId } from '../game/types';
import { STAGES, bottleneck, windowRate } from '../game/rates';
import { Drawer } from './Drawer';

/**
 * The throughput graph: one bar per production stage, its length the stage's
 * share of the busiest stage, its number the rate per minute over the last
 * window. Under them, one line names the stage that is starved when there is one.
 *
 * This is where "make it faster" becomes something to watch: the bars grow as the
 * script improves. Rows are built once and only re-dressed, like the shop cards,
 * so the panel can repaint every tick without the DOM churning.
 */

const STAGE_LABEL: Record<StageId, string> = {
  seed: 'Seeding',
  mine: 'Mining',
  smelt: 'Smelting',
  assemble: 'Assembly',
  press: 'Pressing',
};

export interface RatesPanelOptions {
  parent: HTMLElement;
  onToggle?: (open: boolean) => void;
}

interface Row {
  stage: StageId;
  fill: HTMLElement;
  value: HTMLElement;
}

export class RatesPanel {
  readonly drawer: Drawer;

  private readonly rows: Row[] = [];
  private readonly note: HTMLElement;

  constructor(options: RatesPanelOptions) {
    this.drawer = new Drawer({
      parent: options.parent,
      title: 'Throughput',
      ...(options.onToggle ? { onToggle: options.onToggle } : {}),
    });

    const list = document.createElement('ul');
    list.className = 'rates';

    for (const stage of STAGES) {
      this.rows.push(this.buildRow(stage, list));
    }

    this.note = document.createElement('p');
    this.note.className = 'rates__note';

    this.drawer.body.append(list, this.note);
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
    const report = windowRate(state.history, state.tickRateMs);
    const rateOf = new Map(report.stages.map((entry) => [entry.stage, entry.perMinute]));
    const peak = Math.max(1, ...report.stages.map((entry) => entry.perMinute));

    this.drawer.setNote(`${report.totalPerMinute}/min`);

    for (const row of this.rows) {
      const rate = rateOf.get(row.stage) ?? 0;
      row.value.textContent = String(rate);
      row.fill.style.width = `${Math.round((rate / peak) * 100)}%`;
    }

    const starved = bottleneck(state);
    this.note.textContent = starved ? starved.reason : '';
    this.note.hidden = starved === null;
  }

  private buildRow(stage: StageId, list: HTMLElement): Row {
    const root = document.createElement('li');
    root.className = 'rates__row';

    const label = document.createElement('span');
    label.className = 'rates__label';
    label.textContent = STAGE_LABEL[stage];

    const bar = document.createElement('span');
    bar.className = 'rates__bar';
    const fill = document.createElement('i');
    fill.className = 'rates__fill';
    bar.appendChild(fill);

    const value = document.createElement('span');
    value.className = 'rates__value';
    value.textContent = '0';

    root.append(label, bar, value);
    list.appendChild(root);

    return { stage, fill, value };
  }
}
