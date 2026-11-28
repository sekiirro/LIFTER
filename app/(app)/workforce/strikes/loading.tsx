import { Skeleton } from '../../../../components/ui/States';
import styles from '../../../../components/workforce/StrikeReview.module.css';

export default function LoadingStrikeReview() {
  return (
    <main className={styles.container} aria-busy="true" aria-live="polite">
      <Skeleton lines={6} shape="card" />
    </main>
  );
}
