import type { Actor } from '../auth/authorize';
import { authorize } from '../auth/authorize';

const ALLOWED_STAFF_NAME_CHARACTERS = /^[\p{L}\p{M} \-'.]+$/u;
const EDGE_UNICODE_WHITE_SPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;
const NON_SPACE_WHITE_SPACE = /\p{White_Space}/u;

export function normalizeStaffDisplayName(value: string): string | null {
  const normalized = value
    .replace(EDGE_UNICODE_WHITE_SPACE, '')
    .normalize('NFC');
  const codePoints = Array.from(normalized);
  if (codePoints.length < 1 || codePoints.length > 80) return null;
  if (!ALLOWED_STAFF_NAME_CHARACTERS.test(normalized)) return null;
  if (
    codePoints.some(
      (character) => character !== ' ' && NON_SPACE_WHITE_SPACE.test(character),
    )
  ) {
    return null;
  }
  return normalized;
}

export function canReadStaffDisplayName(
  actor: Actor,
  targetActiveWorkspaceIds: readonly string[],
): boolean {
  if (actor.role === 'platform_owner') return true;
  if (actor.role !== 'trainer' && actor.role !== 'workspace_owner')
    return false;
  return targetActiveWorkspaceIds.some((workspaceId) =>
    authorize(actor, 'coaching_work', workspaceId),
  );
}

export function canWriteStaffDisplayName(
  actor: Actor,
  targetActiveWorkspaceIds: readonly string[],
): boolean {
  if (actor.role === 'platform_owner') return true;
  if (actor.role !== 'workspace_owner' || targetActiveWorkspaceIds.length === 0)
    return false;
  return targetActiveWorkspaceIds.every((workspaceId) =>
    authorize(actor, 'coaching_work', workspaceId),
  );
}
