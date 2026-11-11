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
      join(process.cwd(), 'specs', '017-workout-planner', 'contracts', 'copy-ai-prompt.md'),
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

  it('rejects prohibited invent/replace/alter/generate instructions', () => {
    const prohibited = [
      'You may invent additional exercises for variety.',
      'Feel free to replace exercises with easier ones.',
      'Generate three alternative exercises for the client.',
      'Alter the programming values to suit the client.',
      'Suggest new exercises if the plan looks boring.',
    ];
    for (const sentence of prohibited) {
      expect(containsProhibitedInstruction(sentence)).toBe(true);
    }
  });
});
