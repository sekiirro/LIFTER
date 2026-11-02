'use client';

import { Button } from '../../ui/Button';

export function WorkoutPrintAction({ label }: { label: string }) {
  return (
    <Button data-screen-only="" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
