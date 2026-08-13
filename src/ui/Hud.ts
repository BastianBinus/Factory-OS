import type { GameState } from '../game/types';
import { RESOURCES, RESOURCE_IDS } from '../game/resources';
import { windowRate } from '../game/rates';
import { createThemeToggle } from './ThemeToggle';

/**
 * The floating bar at the top: the fleet's cargo on the left, the throughput
 * meter and tick counter on the right.
 *
 * Cargo is the wealth now — there is no separate money — so the pills double as
 * the balance the shop is spent from. Beside the tick sits output/min over the
 * last minute with an arrow for the change since the minute before: the number
 * that moves when the player writes a better script.
 */

export interface HudOptions {
  parent: HTMLElement;
}

export class Hud {
  readonly element: HTMLElement;

  private readonly cargo: HTMLElement;
  private readonly rateOut: HTMLElement;
  private readonly rateDelta: HTMLElement;
  private readonly tickOut: HTMLElement;

  private readonly pills = new Map<string, { root: HTMLElement; value: HTMLElement }>();
  private readonly empty: HTMLElement;

  constructor(options: HudOptions) {
    this.element = document.createElement('div');
    // Position comes from the `.topstack` it is placed in, not from the bar.
    this.element.className = 'hud';

    this.cargo = document.createElement('div');
    this.cargo.className = 'hud__cargo';

    this.empty = document.createElement('span');
    this.empty.className = 'hud__idle';
    this.empty.textContent = 'cargo empty';
    this.cargo.appendChild(this.empty);

    const spacer = document.createElement('span');
    spacer.className = 'hud__spacer';

    const rateLabel = document.createElement('span');
    rateLabel.className = 't-label';
    rateLabel.textContent = 'Output/min';

    this.rateOut = document.createElement('span');
    this.rateOut.className = 'hud__rate';
    this.rateOut.textContent = '0';

    this.rateDelta = document.createElement('span');
    this.rateDelta.className = 'hud__delta';

    const rateGroup = document.createElement('div');
    rateGroup.className = 'hud__group';
    rateGroup.append(rateLabel, this.rateOut, this.rateDelta);

    this.tickOut = document.createElement('span');
    this.tickOut.className = 'hud__tick';
    this.tickOut.textContent = 'tick 0';

    this.element.append(this.cargo, spacer, rateGroup, this.tickOut, createThemeToggle());
    options.parent.appendChild(this.element);
  }

  update(state: GameState): void {
    this.tickOut.textContent = `tick ${state.tick}`;
    this.paintRate(state);
    this.paintCargo(state);
  }

  private paintRate(state: GameState): void {
    const report = windowRate(state.history, state.tickRateMs);
    this.rateOut.textContent = String(report.totalPerMinute);

    // Only a real change is worth an arrow; a flat rate stays unadorned.
    const up = report.delta > 0;
    const down = report.delta < 0;
    this.rateDelta.textContent = up || down ? `${up ? '↑' : '↓'} ${Math.abs(report.delta)}` : '';
    this.rateDelta.classList.toggle('hud__delta--up', up);
    this.rateDelta.classList.toggle('hud__delta--down', down);
  }

  private paintCargo(state: GameState): void {
    // Summed over the fleet: with two robots out there, a bar that showed only
    // the first one's cargo would keep going empty for no visible reason.
    const carried = new Map<string, number>();
    for (const robot of state.robots) {
      for (const id of RESOURCE_IDS) {
        const amount = robot.inventory[id] ?? 0;
        if (amount > 0) carried.set(id, (carried.get(id) ?? 0) + amount);
      }
    }

    this.empty.hidden = carried.size > 0;

    for (const id of RESOURCE_IDS) {
      const amount = carried.get(id) ?? 0;
      const existing = this.pills.get(id);

      if (amount <= 0) {
        existing?.root.remove();
        this.pills.delete(id);
        continue;
      }

      const pill = existing ?? this.createPill(id);
      pill.value.textContent = String(amount);
    }
  }

  private createPill(id: string): { root: HTMLElement; value: HTMLElement } {
    const resource = RESOURCES[id as keyof typeof RESOURCES];

    const root = document.createElement('span');
    root.className = 'pill';

    const dot = document.createElement('span');
    dot.className = 'pill__dot';
    dot.style.background = `var(--${resource.colorToken})`;

    const label = document.createElement('span');
    label.className = 'pill__label';
    label.textContent = resource.label;

    const value = document.createElement('span');
    value.className = 'pill__value';

    root.append(dot, label, value);
    this.cargo.appendChild(root);

    const entry = { root, value };
    this.pills.set(id, entry);
    return entry;
  }
}
