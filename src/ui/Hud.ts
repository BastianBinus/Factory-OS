import type { GameState } from '../game/types';
import { RESOURCES, RESOURCE_IDS } from '../game/resources';
import { createThemeToggle } from './ThemeToggle';

/**
 * The floating bar at the top: money on the left, cargo in the middle, the tick
 * counter and the theme toggle on the right.
 *
 * Two deliberate details. Numbers change hard rather than counting up — a
 * counter that animates is unreadable at 120 ms per tick — but a gain flashes
 * once, so money arriving is still noticeable out of the corner of the eye. And
 * a pill only exists while the fleet carries that resource, so the bar shows
 * the cargo holds rather than a row of zeroes.
 */

export interface HudOptions {
  parent: HTMLElement;
}

export class Hud {
  readonly element: HTMLElement;

  private readonly creditsOut: HTMLElement;
  private readonly cargo: HTMLElement;
  private readonly tickOut: HTMLElement;

  private readonly pills = new Map<string, { root: HTMLElement; value: HTMLElement }>();
  private readonly empty: HTMLElement;

  private lastCredits: number | null = null;

  constructor(options: HudOptions) {
    this.element = document.createElement('div');
    // Position comes from the `.topstack` it is placed in, not from the bar.
    this.element.className = 'hud';

    const creditsLabel = document.createElement('span');
    creditsLabel.className = 't-label';
    creditsLabel.textContent = 'Credits';

    this.creditsOut = document.createElement('span');
    this.creditsOut.className = 'hud__credits';
    this.creditsOut.textContent = '0';

    const creditsGroup = document.createElement('div');
    creditsGroup.className = 'hud__group';
    creditsGroup.append(creditsLabel, this.creditsOut);

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

    this.element.append(creditsGroup, this.cargo, spacer, this.tickOut, createThemeToggle());
    options.parent.appendChild(this.element);
  }

  update(state: GameState): void {
    this.paintCredits(state.credits);
    this.tickOut.textContent = `tick ${state.tick}`;
    this.paintCargo(state);
  }

  private paintCredits(credits: number): void {
    if (credits === this.lastCredits) return;
    const gained = this.lastCredits !== null && credits > this.lastCredits;
    this.lastCredits = credits;
    this.creditsOut.textContent = String(credits);

    if (!gained) return;
    // Restarting the animation needs the class gone for a frame, not just re-added.
    this.creditsOut.classList.remove('is-gain');
    void this.creditsOut.offsetWidth;
    this.creditsOut.classList.add('is-gain');
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
