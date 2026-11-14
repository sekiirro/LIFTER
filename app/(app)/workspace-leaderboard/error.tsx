'use client';

import { LeaderboardError } from '../../../components/leaderboard/LeaderboardError';

export default function LeaderboardRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <LeaderboardError reset={reset} />;
}
