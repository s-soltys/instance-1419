import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/engine/StateStore';
import { StoryletScheduler, type StoryletSpec } from '../../src/engine/StoryletScheduler';

describe('StoryletScheduler salience & predicate filtering', () => {
  const specs: StoryletSpec[] = [
    {
      id: 'low_prio_dream',
      knot: 'dream_shift1_audit',
      mode: 'dream_2d',
      once: false,
      priority: 5,
      conditions: { minShift: 1, maxShift: 2 },
    },
    {
      id: 'high_prio_dream',
      knot: 'dream_shift2_ambush',
      mode: 'dream_2d',
      once: true,
      priority: 20,
      conditions: { minShift: 2, minChaos: 25, maxHumanity: 80 },
    },
    {
      id: 'pirate_radio',
      knot: 'sibling_pirate',
      mode: 'waking_3d',
      once: true,
      priority: 30,
      conditions: {
        minShift: 3,
        requiresSecondarySibling: true,
        requiresProofs: ['j1419_caustic_seam'],
        forbidsCompleted: ['low_prio_dream'],
      },
    },
  ];

  it('picks highest-priority eligible storylet and respects maxShift / once / completed guards', () => {
    const scheduler = new StoryletScheduler(specs);
    const state = createInitialState();

    expect(scheduler.pickAvailable(state, 'dream_2d')?.id).toBe('low_prio_dream');

    const shift2State = { ...state, shift: 2, chaosDrift: 32, humanity: 70 };
    expect(scheduler.pickAvailable(shift2State, 'dream_2d')?.id).toBe('high_prio_dream');

    const doneShift2 = { ...shift2State, completedStorylets: ['high_prio_dream'] };
    expect(scheduler.pickAvailable(doneShift2, 'dream_2d')?.id).toBe('low_prio_dream');

    const shift3Blocked = { ...doneShift2, shift: 3 };
    expect(scheduler.pickAvailable(shift3Blocked, 'dream_2d')).toBeNull();
  });

  it('evaluates requiresSecondarySibling, requiresProofs, and forbidsCompleted accurately', () => {
    const scheduler = new StoryletScheduler(specs);
    const base = createInitialState();

    const almostReady = {
      ...base,
      shift: 3,
      secondarySiblingFound: true,
      proofFragments: ['j1419_caustic_seam'],
    };
    expect(scheduler.pickAvailable(almostReady, 'waking_3d')?.id).toBe('pirate_radio');

    const blocked = { ...almostReady, completedStorylets: ['low_prio_dream'] };
    expect(scheduler.pickAvailable(blocked, 'waking_3d')).toBeNull();
  });
});
