import './style/index';
import './styleguide.css';
import { createThemeToggle, initTheme, onThemeChange } from './ui/ThemeToggle';

initTheme();

const SURFACES = ['bg', 'surface', 'surface-2', 'surface-sunk', 'border', 'border-strong'];
const TEXT = ['text', 'text-muted', 'text-faint'];
const ACCENT = ['accent', 'accent-hover', 'accent-ink', 'accent-soft'];
const STATUS = ['danger', 'danger-soft', 'success', 'success-soft', 'info'];
const WORLD = [
  'w-floor',
  'w-floor-alt',
  'w-grid',
  'w-metal',
  'w-metal-dark',
  'w-robot',
  'w-ore-iron',
  'w-ore-copper',
  'w-ingot-iron',
  'w-ingot-copper',
  'w-gear',
  'w-heat',
  'w-sky',
];

function tokenValue(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

/** Swatches read their own value back from CSS, so they cannot drift from tokens.css. */
function swatchGrid(names: string[]): string {
  const cells = names
    .map(
      (name) => `
        <div class="sw" data-token="${name}">
          <div class="sw__chip" style="background: var(--${name})"></div>
          <span class="sw__name">--${name}</span>
          <span class="sw__value">${tokenValue(name)}</span>
        </div>`,
    )
    .join('');
  return `<div class="sg__grid">${cells}</div>`;
}

function section(title: string, body: string, note?: string): string {
  return `
    <section class="sg__section">
      <h2>${title}</h2>
      ${note ? `<p class="sg__note t-body">${note}</p>` : ''}
      ${body}
    </section>`;
}

const root = document.querySelector<HTMLDivElement>('#styleguide');
if (!root) throw new Error('#styleguide container is missing');

function render(): void {
  if (!root) return;
  root.innerHTML = `
    <div class="sg">
      <header class="sg__bar">
        <span class="t-label">Factory OS · Styleguide</span>
        <span class="sg__bar-spacer"></span>
        <a class="btn btn--ghost" href="/">Back to app</a>
        <span class="js-theme-toggle"></span>
      </header>

      ${section(
        'Surfaces',
        swatchGrid(SURFACES),
        'Panels are defined by a 1px border plus a surface step — not by heavy shadows. Shadows are reserved for elements that genuinely float above the world.',
      )}

      ${section('Text', swatchGrid(TEXT))}

      ${section(
        'Accent',
        swatchGrid(ACCENT),
        'Yellow appears on the robot, on exactly one primary button per screen, and on active states. Never as a panel background — the look depends on it staying rare.',
      )}

      ${section('Status', swatchGrid(STATUS))}

      ${section(
        'World',
        swatchGrid(WORLD),
        'The 3D renderer reads these at runtime via getComputedStyle, which is why switching the theme recolours the factory without a second colour table.',
      )}

      ${section(
        'Typography',
        `<div class="sg__stack">
          <div class="t-label">Label · 11 / 600 / uppercase</div>
          <div class="t-display">Display · 20 / 600 — Assembler online</div>
          <div class="t-title">Title · 15 / 600 — Production chain</div>
          <div class="t-body">Body · 13 / 450 — The robot mines ore, carries it to the smelter and feeds the ingots to the assembler.</div>
          <div class="t-prose">Prose · 14 / 1.65 — Used inside concept panels, where the text is meant to be read rather than scanned.</div>
          <div class="t-num">Numeric · 15 / 600 / tabular — 180/min · 0041 ticks</div>
          <pre class="concept__code">while (true) {
  await move('north');
  if (await scan() === 'iron_ore') {
    await mine();
  }
}</pre>
        </div>`,
        'Every number in the HUD uses tabular figures. Without them the bar jitters on every tick. Mono ligatures are switched off so a learner sees <code>=&gt;</code> as two characters.',
      )}

      ${section(
        'Spacing',
        `<div class="sg__spacing">
          ${[1, 2, 3, 4, 5, 6, 7, 8]
            .map(
              (step) =>
                `<div><i style="width: var(--sp-${step})"></i><span>sp-${step} · ${tokenValue(`sp-${step}`)}</span></div>`,
            )
            .join('')}
        </div>`,
      )}

      ${section(
        'Radius & elevation',
        `<div class="sg__row sg__radius">
          ${['control', 'card', 'panel']
            .map((key) => `<i style="border-radius: var(--r-${key})">r-${key}</i>`)
            .join('')}
          <i style="border-radius: var(--r-pill)">r-pill</i>
        </div>
        <div class="sg__row sg__shadow" style="margin-top: var(--sp-4)">
          ${[1, 2, 3].map((level) => `<i style="box-shadow: var(--sh-${level})">sh-${level}</i>`).join('')}
        </div>`,
      )}

      ${section(
        'Buttons',
        `<div class="sg__demo sg__demo--flat sg__stack">
          <div class="sg__row">
            <button class="btn btn--primary">Run</button>
            <button class="btn">Pause</button>
            <button class="btn btn--ghost">Tech tree</button>
            <button class="btn btn--danger">Stop</button>
            <button class="btn" disabled>Unavailable</button>
          </div>
          <div class="sg__row">
            <div class="btn-group">
              <button class="btn btn--primary">Run</button>
              <button class="btn">Pause</button>
              <button class="btn">Stop</button>
              <span class="btn-group__sep"></span>
              <button class="btn">Code</button>
              <button class="btn">Shop</button>
              <button class="btn">Tech tree</button>
              <button class="btn">Throughput</button>
            </div>
          </div>
          <div class="sg__row t-body t-muted">
            Shortcuts: <kbd>E</kbd> code · <kbd>Ctrl</kbd>+<kbd>↵</kbd> run · <kbd>Esc</kbd> stop
          </div>
        </div>`,
      )}

      ${section(
        'HUD',
        `<div class="sg__demo">
          <div class="hud">
            <span class="pill"><span class="pill__dot" style="background: var(--w-ore-iron)"></span><span class="pill__label">iron ore</span><span class="pill__value">12</span></span>
            <span class="pill"><span class="pill__dot" style="background: var(--w-ingot-copper)"></span><span class="pill__label">copper ingot</span><span class="pill__value">4</span></span>
            <span class="pill"><span class="pill__dot" style="background: var(--w-gear)"></span><span class="pill__label">gear</span><span class="pill__value">0</span></span>
            <span class="hud__spacer"></span>
            <div class="hud__group"><span class="t-label">Output/min</span><span class="hud__rate">180</span><span class="hud__delta hud__delta--up">↑ 40</span></div>
            <span class="hud__tick">tick 0041</span>
            <span class="js-theme-toggle"></span>
          </div>
        </div>`,
        'The cargo pills are the wealth — there is no separate money. On the right, output per minute over the last window, with an arrow for the change since the window before.',
      )}

      ${section(
        'Shop cards',
        `<div class="sg__cards">
          <div class="card card--affordable">
            <div class="card__head"><span class="t-title">trade(from, to)</span><span class="card__price">10 iron ore</span></div>
            <p class="t-body t-muted">Swap three of one ore for one of another. Market tile only.</p>
            <div class="card__actions"><code class="card__grants">trade()</code><span class="card__spacer"></span><button class="btn btn--sm">Buy</button></div>
          </div>
          <div class="card">
            <div class="card__head"><span class="t-title">craft() and take()</span><span class="card__price">25 iron ore</span></div>
            <p class="t-body t-muted">Start the machine below the robot, and collect what it produced.</p>
            <p class="card__note">Short 5 iron ore.</p>
            <div class="card__actions"><code class="card__grants">craft() take()</code><span class="card__spacer"></span><button class="btn btn--sm" disabled>Buy</button></div>
          </div>
          <div class="card card--owned">
            <div class="card__head"><span class="t-title">scan()</span><span class="card__check">Owned</span></div>
            <p class="t-body t-muted">Read what is on the tile the robot stands on.</p>
            <div class="card__actions"><code class="card__grants">scan()</code></div>
          </div>
          <div class="card card--locked">
            <div class="card__head"><span class="t-title">Second robot</span><span class="card__price">20 gear · 15 copper ingot</span></div>
            <p class="t-body t-muted">A second robot rolls off the ramp.</p>
            <p class="card__note">Needs Factory floor 16 x 16 first.</p>
            <div class="card__actions"><span class="card__spacer"></span><button class="btn btn--sm" disabled>Buy</button></div>
          </div>
        </div>`,
        'A card is priced in the material it takes. When the fleet cannot cover it, the shortfall is named; a missing prerequisite node is named instead.',
      )}

      ${section(
        'Tech tree',
        `<div class="sg__demo">
          <ul class="tree">
            <li class="tree__node">
              <div class="mission mission--done">
                <div class="mission__head"><span class="t-title">scan()</span><span class="mission__status">Owned</span></div>
                <p class="t-body t-muted">Read the tile below the robot.</p>
                <p class="mission__reward">Free</p>
              </div>
              <ul class="tree__kids">
                <li class="tree__node">
                  <div class="mission mission--active">
                    <div class="mission__head"><span class="t-title">scanAt(x, y)</span><span class="mission__status">Ready</span></div>
                    <p class="t-body t-muted">Read any tile in the factory.</p>
                    <p class="mission__reward">Costs 15 iron ingot · teaches If / else</p>
                  </div>
                </li>
              </ul>
            </li>
            <li class="tree__node">
              <div class="mission">
                <div class="mission__head"><span class="t-title">Cargo rack</span><span class="mission__status">Saving</span></div>
                <p class="t-body t-muted">The robot carries 20 items instead of 10.</p>
                <p class="mission__reward">Costs 10 iron ingot</p>
                <p class="mission__reward">Short 4 iron ingot.</p>
              </div>
            </li>
          </ul>
        </div>`,
        'There are no missions. The tree is the whole goal structure: each node is indented under the one it needs, and its price tag is the objective. A descendant is wired to its prerequisite with an elbow connector.',
      )}

      ${section(
        'Throughput',
        `<div class="sg__demo">
          <ul class="rates">
            <li class="rates__row"><span class="rates__label">Seeding</span><span class="rates__bar"><i class="rates__fill" style="width: 45%"></i></span><span class="rates__value">18</span></li>
            <li class="rates__row"><span class="rates__label">Mining</span><span class="rates__bar"><i class="rates__fill" style="width: 100%"></i></span><span class="rates__value">40</span></li>
            <li class="rates__row"><span class="rates__label">Smelting</span><span class="rates__bar"><i class="rates__fill" style="width: 0%"></i></span><span class="rates__value">0</span></li>
            <li class="rates__row"><span class="rates__label">Assembly</span><span class="rates__bar"><i class="rates__fill" style="width: 15%"></i></span><span class="rates__value">6</span></li>
          </ul>
          <p class="rates__note">smelt is starved: material is waiting but nothing is coming out.</p>
        </div>`,
        'One bar per production stage, its length its share of the busiest stage. When a stage has material waiting yet produces nothing, it is named as the bottleneck.',
      )}

      ${section(
        'Console',
        `<div class="sg__console console">
          <div class="console__line console__line--print">iron_ore: 7</div>
          <div class="console__line console__line--system">Unlocked: trade() now works in the editor.</div>
          <div class="console__line console__line--error">
            <span class="console__text">craft is not defined</span>
            <button class="console__jump" type="button">line 4</button>
          </div>
          <div class="console__line console__line--error console__line--detail">craft() is not unlocked yet. Buy it in the Shop for 25 iron ore.</div>
        </div>`,
        'Three kinds of line, each with a coloured bar so they separate without being read: what the script printed, what the game says, what went wrong. An error carries the line it happened on as a button that jumps the editor there, and the advice goes underneath in a quieter voice — never instead of the message.',
      )}

      ${section(
        'Guidance',
        `<div class="sg__demo sg__stack">
          <button class="guide" type="button">
            <span class="t-label">Now</span>
            <span class="guide__title">Next: Cargo rack</span>
            <span class="guide__text">The robot carries 20 items instead of 10.</span>
            <span class="progress guide__progress"><i class="progress__fill" style="width: 60%"></i></span>
            <span class="guide__count">10 iron ingot</span>
            <span class="guide__reward">Teaches Arrays</span>
          </button>
          <aside class="coach" style="position: static; width: 320px">
            <div class="coach__head">
              <span class="t-label">Step 2 of 3</span>
              <button class="btn btn--ghost btn--sm">Skip</button>
            </div>
            <h2 class="t-title">Write your first command</h2>
            <p class="t-body t-muted">Uncomment the loop, or type <code>await move('south');</code> on a line of its own. The await is not decoration: without it the line does not wait for the robot.</p>
          </aside>
          <ul class="conceptlist" style="max-width: 360px">
            <li><button class="conceptlink"><span class="conceptlink__no">1</span><span>await — waiting for the robot</span></button></li>
            <li><button class="conceptlink"><span class="conceptlink__no">2</span><span>while — repeating without repeating yourself</span></button></li>
          </ul>
        </div>`,
        'The guide line is the smallest honest answer to "what now": the next reachable node, what it costs, and what it teaches. The coach card only appears for the first three steps and every step waits for the player to actually do the thing — there is no Next button, because a tutorial you can click through teaches the clicking.',
      )}

      ${section(
        'Concept panel & toast',
        `<div class="sg__demo sg__row" style="align-items: flex-start">
          <div class="panel concept">
            <div class="panel__head">
              <span class="t-label">New concept</span>
              <span class="t-label">2 of 7</span>
            </div>
            <div class="panel__body concept__body">
              <h2 class="t-display">while — repeating without repeating yourself</h2>
              <p class="t-prose">A while loop runs the block between its braces again and again, for as long as the condition in the parentheses stays true. while (true) never becomes false, so it keeps going until you press Stop — which is exactly what a factory robot should do.</p>
              <pre class="concept__code">while (true) {
  await move('south');
  await mine();
}</pre>
              <div class="concept__actions"><button class="btn btn--primary">Got it</button></div>
            </div>
          </div>
          <div class="toast">
            <span class="t-label">Unlocked</span>
            <span class="t-body"><code>scan()</code> is now available in the editor.</span>
          </div>
        </div>`,
        'The one modal in the game, and the only thing allowed to dim the factory. It appears once per concept, then lives in the tech tree where it can be re-read without the interruption.',
      )}
    </div>
  `;

  for (const slot of root.querySelectorAll('.js-theme-toggle')) {
    slot.replaceWith(createThemeToggle());
  }
}

render();
// Swatch labels print live values, so re-render when the palette changes.
onThemeChange(render);
