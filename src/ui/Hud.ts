import type { GameState } from '../game/types';
import { RESOURCES, RESOURCE_IDS } from '../game/resources';
import { createThemeToggle } from './ThemeToggle';

/**
 * The floating bar at the top: the fleet's cargo on the left, the tick counter
 * and the theme toggle on the right.
 *
 * Cargo is the wealth now — there is no separate money — so the pills double as
 * the balance the shop is spent from. A pill only exists while the fleet carries
 * that resource, so the bar shows the holds rather than a row of zeroes.
 */

export interface HudOptions {
  parent: HTMLElement;
}

export class Hud {
  readonly element: HTMLElement;

  private readonly cargo: HTMLElement;
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

    this.tickOut = document.createElement('span');
    this.tickOut.className = 'hud__tick';
    this.tickOut.textContent = 'tick 0';

    this.element.append(this.cargo, spacer, this.tickOut, createThemeToggle());
    options.parent.appendChild(this.element);
  }

  update(state: GameState): void {
    this.tickOut.textContent = `tick ${state.tick}`;
    this.paintCargo(state);
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
