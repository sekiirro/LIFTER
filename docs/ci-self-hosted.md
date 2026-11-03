# Self-hosted GitHub Actions runner

Pull requests use the persistent self-hosted runner, isolated Supabase stack, and Docker Hub credentials only when the PR author association is `OWNER`. `MEMBER`, `COLLABORATOR`, `CONTRIBUTOR`, and `NONE` use hosted runners, receive no isolated-stack setting, and receive no Docker Hub secrets. This is the Product Owner's S30-PO-4 Q10 decision ("Owner only").

## Architecture

The repository uses a single repository-scoped runner named `lifter-wsl` with labels `self-hosted`, `linux`, `x64`, and `lifter-wsl`. It runs as the unprivileged `lifterrunner` account in the dedicated Ubuntu 24.04 WSL2 distro `lifter-ci`.

Docker CE runs inside `lifter-ci` and uses that distro's `/var/run/docker.sock`. It is a separate Docker Engine from Docker Desktop; do not enable Docker Desktop integration for `lifter-ci` or point its Docker context at Docker Desktop. Keep the existing Docker Desktop engine and Supabase stacks A–D running independently.

The repo variable `LIFTER_CI_RUNNER` selects the runner for all three existing CI jobs. If the variable is unset, the workflow uses `ubuntu-latest`. Setting it to `self-hosted` selects `lifter-wsl`. Playwright 1.64.1's Chromium OS dependencies are provisioned once in the distro; the self-hosted workflow downloads the pinned browser without requesting root access. Return to GitHub-hosted runners by unsetting the variable:

The self-hosted runner must never be online while the repository is public. If a temporary visibility change is ever required by another operation, stop the `lifter-wsl` service before making the repository public and keep it stopped until the repository is private again.

```sh
gh variable delete LIFTER_CI_RUNNER --repo sekiirro/LIFTER
```

## Supabase isolation and cleanup

The self-hosted integration and storage jobs work from their own checkout copy of `supabase/config.toml`. They change its project id to `lifter-stack-ci` and map API, database, shadow database, Studio, mail, analytics, edge inspector, and pooler ports to the unique range 56420–56429. The repo's tracked config remains unchanged. The self-hosted Next.js server and Playwright use port 3990; hosted jobs retain port 3000. The workflow derives PORT, APP_ORIGIN, and PLAYWRIGHT_BASE_URL from the selected app port, and checks 3990 is bindable inside lifter-ci before starting Supabase. CI must not bind lane ports 3000, 3315, 3417, 3418, 3427, 3437, or 3439; Stack B ports 25420–25429, Stack C 35420–35429, Stack D 45420–45429, Stack A 54320–54329, Windows dynamic TCP 54241–54340, or the isolated Supabase CI range 56420–56429. `LIFTER_SUPABASE_STACK=ci` makes the existing local-stack helpers validate the CI project id, ports, loopback endpoints, and container names just as they validate stacks A–D.

The single registered runner executes one job at a time, so Supabase jobs queue rather than sharing Docker concurrently. Before each self-hosted Supabase start, the job stops only `lifter-stack-ci` and waits for every mapped port to become bindable. The unconditional cleanup step stops that project and waits for port release again. The pinned Supabase CLI calls the mail service `mailpit`, even though its config section is still named `[inbucket]`; CI keeps Mailpit running because Auth uses it for local recovery email, and maps its SMTP and POP3 ports into the isolated range. Exclude names use the CLI service names. After cleanup, the self-hosted workflow runs `docker image prune --force` inside the dedicated `lifter-ci` engine. It removes dangling images only; it does not prune volumes, build cache, Docker Desktop images, or stacks A–D.

## Startup and service operations

`/etc/wsl.conf` enables systemd and disables Windows PATH inheritance in `lifter-ci`. The workflow also resolves the pinned Linux Supabase binary from the setup action's temporary extraction and invokes it by absolute path, avoiding Windows npm shims. The Docker daemon, runner service, and `lifter-wsl-keepalive.service` start under systemd. A Windows Scheduled Task starts only `lifter-ci` at the current user's logon and holds a `wsl.exe -d lifter-ci --exec /bin/sleep infinity` process so WSL stays running while the runner is idle. It uses an interactive current-user token and stores no password. Creating an additional machine-startup S4U trigger was denied without Windows elevation, so the current task starts after the user signs in. This task does not change global `.wslconfig` settings.

Check the runner and local engine from Windows:

```powershell
wsl -d lifter-ci --exec systemctl is-active docker
wsl -d lifter-ci --exec systemctl list-units 'actions.runner.*'
wsl -d lifter-ci --exec docker info
gh api repos/sekiirro/LIFTER/actions/runners
```

Check the Windows task with `Get-ScheduledTask -TaskName 'Lifter-CI-WSL-Startup'`. Its state should be `Running`. Start it manually for recovery with `Start-ScheduledTask -TaskName 'Lifter-CI-WSL-Startup'`.

## Updates and troubleshooting

The runner can auto-update when GitHub requests an update. For a planned manual update, stop its systemd service, download and verify the latest Linux x64 runner release in `/home/lifterrunner/actions-runner`, then follow the official runner update procedure and restart the service. Keep the runner repository-scoped and retain the `lifter-wsl` label.

If a job is queued, verify the runner API reports `lifter-wsl` online and that `LIFTER_CI_RUNNER=self-hosted`. If Supabase cannot start, check `systemctl status docker` and `docker info` inside `lifter-ci`, inspect app port 3990 and Supabase ports 56420–56429, and confirm `supabase/config.toml` in the job checkout has `project_id = "lifter-stack-ci"`. If a job failed before cleanup, use `supabase stop --workdir <job-checkout> --project-id lifter-stack-ci --no-backup` inside `lifter-ci`; do not use `docker system prune` or Docker Desktop commands.

## Reboot verification

A real host reboot must be scheduled when no local stacks or agents are active. After reboot, sign in to Windows and verify the task ran, `lifter-ci` is running, systemd reports Docker and the runner service active, and GitHub reports `lifter-wsl` online. Then confirm Docker Desktop stacks A–D retained their pre-reboot state and run one push plus one pull request workflow. The current setup does not claim a host reboot has been tested.
