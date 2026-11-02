import { randomInt } from 'node:crypto';

// Egyptian mobile national numbers use 10[0-269] followed by seven digits.
const mobilePrefixes = ['100', '101', '102', '106', '109'] as const;
const generatedNumbers = new Set<string>();

export function generateEgyptianMobile(): string {
  for (;;) {
    const prefix = mobilePrefixes[randomInt(0, mobilePrefixes.length)]!;
    const subscriber = String(randomInt(0, 10_000_000)).padStart(7, '0');
    const number = `0${prefix}${subscriber}`;
    if (generatedNumbers.has(number)) continue;
    generatedNumbers.add(number);
    return number;
  }
}
