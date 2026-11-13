/**
 * Return the local Supabase status command in a form suitable for execFileSync.
 * @param {string} workdir
 * @param {NodeJS.Platform} [platform]
 */
export function getSupabaseStatusCommand(workdir, platform = process.platform) {
  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `& npx supabase status --workdir '${workdir}' -o env`,
      ],
    };
  }

  return {
    command: 'npx',
    args: ['supabase', 'status', '--workdir', workdir, '-o', 'env'],
  };
}
