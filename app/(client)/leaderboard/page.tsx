import { redirect } from 'next/navigation';

/**
 * S57-PO-12: "Top 5 belongs inside Progress, not Main Navigation." The old
 * deep link stays valid and lands on the Top 5 section of the client
 * Progress page; it renders nothing itself.
 */
export default function ClientLeaderboardRedirect() {
  redirect('/progress#leaderboard');
}
