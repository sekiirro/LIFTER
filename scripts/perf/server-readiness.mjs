/** Wait for a spawned server, stopping promptly if its child process exits. */
export function waitForServerReady(
  child,
  url,
  label,
  { timeoutMs = 120_000, pollIntervalMs = 250 } = {},
) {
  let removeExitListeners = () => {};
  const exited = new Promise((_, reject) => {
    const onExit = (code, signal) => {
      const status = code !== null ? `with ${code}` : `with signal ${signal}`;
      reject(new Error(`${label} Next server exited ${status}`));
    };
    const onError = (error) => reject(error);
    child.once('exit', onExit);
    child.once('error', onError);
    removeExitListeners = () => {
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
    };
  });

  return (async () => {
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) {
          const status =
            child.exitCode !== null
              ? `with ${child.exitCode}`
              : `with signal ${child.signalCode}`;
          throw new Error(`${label} Next server exited ${status}`);
        }

        const controller = new AbortController();
        let timer;
        try {
          const pollDelay = new Promise((resolve) => {
            timer = setTimeout(
              () => resolve(false),
              Math.min(pollIntervalMs, deadline - Date.now()),
            );
          });
          const healthCheck = fetch(new URL('/api/health', url), {
            signal: controller.signal,
          })
            .then((response) => response.ok)
            .catch(() => false)
            .then((ready) => (ready ? true : pollDelay));
          const ready = await Promise.race([healthCheck, exited]);
          if (ready) return;
        } finally {
          controller.abort();
          if (timer) clearTimeout(timer);
        }
      }
      throw new Error(`${label} Next server did not become ready`);
    } finally {
      removeExitListeners();
    }
  })();
}
