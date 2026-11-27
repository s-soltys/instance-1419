import { describe, expect, it } from 'vitest';
import anomaliesData from '../../src/content/anomalies.json';
import shiftsData from '../../src/content/shifts.json';
import { MINIGAME_CATALOG } from '../../src/engine/minigames/MinigameRegistry';
import type { TargetScaleClass } from '../../src/engine/minigames/types';
import { createInitialState } from '../../src/engine/StateStore';
import { StoryletScheduler, type StoryletSpec } from '../../src/engine/StoryletScheduler';
import { getInstrumentSchematic } from '../../src/ui/InstrumentSchematics';

const DISALLOWED_LICENSE_RX = /\b(?:CC\s*BY-SA|CC\s*BY-NC|GPL|AGPL)\b/i;

describe('Target Cohesion, Sky Reveal & StoryletScheduler Contracts', () => {
  it('enforces MINIGAME_CATALOG[a.minigameId].supportedScales includes a.scaleClass for all 21 anomalies', () => {
    expect(anomaliesData.anomalies.length).toBe(21);
    for (const anomaly of anomaliesData.anomalies) {
      const entry = MINIGAME_CATALOG[anomaly.minigameId];
      expect(entry, `Missing MINIGAME_CATALOG entry for ${anomaly.minigameId}`).toBeDefined();
      expect(
        entry.supportedScales.includes(anomaly.scaleClass as TargetScaleClass),
        `Anomaly "${anomaly.id}" (${anomaly.scaleClass}) is not supported by "${anomaly.minigameId}" (${entry.supportedScales.join(', ')})`
      ).toBe(true);
    }
  });

  it('validates realCatalogRef coordinates (RA [-180..360], Dec [-90..90]) and commercial-safe licenses', () => {
    for (const anomaly of anomaliesData.anomalies) {
      const ref = anomaly.realCatalogRef;
      expect(ref, `Missing realCatalogRef on ${anomaly.id}`).toBeDefined();
      expect(ref.raJ2000Deg).toBeGreaterThanOrEqual(-180);
      expect(ref.raJ2000Deg).toBeLessThanOrEqual(360);
      expect(ref.decJ2000Deg).toBeGreaterThanOrEqual(-90);
      expect(ref.decJ2000Deg).toBeLessThanOrEqual(90);
      expect(ref.sourceLicense.trim().length).toBeGreaterThan(3);
      expect(DISALLOWED_LICENSE_RX.test(ref.sourceLicense)).toBe(false);
    }
  });

  it('enforces monotonic skyRevealTier and anomalyPhase across Shifts 1–6', () => {
    const sorted = [...shiftsData.shifts].sort((a, b) => a.shift - b.shift);
    expect(sorted.length).toBe(6);

    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      expect(s.requiredTargets.length).toBe(2);
      expect(s.optionalTargets.length).toBeGreaterThanOrEqual(1);
      expect(s.optionalTargets.length).toBeLessThanOrEqual(2);
      expect(s.targetAnomalies).toEqual([...s.requiredTargets, ...s.optionalTargets]);
      expect(s.anomalyPhase.fractalStage).toBe(s.shift);

      if (i === 0) {
        expect(s.anomalyPhase.skyShellOpacity).toBe(0);
      } else {
        const prev = sorted[i - 1];
        expect(s.skyRevealTier.maxMagnitude).toBeGreaterThanOrEqual(prev.skyRevealTier.maxMagnitude);
        expect(s.skyRevealTier.starBudget).toBeGreaterThanOrEqual(prev.skyRevealTier.starBudget);
        expect(s.anomalyPhase.skyShellOpacity).toBeGreaterThanOrEqual(prev.anomalyPhase.skyShellOpacity);
        expect(s.anomalyPhase.minigameBleedIntensity).toBeGreaterThanOrEqual(
          prev.anomalyPhase.minigameBleedIntensity
        );
      }
    }

    expect(sorted[5].skyRevealTier.maxMagnitude).toBeGreaterThan(sorted[0].skyRevealTier.maxMagnitude);
    expect(sorted[5].skyRevealTier.starBudget).toBeGreaterThan(sorted[0].skyRevealTier.starBudget);
  });

  it('evaluates StoryletScheduler extended trigger conditions (exactShift, minOptionalScansThisShift, requiresFlag, priority)', () => {
    const scheduler = new StoryletScheduler();

    // Priority + exactShift + minOptionalScansThisShift: Shift 1 optional scan triggers shift1_optional_scan_echo (priority 20) over sibling_first_contact (priority 10)
    const s1WithOpt = {
      ...createInitialState(1419),
      shift: 1,
      anomalyProgress: 25,
      decodedMinigameTargets: ['sol_centauri_bearing', 'cluster_j1419_a', 'carina_rift_nebula'],
    };
    expect(scheduler.pickAvailable(s1WithOpt, 'waking_3d')?.id).toBe('shift1_optional_scan_echo');

    // exactShift prevents Shift 1 optional echo from firing on Shift 2 even with optional targets decoded
    const s2State = {
      ...createInitialState(1419),
      shift: 2,
      anomalyProgress: 25,
      decodedMinigameTargets: ['fomalhaut_glare_well', 'dust_polarized_veil', 'kepler_transit_arc'],
      completedStorylets: ['sibling_first_contact'],
    };
    expect(scheduler.pickAvailable(s2State, 'waking_3d')).toBeNull();

    // Test requiresFlag + priority ordering directly on custom scheduler specs
    const customSpecs: StoryletSpec[] = [
      {
        id: 'low_prio',
        knot: 'low_prio',
        mode: 'waking_3d',
        once: true,
        priority: 5,
        conditions: { exactShift: 2, requiresFlag: 'decoded_cluster_j1419_a' },
      },
      {
        id: 'high_prio',
        knot: 'high_prio',
        mode: 'waking_3d',
        once: true,
        priority: 30,
        conditions: {
          exactShift: 2,
          minOptionalScansThisShift: 1,
          requiresFlag: 'decoded_cluster_j1419_a',
        },
      },
    ];
    (scheduler as unknown as { specs: StoryletSpec[] }).specs = customSpecs;

    const missingFlag = {
      ...createInitialState(1419),
      shift: 2,
      decodedMinigameTargets: ['kepler_transit_arc'],
    };
    expect(scheduler.pickAvailable(missingFlag, 'waking_3d')).toBeNull();

    const flagNoOptional = {
      ...createInitialState(1419),
      shift: 2,
      decodedMinigameTargets: ['cluster_j1419_a'],
    };
    expect(scheduler.pickAvailable(flagNoOptional, 'waking_3d')?.id).toBe('low_prio');

    const flagWithOptional = {
      ...createInitialState(1419),
      shift: 2,
      decodedMinigameTargets: ['cluster_j1419_a', 'kepler_transit_arc'],
    };
    expect(scheduler.pickAvailable(flagWithOptional, 'waking_3d')?.id).toBe('high_prio');
  });

  it('provides an in-world Zeiss SVG schematic, 1-word goal, how-to-play, and controls for all 21 instruments', () => {
    const ids = Object.keys(MINIGAME_CATALOG);
    expect(ids.length).toBe(21);
    for (const id of ids) {
      const sch = getInstrumentSchematic(id);
      expect(sch.goalWord.trim().length).toBeGreaterThan(1);
      expect(sch.goalWord.includes(' ')).toBe(false);
      expect(sch.howToPlay.trim().length).toBeGreaterThan(12);
      expect(sch.controlsHint.trim().length).toBeGreaterThan(4);
      expect(sch.svg).toContain('<svg');
      expect(sch.svg).toContain('schematic-svg');
    }
  });
});
