import { isCloudConfigured } from '../cloud/supabaseClient';
import { signIn, signOut, signUp } from '../cloud/session';

/**
 * The account modal: an address, a password, and a way back out.
 *
 * It is deliberately the smallest sign-in form that can exist. Nothing in this
 * game is worth a password reset flow, an avatar or a profile page - an account
 * buys exactly one thing, which is the same factory on a second computer, and
 * the panel says so in one sentence rather than selling it.
 *
 * Signing in is never demanded. The game ran offline for seven phases and still
 * does; this is why the panel opens from a button and closes with Escape like
 * any other overlay, instead of standing in front of a new player at boot.
 */

export interface AuthPanelOptions {
  parent: HTMLElement;
  onSignedIn: (email: string) => void;
  onSignedOut: () => void;
  onSync: () => void;
}

type Mode = 'in' | 'up';

export class AuthPanel {
  readonly element: HTMLElement;

  private readonly status: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly intro: HTMLElement;
  private readonly email: HTMLInputElement;
  private readonly password: HTMLInputElement;
  private readonly submit: HTMLButtonElement;
  private readonly swap: HTMLButtonElement;
  private readonly note: HTMLElement;

  private readonly account: HTMLElement;
  private readonly accountLine: HTMLElement;
  private readonly syncButton: HTMLButtonElement;
  private readonly outButton: HTMLButtonElement;

  private readonly options: AuthPanelOptions;

  private open = false;
  private busy = false;
  private mode: Mode = 'in';
  private signedInAs: string | null = null;

  constructor(options: AuthPanelOptions) {
    this.options = options;

    this.element = document.createElement('div');
    this.element.className = 'modal';
    this.element.hidden = true;
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.close();
    });

    const card = document.createElement('div');
    card.className = 'panel auth';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Cloud save');

    const head = document.createElement('div');
    head.className = 'panel__head';

    const kind = document.createElement('span');
    kind.className = 't-label';
    kind.textContent = 'Cloud save';

    this.status = document.createElement('span');
    this.status.className = 't-label';

    head.append(kind, this.status);

    const body = document.createElement('div');
    body.className = 'panel__body auth__body';

    // Signed out ------------------------------------------------------------

    this.form = document.createElement('form');
    this.form.className = 'auth__form';
    this.form.noValidate = true;
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.send();
    });

    this.intro = document.createElement('p');
    this.intro.className = 't-prose t-muted';

    this.email = field(this.form, 'Email', 'email', 'username');
    this.password = field(this.form, 'Password', 'password', 'current-password');

    this.note = document.createElement('p');
    this.note.className = 'auth__note';
    this.note.hidden = true;

    this.swap = document.createElement('button');
    this.swap.type = 'button';
    this.swap.className = 'btn btn--ghost';
    this.swap.addEventListener('click', () => this.setMode(this.mode === 'in' ? 'up' : 'in'));

    this.submit = document.createElement('button');
    this.submit.type = 'submit';
    this.submit.className = 'btn btn--primary';

    const actions = document.createElement('div');
    actions.className = 'auth__actions';
    actions.append(this.swap, this.submit);

    this.form.prepend(this.intro);
    this.form.append(this.note, actions);

    // Signed in -------------------------------------------------------------

    this.account = document.createElement('div');
    this.account.className = 'auth__form';
    this.account.hidden = true;

    this.accountLine = document.createElement('p');
    this.accountLine.className = 't-prose';

    this.syncButton = document.createElement('button');
    this.syncButton.type = 'button';
    this.syncButton.className = 'btn btn--ghost';
    this.syncButton.textContent = 'Sync now';
    this.syncButton.title = 'Compare this browser with the cloud right now';
    this.syncButton.addEventListener('click', () => {
      this.options.onSync();
      this.close();
    });

    this.outButton = document.createElement('button');
    this.outButton.type = 'button';
    this.outButton.className = 'btn btn--primary';
    this.outButton.textContent = 'Sign out';
    this.outButton.addEventListener('click', () => void this.leave());

    const accountActions = document.createElement('div');
    accountActions.className = 'auth__actions';
    accountActions.append(this.syncButton, this.outButton);

    this.account.append(this.accountLine, accountActions);

    body.append(this.form, this.account);
    card.append(head, body);
    this.element.appendChild(card);
    options.parent.appendChild(this.element);

    this.setMode('in');
    this.setEmail(null);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The single source of what the panel shows: an address, or nothing. */
  setEmail(email: string | null): void {
    this.signedInAs = email;
    this.status.textContent = email ?? 'Not signed in';
    this.form.hidden = email !== null;
    this.account.hidden = email === null;
    this.accountLine.textContent = email === null ? '' : `Signed in as ${email}.`;

    if (email !== null) {
      this.password.value = '';
      this.setNote(null);
    }
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.element.hidden = false;

    if (!isCloudConfigured()) {
      this.form.hidden = true;
      this.account.hidden = false;
      this.accountLine.textContent =
        'This build has no cloud configured, so the factory is saved in this browser only.';
      this.syncButton.hidden = true;
      this.outButton.hidden = true;
      return;
    }

    if (this.signedInAs === null) this.email.focus();
    else this.outButton.focus();
  }

  close(): void {
    this.open = false;
    this.element.hidden = true;
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    const signingIn = mode === 'in';

    this.intro.textContent = signingIn
      ? 'An account keeps this factory in sync across browsers. Everything works without one.'
      : 'Pick anything you can remember. The address is only ever used to tell one save from another.';

    this.submit.textContent = signingIn ? 'Sign in' : 'Create account';
    this.swap.textContent = signingIn ? 'Create an account' : 'I already have one';
    this.password.autocomplete = signingIn ? 'current-password' : 'new-password';
    this.setNote(null);
  }

  private async send(): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    this.setNote(null);

    const email = this.email.value.trim();
    const result =
      this.mode === 'in' ? await signIn(email, this.password.value) : await signUp(email, this.password.value);

    this.setBusy(false);

    if (!result.ok) {
      this.setNote(result.message);
      this.password.select();
      return;
    }

    this.setEmail(result.email);
    this.close();
    this.options.onSignedIn(result.email);
  }

  private async leave(): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    await signOut();
    this.setBusy(false);

    this.setEmail(null);
    this.setMode('in');
    this.close();
    this.options.onSignedOut();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.submit.disabled = busy;
    this.swap.disabled = busy;
    this.outButton.disabled = busy;
    this.syncButton.disabled = busy;
  }

  private setNote(message: string | null): void {
    this.note.hidden = message === null;
    this.note.textContent = message ?? '';
  }
}

function field(
  form: HTMLFormElement,
  label: string,
  type: 'email' | 'password',
  autocomplete: AutoFill,
): HTMLInputElement {
  const wrap = document.createElement('label');
  wrap.className = 'field';

  const caption = document.createElement('span');
  caption.className = 't-label';
  caption.textContent = label;

  const input = document.createElement('input');
  input.className = 'input';
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = true;

  wrap.append(caption, input);
  form.appendChild(wrap);
  return input;
}
