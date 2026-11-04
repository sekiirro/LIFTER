import { NextResponse, type NextRequest } from 'next/server';
import { validateDraftAnswers } from '../../../../../../lib/forms/drafts';
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
  if (
    typeof body !== 'object' ||
    body === null ||
    !('expected_revision' in body) ||
    !Number.isInteger(body.expected_revision) ||
    (body.expected_revision as number) < 0 ||
    !('intent_key' in body) ||
    typeof body.intent_key !== 'string' ||
    !uuidPattern.test(body.intent_key) ||
    !('answer_values' in body)
  ) {
    return response({ status: 'invalid' }, 400);
  }

  try {
    const { data: context, error: contextError } = await client.rpc(
      'read_form_assignment_context',
      { p_assignment_id: assignmentId },
    );
    if (contextError || !context) return response({ status: 'not_found' }, 404);
    const valid = validateDraftAnswers(
      context.version_snapshot,
      body.answer_values,
    );
    if (!valid.ok) return response({ status: valid.code }, 400);

    const { data, error } = await client.rpc('save_form_draft', {
      p_workspace_id: context.workspace_id,
      p_assignment_id: assignmentId,
      p_expected_revision: body.expected_revision as number,
      p_intent_key: body.intent_key,
      p_answer_values: valid.answerValues,
    });
    if (error) return response({ status: 'unavailable' }, 503);
    const result = data as { status?: string } | null;
    const statusCode =
      result?.status === 'saved'
        ? 200
        : result?.status === 'conflict' ||
            result?.status === 'already_submitted'
          ? 409
          : result?.status === 'not_found'
            ? 404
            : 400;
    return response(data, statusCode);
  } catch {
    return response({ status: 'unavailable' }, 503);
  }
}

export async function GET(
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

  try {
    const { data, error } = await client.rpc('read_client_form_draft', {
      p_assignment_id: assignmentId,
    });
    if (error || !data || typeof data !== 'object' || Array.isArray(data))
      return response({ status: 'not_found' }, 404);
    const result = data as {
      status?: unknown;
      revision?: unknown;
      answers?: unknown;
    };
    if (
      result.status !== 'loaded' ||
      !Number.isInteger(result.revision) ||
      !Number.isSafeInteger(result.revision) ||
      typeof result.answers !== 'object' ||
      result.answers === null ||
      Array.isArray(result.answers)
    )
      return response({ status: 'not_found' }, 404);
    return response(
      {
        status: 'loaded',
        revision: result.revision,
        answers: result.answers,
      },
      200,
    );
  } catch {
    return response({ status: 'unavailable' }, 503);
  }
}
