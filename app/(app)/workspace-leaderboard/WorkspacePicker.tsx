import { Button } from '../../../components/ui/Button';
import styles from '../../../components/leaderboard/leaderboard.module.css';
import fieldStyles from '../../../components/ui/Field.module.css';
import type { WorkspaceOption } from './workspaces';

export function WorkspacePicker({
  workspaces,
  selectedId,
  label,
  submitLabel,
}: {
  workspaces: readonly WorkspaceOption[];
  selectedId: string;
  label: string;
  submitLabel: string;
}) {
  if (workspaces.length < 2) return null;
  return (
    <form method="get" className={styles.form}>
      {/* Design-system field; the picker may shrink below its longest
          workspace name so the page never scrolls sideways on mobile. */}
      <div className={[fieldStyles.field, styles.picker].join(' ')}>
        <label htmlFor="leaderboard-workspace">{label}</label>
        <select
          id="leaderboard-workspace"
          name="workspace"
          className={fieldStyles.input}
          defaultValue={selectedId}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="secondary">
        {submitLabel}
      </Button>
    </form>
  );
}
