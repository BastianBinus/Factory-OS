import './style/index';
import './boot.css';
import { createThemeToggle, initTheme } from './ui/ThemeToggle';

initTheme();

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app container is missing from index.html');

// Placeholder shell for Phase 0. The 3D viewport replaces this in Phase 2.
app.innerHTML = `
  <main class="boot">
    <div class="boot__card panel">
      <div class="panel__head">
        <span class="t-label">Factory OS</span>
        <span class="boot__toggle"></span>
      </div>
      <div class="panel__body boot__body">
        <h1 class="t-display">Foundation is in place.</h1>
        <p class="t-prose t-muted">
          Phase 0 ships the design tokens, typography and the theme system.
          The factory itself arrives in Phase 2.
        </p>
        <div class="boot__actions">
          <a class="btn btn--primary" href="/styleguide.html">Open styleguide</a>
        </div>
      </div>
    </div>
  </main>
`;

app.querySelector('.boot__toggle')?.replaceWith(createThemeToggle());
