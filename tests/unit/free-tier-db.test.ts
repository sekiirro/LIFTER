import { afterEach, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { main } from '../../scripts/free-tier/db-usage.mjs';

vi.mock('postgres', () => ({ default: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('rejects argv URLs and malformed count names before opening a connection', async () => {
  for (const argv of [
    ['--db-url', 'postgres://private'],
    ['postgres://private'],
    ['--count', 'public.jobs;drop'],
    ['--count', 'public.jobs,'],
  ]) {
    await expect(main(argv)).rejects.toThrow();
  }
  expect(postgres).not.toHaveBeenCalled();
});

it('requires the dedicated env variable without using DB_URL', async () => {
  vi.stubEnv('FREE_TIER_DB_URL', '');
  vi.stubEnv('DB_URL', 'postgres://private');
  await expect(main([])).rejects.toThrow('FREE_TIER_DB_URL is required');
  expect(postgres).not.toHaveBeenCalled();
});

it('uses a read-only transaction, bounded catalog reads and validated quoted counts', async () => {
  vi.stubEnv('FREE_TIER_DB_URL', 'postgres://synthetic.invalid');
  const statements: string[] = [];
  const quote = vi.fn();
  const tx = (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof strings === 'string') {
      quote(strings);
      return { identifier: strings };
    }
    const statement = strings.join('?');
    statements.push(statement);
    if (statement.includes('pg_database_size')) return [{ bytes: '100' }];
    if (statement.includes('pg_class'))
      return [{ table: 'public.jobs', total_bytes: '50', reltuples: 2 }];
    if (statement.includes('pg_tables')) {
      expect(values).toEqual(['public', 'jobs']);
      return [{}];
    }
    if (statement.includes('count(*)')) {
      expect(values).toEqual([{ identifier: 'public.jobs' }]);
      return [{ count: '2' }];
    }
    return [];
  };
  const begin = vi.fn(async (_mode, callback) => callback(tx));
  const end = vi.fn(async () => {});
  vi.mocked(postgres).mockReturnValue({ begin, end } as unknown as ReturnType<
    typeof postgres
  >);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
  await main(['--count', 'public.jobs']);
  expect(postgres).toHaveBeenCalledWith(
    'postgres://synthetic.invalid',
    expect.objectContaining({ max: 1, onnotice: expect.any(Function) }),
  );
  expect(begin).toHaveBeenCalledWith('read only', expect.any(Function));
  expect(statements[0]).toBe('set transaction read only');
  expect(statements[1]).toBe("set local statement_timeout = '15s'");
  expect(statements.join('\n')).toMatch(/public.*auth.*app_private/);
  expect(statements.join('\n')).toContain('limit 15');
  expect(quote).toHaveBeenCalledWith('public.jobs');
  expect(end).toHaveBeenCalledOnce();
});
