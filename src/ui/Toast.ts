/**
 * Short-lived notices in the bottom-right corner.
 *
 * A toast exists for the case where the thing that happened is not on screen:
 * an error while the code panel is closed, an unlock the player has not opened
 * the shop to see. Anything permanent belongs in the console instead — a toast
 * that carries information you cannot get back is a toast that was a mistake.
 */

const LIFETIME_MS = 3000;

export type ToastKind = 'info' | 'error' | 'success';

export interface ToastOptions {
  parent: HTMLElement;
}

export class Toasts {
  readonly element: HTMLElement;

  constructor(options: ToastOptions) {
    this.element = document.createElement('div');
    this.element.className = 'toasts';
    this.element.setAttribute('aria-live', 'polite');
    options.parent.appendChild(this.element);
  }

  show(title: string, body = '', kind: ToastKind = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast--${kind}`;

    const heading = document.createElement('span');
    heading.className = 'toast__title';
    heading.textContent = title;
    toast.appendChild(heading);

    if (body) {
      const text = document.createElement('span');
      text.className = 'toast__body';
      text.textContent = body;
      toast.appendChild(text);
    }

    this.element.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('toast--leaving');
      // Removal waits for the fade so the stack does not jump under the others.
      window.setTimeout(() => toast.remove(), 200);
    }, LIFETIME_MS);
  }
}
