// Rewrite existing sections rather than appending duplicate TOML tables.
export function restoreConfig(source) {
  const settings = {
    '': { project_id: '"lifter-restore"' },
    api: { port: '55321' },
    db: { port: '55322', shadow_port: '55320' },
    studio: { port: '55323' },
    inbucket: { port: '55324', smtp_port: '55325', pop3_port: '55326' },
    // 2.122 accepts inbucket as an alias, but explicit local_smtp takes precedence.
    local_smtp: { port: '55324', smtp_port: '55325', pop3_port: '55326' },
    analytics: { port: '55327', vector_port: '55328' },
    'db.pooler': { port: '55329' },
    edge_runtime: { inspector_port: '9083' },
  };
  let section = '';
  const seen = new Set(['']);
  const flush = () =>
    Object.entries(settings[section] ?? {}).map(
      ([key, value]) => `${key} = ${value}`,
    );
  const lines = [];
  for (const line of source.split(/\r?\n/)) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (table) {
      lines.push(...flush());
      section = table[1];
      seen.add(section);
    }
    const key = line.match(/^\s*([\w]+)\s*=/)?.[1];
    if (key && Object.hasOwn(settings[section] ?? {}, key)) continue;
    lines.push(line);
  }
  lines.push(...flush());
  for (const name of Object.keys(settings))
    if (!seen.has(name))
      lines.push(
        `[${name}]`,
        ...Object.entries(settings[name]).map(([k, v]) => `${k} = ${v}`),
      );
  return lines.join('\n');
}
