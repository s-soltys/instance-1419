import anomaliesData from '../../content/anomalies.json';
import shiftsData from '../../content/shifts.json';
import uiCopy from '../../content/ui_copy.json';
import type { AudioEngine } from '../../engine/AudioEngine';
import {
  CodexEngine,
  type CodexCategoryId,
  type CodexSnapshot,
  type ResolvedCodexEntry,
} from '../../engine/CodexEngine';
import type { GameState, StateStore } from '../../engine/StateStore';

const ASTRO_PLATE_URLS = import.meta.glob<string>('../../../assets/astro/*.webp', {
  eager: true,
  import: 'default',
});

function resolvePlateUrl(plateAsset?: string): string | null {
  if (!plateAsset) return null;
  const filename = plateAsset.split('/').pop();
  if (!filename) return null;
  for (const [key, url] of Object.entries(ASTRO_PLATE_URLS)) {
    if (key.endsWith(`/${filename}`)) return url;
  }
  return null;
}

export interface CodexViewCallbacks {
  onFocusTarget: (targetId: string) => void;
  onLaunchCapstone: () => void;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Wake-World Survey Codex / Observatory Archive.
 * Strictly available in Wake World (waking_3d) — never in dream_2d.
 * Merges the Proof Dossier into the Evidence tab, renders verified NASA/JWST thumbnails,
 * tracks multi-stage progressive unlocks, and shows warmth-reactive observer marginalia.
 */
export class CodexView {
  private readonly root: HTMLElement;
  private readonly store: StateStore;
  private readonly audio: AudioEngine;
  private readonly codex: CodexEngine;
  private readonly callbacks: CodexViewCallbacks;

  private activeCategory: CodexCategoryId = 'evidence';
  private selectedEntryId: string | null = null;
  private openState = false;
  private lastSnapshot: CodexSnapshot | null = null;

  constructor(
    root: HTMLElement,
    store: StateStore,
    audio: AudioEngine,
    codex: CodexEngine,
    callbacks: CodexViewCallbacks
  ) {
    this.root = root;
    this.store = store;
    this.audio = audio;
    this.codex = codex;
    this.callbacks = callbacks;

    this.renderShell();
    this.bindEvents();
  }

  isOpen(): boolean {
    return this.openState;
  }

  open(category?: CodexCategoryId, entryId?: string): void {
    const state = this.store.getState();
    // Strictly Wake-World only — never open inside 2D Dream Cache
    if (state.mode === 'dream_2d') return;

    if (category) this.activeCategory = category;
    if (entryId) this.selectedEntryId = entryId;
    this.openState = true;

    const overlay = this.root.querySelector<HTMLElement>('#codex-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
    }
    this.syncState(state);
    this.callbacks.onOpenChange?.(true);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.querySelector<HTMLElement>('#codex-overlay')?.classList.add('hidden');
    this.callbacks.onOpenChange?.(false);
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  syncState(state: GameState): CodexSnapshot {
    // Auto-close immediately if entering 2D Dream View
    if (state.mode === 'dream_2d' && this.openState) {
      this.close();
    }

    const snap = this.codex.resolve(state);
    this.lastSnapshot = snap;

    if (this.openState) {
      this.renderContent(snap, state);
    }

    return snap;
  }

  private renderShell(): void {
    const stage = this.root.querySelector<HTMLElement>('.stage');
    if (!stage) return;

    stage.querySelector('#codex-overlay')?.remove();

    const copy = uiCopy.codex;
    const overlay = document.createElement('div');
    overlay.id = 'codex-overlay';
    overlay.className = 'modal-veil hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', copy.title);

    overlay.innerHTML = `
      <div class="modal-glass codex-modal">
        <header class="modal-header">
          <div class="modal-title-block">
            <span class="modal-eyebrow">${copy.eyebrow}</span>
            <h2 class="modal-title">${copy.title}</h2>
          </div>
          <div class="codex-header-meta">
            <span class="codex-progress-pill" id="codex-progress-pill">0 / 0 LOGS</span>
            <button class="etched-action" id="btn-codex-close" type="button">CLOSE [ESC]</button>
          </div>
        </header>

        <nav class="modal-tabs codex-tabs" id="codex-tabs" role="tablist" aria-label="Codex Categories"></nav>

        <div class="codex-workspace">
          <aside class="codex-index" id="codex-index" aria-label="Codex Entries"></aside>
          <article class="codex-detail" id="codex-detail" aria-live="polite"></article>
        </div>
      </div>
    `;

    stage.appendChild(overlay);
  }

  private bindEvents(): void {
    const overlay = this.root.querySelector<HTMLElement>('#codex-overlay');
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.audio.playCue('tick');
        this.close();
      }
    });

    overlay.querySelector('#btn-codex-close')?.addEventListener('click', () => {
      this.audio.playCue('tick');
      this.close();
    });
  }

  private selectEntry(entry: ResolvedCodexEntry): void {
    this.selectedEntryId = entry.spec.id;
    if (entry.unlocked && entry.hasUnread) {
      // Mark read on selection so unread counter updates cleanly
      this.store.markCodexEntrySeen(entry.spec.id, entry.unlockedStages.length);
    } else if (this.lastSnapshot) {
      this.renderContent(this.lastSnapshot, this.store.getState());
    }
  }

  private renderContent(snap: CodexSnapshot, state: GameState): void {
    const overlay = this.root.querySelector<HTMLElement>('#codex-overlay');
    if (!overlay) return;

    const totalProofCount = anomaliesData.anomalies.length;
    const pill = overlay.querySelector<HTMLElement>('#codex-progress-pill');
    if (pill) {
      pill.textContent = `${snap.totalUnlockedStages} / ${snap.totalStages} LOGS · ${state.proofDossier.length}/${totalProofCount} PROOFS`;
    }

    // 1. Category Tabs
    const tabsEl = overlay.querySelector<HTMLElement>('#codex-tabs');
    if (tabsEl) {
      tabsEl.innerHTML = snap.categories
        .map((cat) => {
          const catEntries = snap.entries.filter((e) => e.spec.category === cat.id);
          const unreadInCat = catEntries.filter((e) => e.hasUnread).length;
          const active = cat.id === this.activeCategory;
          const badge =
            unreadInCat > 0 ? `<span class="codex-tab-badge">${unreadInCat}</span>` : '';
          return `
            <button
              class="modal-tab ${active ? 'active' : ''}"
              data-codex-cat="${cat.id}"
              role="tab"
              aria-selected="${active}"
              type="button"
            >
              <span>${cat.label}</span>
              ${badge}
            </button>
          `;
        })
        .join('');

      tabsEl.querySelectorAll<HTMLButtonElement>('[data-codex-cat]').forEach((btn) => {
        btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
        btn.addEventListener('click', () => {
          this.audio.playCue('tick');
          this.activeCategory = btn.dataset.codexCat as CodexCategoryId;
          const firstInCat = snap.entries.find((e) => e.spec.category === this.activeCategory);
          this.selectedEntryId = firstInCat?.spec.id ?? null;
          if (firstInCat && firstInCat.unlocked && firstInCat.hasUnread) {
            this.store.markCodexEntrySeen(firstInCat.spec.id, firstInCat.unlockedStages.length);
          } else {
            this.renderContent(snap, this.store.getState());
          }
        });
      });
    }

    // 2. Entry Index for active category
    const categoryEntries = snap.entries.filter((e) => e.spec.category === this.activeCategory);
    let selected =
      categoryEntries.find((e) => e.spec.id === this.selectedEntryId) ?? categoryEntries[0] ?? null;

    if (selected) {
      this.selectedEntryId = selected.spec.id;
      // Keep track of freshly revealed stages for this render pass before marking seen
      const prevSeen = state.codexSeenStages[selected.spec.id] ?? 0;
      if (selected.unlocked && selected.unlockedStages.length > prevSeen) {
        // Schedule microtask so current view still highlights NEW ADDENDUM while counter updates
        const entryId = selected.spec.id;
        const stageCount = selected.unlockedStages.length;
        queueMicrotask(() => {
          if (this.openState && this.selectedEntryId === entryId) {
            this.store.markCodexEntrySeen(entryId, stageCount);
          }
        });
      }
    }

    const indexEl = overlay.querySelector<HTMLElement>('#codex-index');
    if (indexEl) {
      const catMeta = snap.categories.find((c) => c.id === this.activeCategory);
      const introHtml = catMeta
        ? `<p class="codex-cat-desc">${catMeta.description}</p>`
        : '';

      const listHtml = categoryEntries
        .map((entry) => {
          const isSelected = selected?.spec.id === entry.spec.id;
          const badgeClass =
            entry.statusLabel === 'NEW'
              ? 'badge-new'
              : entry.statusLabel === 'UPDATED'
                ? 'badge-updated'
                : 'badge-read';
          const badgeHtml =
            entry.statusLabel === 'NEW' || entry.statusLabel === 'UPDATED'
              ? `<span class="codex-status-pill ${badgeClass}">${entry.statusLabel}</span>`
              : `<span class="codex-rev-count">${entry.unlockedStages.length}/${entry.totalStages}</span>`;
          return `
            <button
              class="codex-index-item ${isSelected ? 'active' : ''} ${entry.unlocked ? '' : 'locked'}"
              data-codex-entry="${entry.spec.id}"
              type="button"
            >
              <div class="codex-item-top">
                <span class="codex-item-code">${entry.spec.code}</span>
                ${badgeHtml}
              </div>
              <strong class="codex-item-title">${entry.spec.title}</strong>
              <span class="codex-item-sub">${entry.spec.subtitle}</span>
            </button>
          `;
        })
        .join('');

      indexEl.innerHTML = introHtml + `<div class="codex-index-list">${listHtml}</div>`;
      indexEl.querySelectorAll<HTMLButtonElement>('[data-codex-entry]').forEach((btn) => {
        btn.addEventListener('mouseenter', () => this.audio.playHoverTick());
        btn.addEventListener('click', () => {
          const targetEntry = categoryEntries.find((e) => e.spec.id === btn.dataset.codexEntry);
          if (targetEntry) {
            this.audio.playCue('choice');
            this.selectEntry(targetEntry);
          }
        });
      });
    }

    // 3. Detail Pane
    const detailEl = overlay.querySelector<HTMLElement>('#codex-detail');
    if (detailEl && selected) {
      detailEl.innerHTML = this.renderDetailHtml(selected, state);
      this.bindDetailActions(detailEl, selected);
    }
  }

  private renderDetailHtml(entry: ResolvedCodexEntry, state: GameState): string {
    const plateUrl = resolvePlateUrl(entry.spec.plateAsset);
    const plateHtml = plateUrl
      ? `
        <figure class="codex-plate-card">
          <img class="codex-plate-img" src="${plateUrl}" alt="${entry.spec.title}" decoding="sync" />
          ${entry.spec.plateCaption ? `<figcaption>${entry.spec.plateCaption}</figcaption>` : ''}
        </figure>
      `
      : '';

    const targetActionHtml =
      entry.spec.targetId && state.mode === 'waking_3d'
        ? `
          <button class="etched-action amber" id="btn-codex-focus-target" type="button">
            ${
              state.scannedAnomalyIds.includes(entry.spec.targetId)
                ? 'CALIBRATE INSTRUMENT ▸'
                : 'SLEW TELESCOPE TO BEARING ▸'
            }
          </button>
        `
        : '';

    const stagesHtml = entry.unlockedStages
      .map(
        (stage, idx) => `
        <section class="codex-stage ${stage.isNew ? 'is-fresh' : ''}">
          <div class="codex-stage-head">
            <span class="codex-stage-num">REV 0${idx + 1} · ${stage.tag}</span>
            ${stage.isNew ? '<span class="codex-fresh-tag">NEW ADDENDUM</span>' : ''}
          </div>
          <h4>${stage.heading}</h4>
          <p>${stage.body}</p>
        </section>
      `
      )
      .join('');

    const lockedHintHtml = entry.hasMoreStages
      ? `
        <div class="codex-locked-hint">
          <span class="codex-locked-label">FURTHER REVISIONS LOCKED (${entry.unlockedStages.length}/${entry.totalStages})</span>
          <p>${entry.spec.nextHint ?? 'Continue deep-sky scans and conversations to expand this log.'}</p>
        </div>
      `
      : '';

    // Merged Shift-Grouped Proof Dossier cards when viewing the Evidence category
    let proofDossierHtml = '';
    if (entry.spec.category === 'evidence') {
      const totalProofCount = anomaliesData.anomalies.length;
      const canCapstone = state.shift >= 5 || state.proofDossier.length >= 4;
      const targetShiftMap = new Map<string, number>();
      for (const sh of shiftsData.shifts) {
        for (const tid of sh.targetAnomalies) {
          targetShiftMap.set(tid, sh.shift);
        }
      }

      let cards = '';
      if (state.proofDossier.length === 0) {
        cards = `<p class="codex-dossier-empty">${uiCopy.codex.emptyProofHint}</p>`;
      } else {
        const grouped = new Map<number, typeof state.proofDossier>();
        for (const item of state.proofDossier) {
          const sh = targetShiftMap.get(item.targetId) ?? 1;
          const arr = grouped.get(sh) ?? [];
          arr.push(item);
          grouped.set(sh, arr);
        }
        cards = [...grouped.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(
            ([shiftNum, items]) => `
              <div class="codex-proof-shift-group">
                <div class="codex-proof-shift-head">SHIFT ${shiftNum} ARCHIVE</div>
                ${items
                  .map(
                    (item) => `
                  <div class="codex-proof-card">
                    <div class="codex-proof-head">
                      <strong>[${item.instrumentCode}] ${item.title}</strong>
                      <span>${item.grade.replace('_', ' ').toUpperCase()}</span>
                    </div>
                    <p>${item.snippet || item.principle}</p>
                  </div>
                `
                  )
                  .join('')}
              </div>
            `
          )
          .join('');
      }

      proofDossierHtml = `
        <section class="codex-proof-section" aria-label="Decoded Proof Fragments">
          <div class="codex-proof-section-head">
            <strong>DECODED PROOF FRAGMENTS (${state.proofDossier.length}/${totalProofCount})</strong>
            <span>ANOMALY PROGRESS · ${state.anomalyProgress}%</span>
          </div>
          <div class="codex-proof-list">${cards}</div>
          ${
            canCapstone
              ? `<button class="etched-action amber" id="btn-codex-capstone" type="button">COMPOSE SHIFT-6 CARRIER (SIG-06) ▸</button>`
              : ''
          }
        </section>
      `;
    }

    const noteToneLabel =
      entry.annotationBand === 'warm'
        ? 'PERSONAL MARGINALIA · WARM REGISTER'
        : entry.annotationBand === 'mid'
          ? 'OBSERVER NOTE · STEADY REGISTER'
          : 'CLINICAL LOG · COOL REGISTER';

    return `
      <div class="codex-detail-head">
        <div>
          <span class="codex-detail-code">${entry.spec.code} · REV ${entry.unlockedStages.length}/${entry.totalStages}</span>
          <h3 class="codex-detail-title">${entry.spec.title}</h3>
          <p class="codex-detail-sub">${entry.spec.subtitle}</p>
        </div>
        ${targetActionHtml}
      </div>

      ${plateHtml}

      <div class="codex-stages">
        ${stagesHtml}
      </div>

      ${lockedHintHtml}
      ${proofDossierHtml}

      <blockquote class="codex-annotation band-${entry.annotationBand}">
        <span class="codex-annotation-label">${noteToneLabel}</span>
        <p>“${entry.annotationText}”</p>
      </blockquote>
    `;
  }

  private bindDetailActions(detailEl: HTMLElement, entry: ResolvedCodexEntry): void {
    detailEl.querySelector('#btn-codex-focus-target')?.addEventListener('click', () => {
      if (!entry.spec.targetId) return;
      this.audio.playCue('slew');
      this.close();
      this.callbacks.onFocusTarget(entry.spec.targetId);
    });

    detailEl.querySelector('#btn-codex-capstone')?.addEventListener('click', () => {
      this.audio.playCue('choice');
      this.close();
      this.callbacks.onLaunchCapstone();
    });
  }
}
