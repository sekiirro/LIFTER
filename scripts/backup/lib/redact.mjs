export function redact(value) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(
      /\bpassword\s*=\s*(?:'[^']*'|"[^"]*"|[^\s;]+)/gi,
      'password=[REDACTED]',
    )
    .replace(/AGE-SECRET-KEY-[A-Z0-9-]+/gi, '[REDACTED_KEY]');
}

/** Return one diagnostic, never stdout, SQL source, DETAIL, CONTEXT, or row data. */
export function firstErrorLine(stderr) {
  if (typeof stderr !== 'string') return undefined;
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:psql:(?:[^\r\n]*?:\s*)?)?((?:ERROR|FATAL):\s*.*)$/i,
    );
    if (!match) continue;
    // PostgreSQL errors can embed offending values in quotes. Withhold these
    // as well as credentials, even when they appear in the primary message.
    return redact(match[1])
      .replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"/g, '[REDACTED]')
      .slice(0, 1024);
  }
  return undefined;
}
