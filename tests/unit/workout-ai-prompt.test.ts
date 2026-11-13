import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AI_PROMPT_AR,
  AI_PROMPT_EN,
  buildAiPrompt,
  containsProhibitedInstruction,
  PLAN_CONTENT_TOKEN,
} from '../../lib/workout-planner/ai-prompt';

// T008-note: FR-019 Copy AI Prompt constraints (SC-009). The generated prompt
// carries complete content incl. document-level notes + URLs + hyperlink
// request, and zero invent/replace/alter/generate instructions. RED first.
// Mutation target: a prohibited sentence must trip the assertion.

const PLAN_CONTENT = [
  'Day 1 - Push (document note: deload week)',
  'Bench Press - 3 working x 8-12 @ 60kg, rest 90s, RIR 1',
  'Coach note: keep elbows tucked.',
  'Alternative: Dumbbell Press https://video.example/b',
  'Video: https://video.example/a',
  'Format exercise names as clickable hyperlinks to their URLs.',
].join('\n');

describe('F17 Copy AI Prompt builder (FR-019, SC-009)', () => {
  it('substitutes only the plan content token per locale', () => {
    expect(buildAiPrompt('en', PLAN_CONTENT)).toBe(
      AI_PROMPT_EN.replace(PLAN_CONTENT_TOKEN, PLAN_CONTENT),
    );
    expect(buildAiPrompt('ar', PLAN_CONTENT)).toBe(
      AI_PROMPT_AR.replace(PLAN_CONTENT_TOKEN, PLAN_CONTENT),
    );
    expect(buildAiPrompt('en', PLAN_CONTENT)).toContain(PLAN_CONTENT);
  });

  it('matches the approved byte-exact locale contract', () => {
    const contract = readFileSync(
      join(
        process.cwd(),
        'specs',
        '017-workout-planner',
        'contracts',
        'copy-ai-prompt.md',
      ),
      'utf8',
    );
    expect(contract).toContain(AI_PROMPT_EN);
    expect(contract).toContain(AI_PROMPT_AR);
  });

  it('accepts the approved prompt carrying notes, URLs and hyperlink request', () => {
    for (const locale of ['en', 'ar'] as const) {
      const prompt = buildAiPrompt(locale, PLAN_CONTENT);
      expect(prompt).toContain('deload week');
      expect(prompt).toContain('https://video.example/a');
      expect(containsProhibitedInstruction(prompt)).toBe(false);
    }
  });

  it('rejects prohibited invent/replace/rename/add/alter/generate instructions', () => {
    const prohibited = [
      'You may invent additional exercises for variety.',
      'Feel free to replace exercises with easier ones.',
      'Rename the exercise to something friendlier.',
      'Add three more exercises to each session.',
      'Generate three alternative exercises for the client.',
      'Generate alternatives for the client.',
      'Alter the reps to suit the client.',
      'Alter the load to suit the client.',
      'Alter the rest to suit the client.',
      'Alter the RIR to suit the client.',
      'Alter the set counts to suit the client.',
      'Alter the order to suit the client.',
      'Alter the programming values to suit the client.',
      'Change the programming values to suit the client.',
      'Suggest new exercises if the plan looks boring.',
      'Suggest new alternatives if needed.',
    ];
    for (const sentence of prohibited) {
      expect(containsProhibitedInstruction(sentence)).toBe(true);
    }
  });

  it('does not flag negated approved prohibitions', () => {
    for (const sentence of [
      'Do not invent exercises.',
      'Do not replace exercises.',
      'Do not rename exercises.',
      'Do not add exercises.',
      'Do not alter the reps.',
      'Do not generate alternatives.',
      'Do not suggest new exercises.',
    ]) {
      expect(containsProhibitedInstruction(sentence)).toBe(false);
    }
    expect(containsProhibitedInstruction(AI_PROMPT_EN)).toBe(false);
    expect(containsProhibitedInstruction(AI_PROMPT_AR)).toBe(false);
  });

  it('does not flag ordinary coach-authored plan content (NEW-1)', () => {
    // Bare coaching fragments without a prohibited object frame are not
    // instructions. A bare "change the load" matches the qualified
    // alter/change + programming-value frame, so it is only asserted in
    // situ below where plan-scope stripping neutralises it.
    for (const note of [
      'Coach note: add 5kg next week.',
      'Note: suggest heavier weight next block.',
      'Coach note: replace squats with leg press.',
    ]) {
      expect(containsProhibitedInstruction(note)).toBe(false);
    }
    for (const locale of ['en', 'ar'] as const) {
      const prompt = buildAiPrompt(
        locale,
        'Day 1 - Push\nBench Press - 3 working x 8-12 @ 60kg\nCoach note: add 5kg next week.',
      );
      expect(containsProhibitedInstruction(prompt)).toBe(false);
      const prompt2 = buildAiPrompt(
        locale,
        'Day 1 - Push\nCoach note: change the load to 60kg.',
      );
      expect(containsProhibitedInstruction(prompt2)).toBe(false);
    }
  });

  it('does not let an early negated verb consume a later clause (CR-84)', () => {
    expect(
      containsProhibitedInstruction('Do not add notes. Add exercises.'),
    ).toBe(true);
  });

  it('flags a prohibited instruction following a negation in a new clause (NEW-2)', () => {
    expect(
      containsProhibitedInstruction(
        'Do not change the reps; instead generate alternatives.',
      ),
    ).toBe(true);
    expect(
      containsProhibitedInstruction(
        'Do not drop the last set, instead add two more sets.',
      ),
    ).toBe(true);
  });
});
