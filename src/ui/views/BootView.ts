import uiCopy from '../../content/ui_copy.json';

/**
 * Populates the cold-boot screen from externalized src/content/ui_copy.json
 * and binds boot-mode entry actions.
 */
export class BootView {
  constructor(private readonly root: HTMLElement) {}

  populate(): void {
    const eyebrow = this.root.querySelector<HTMLElement>('#boot-eyebrow');
    const title = this.root.querySelector<HTMLElement>('#boot-title');
    const lines = this.root.querySelector<HTMLElement>('#boot-lines');
    const btn3d = this.root.querySelector<HTMLElement>('#btn-boot-3d');
    const btnDream = this.root.querySelector<HTMLElement>('#btn-boot-dream');
    const btnSettings = this.root.querySelector<HTMLElement>('#btn-boot-settings');

    if (eyebrow) eyebrow.textContent = uiCopy.boot.eyebrow;
    if (title) title.textContent = uiCopy.boot.title;
    if (lines) {
      lines.innerHTML = uiCopy.boot.lines
        .map((line, idx) => `<div class="boot-line" style="--line-idx:${idx}">${line}</div>`)
        .join('');
    }
    if (btn3d) btn3d.textContent = uiCopy.boot.actions.enterSky;
    if (btnDream) btnDream.textContent = uiCopy.boot.actions.enterDream;
    if (btnSettings) btnSettings.textContent = uiCopy.boot.actions.openSettings;
  }

  bindActions(onEnterSky: () => void, onEnterDream: () => void, onOpenSettings?: () => void): void {
    this.root.querySelector('#btn-boot-3d')?.addEventListener('click', onEnterSky);
    this.root.querySelector('#btn-boot-dream')?.addEventListener('click', onEnterDream);
    if (onOpenSettings) {
      this.root.querySelector('#btn-boot-settings')?.addEventListener('click', onOpenSettings);
    }
  }
}
