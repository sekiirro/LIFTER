import { NextResponse, type NextRequest } from 'next/server';
import { validateCorrectionRequest } from '../../../../../../lib/forms/corrections';
import {
  formsPrivateNoStoreHeaders,
  requestUsesHttps,
} from '../../../../../../lib/forms/privacy-contract';
import { createSessionClient } from '../../../../../../lib/supabase/server';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: formsPrivateNoStoreHeaders(),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  if (!requestUsesHttps(request))
    return response({ status: 'unavailable' }, 400);
  const { assignmentId } = await params;
  if (!uuidPattern.test(assignmentId))
    return response({ status: 'not_found' }, 404);
  const client = await createSessionClient();
  if (!client) return response({ status: 'unavailable' }, 503);
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user)
    return response({ status: 'not_found' }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ status: 'invalid' }, 400);
  }

  try {
    const { data: context, error: contextError } = await client.rpc(
      'read_form_assignment_context',
      { p_assignment_id: assignmentId },
    );
    if (contextError || !context) return response({ status: 'not_found' }, 404);
    const valid = validateCorrectionRequest(context.version_snapshot, body);
    if (!valid.ok) return response({ status: valid.code }, 400);

    const { data, error } = await client.rpc('correct_form_answer', {
      p_workspace_id: context.workspace_id,
      p_assignment_id: assignmentId,
      p_expected_revision: valid.expectedRevision,
      p_intent_key: valid.intentKey,
      p_answer_values: valid.answerValues,
      p_correction_note: valid.correctionNote,
    });
    if (error) return response({ status: 'unavailable' }, 503);
    const result = data as { status?: string } | null;
    const statusCode =
      result?.status === 'corrected'
        ? 200
        : result?.status === 'conflict' ||
            result?.status === 'relationship_ended' ||
            result?.status === 'not_submitted'
          ? 409
          : result?.status === 'not_found' || result?.status === 'not_permitted'
            ? 404
            : 400;
    return response(data, statusCode);
  } catch {
    return response({ status: 'unavailable' }, 503);
  }
}
