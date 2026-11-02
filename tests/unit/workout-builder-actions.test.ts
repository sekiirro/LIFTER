import { describe, expect, it } from 'vitest';
import { createWorkoutBuilderFixture } from '../../lib/plans/workout/builder-fixtures';
import {
  moveBuilderItem,
  moveBuilderItemBy,
} from '../../lib/plans/workout/builder-actions';

describe('workout builder keyboard actions', () => {
  it('moves items by keyboard and preserves the item and set ids and values', () => {
    const document = createWorkoutBuilderFixture('en').document;
    const originalBench = document.days[0]!.items![0]!;
    const movedDown = moveBuilderItemBy(
      document,
      document.days[0]!.id,
      originalBench.id,
      1,
    );

    expect(movedDown.days[0]!.items!.map((item) => item.id)).toEqual([
      document.days[0]!.items![1]!.id,
      originalBench.id,
    ]);
    expect(movedDown.days[0]!.items![1]).toEqual(originalBench);

    const movedAcross = moveBuilderItem(
      movedDown,
      document.days[0]!.id,
      originalBench.id,
      document.days[1]!.id,
    );
    const crossDayBench = movedAcross.days[1]!.items!.find(
      (item) => item.id === originalBench.id,
    );
    expect(crossDayBench).toEqual(originalBench);
    expect(crossDayBench!.sets.map((set) => set.id)).toEqual(
      originalBench.sets.map((set) => set.id),
    );
  });
});
