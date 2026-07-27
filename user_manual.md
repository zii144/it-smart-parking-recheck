# User Manual — IT-Smart Parking Recheck (Public Access Fronting)

This describes how to use the system as deployed after the public-access-fronting rollout. It
covers three audiences: field inspectors, admin/back-office staff, and whoever operates the
deployment. As of 2026-07-27, this is the live, current state of **this repo**
(`it-smart-parking-recheck`) — the CD workflow, public/admin frontend split, and edge-proxy
described below were ported here from a sandbox copy of the project and are running for real on
the `parking-recheck` VM.

---

## 1. For field inspectors (public users)

**URL:** https://parking-recheck-public.pages.dev

No login required for the core flow. Open the URL in a mobile browser, then:

1. Scan the QR code printed on the paper parking-violation ticket.
2. The app looks up the ticket, checks whether it was issued late (>60 min after parking start)
   or is a duplicate, and shows the result.
3. Submit the case (photo evidence, notes) for back-office review.

This page is served as a static bundle from Cloudflare Pages — it contains **only** the
inspector-facing code; the admin console's code is not present in this bundle at all (verified
by build, not just hidden by a router). It talks to the backend over a separate public API
endpoint at `https://parking-recheck.tail176472.ts.net`, reachable only for the specific routes
inspectors need (login, ticket lookup, QR scan, case submission, health check, uploaded photos).
Any other backend route, including everything under `/api/admin/*`, is unreachable from this
path — the connection is dropped, not merely rejected.

If the app doesn't load or fails to submit a case, check with the operator (§3) — this could be
a Tailscale Funnel outage rather than an app bug, since the public API path depends on it.

---

## 2. For back-office / admin staff

**URL:** internal only — `http://192.168.122.13:8080`. Not reachable from the public internet,
and not reachable from Cloudflare Pages either — this is a deliberately separate,
same-origin-proxied container serving only the admin console bundle (AdminApp + the `/design`
showcase). Not exposed through Tailscale Funnel either (only the public inspector API on port
8090 is funneled).

**How to reach it — this is narrower than "the office LAN":** `parking-recheck`
(`192.168.122.13`) lives on a **NAT-only libvirt virtual network**, not the real office LAN
(`192.168.1.0/24`). Only two kinds of machine can route to it today:
1. The hypervisor host itself, or another VM colocated on the same virtual bridge.
2. A device joined to the **Tailscale tailnet** (`tail176472`) that the VM is already a member
   of (its tailnet address: `100.96.182.18`) — reachable over the mesh, *if* an ACL rule grants
   that device access. **No such ACL grant exists yet** — this is the intentionally-deferred
   design decision (Tailscale ACL vs. a VPN) mentioned below.

In practice, until that ACL/VPN decision is made and applied, reaching this URL means SSHing
into the hypervisor (or a colocated VM) and connecting from there — there's no ready remote
path yet. Ask the operator (§3) what's currently set up if you need remote admin access.

Once you can reach the URL:

1. Log in with your admin/manager/sysadmin credentials.
2. Review submitted cases, approve/reject, manage inspector and admin accounts, manage parking
   locations, adjust system settings, export reports (CSV/Excel), bulk-import via Excel.

**Getting your first login:** production ships with no seeded demo/admin accounts by design
(`SEED_DEMO_DATA=false`). If nobody has an account yet, ask the operator to run
`./pipeline.sh create-admin <username> [display-name] [manager|sysadmin]` on the VM.

---

## 3. For operators (deploying / maintaining this)

### 3.1 Where things run

Everything lives on the `parking-recheck` VM (`192.168.122.13`, SSH as `dy`), as four Docker
Compose services defined in `deploy/docker-compose.prod.yml`:

| Service | Purpose | Reachable from |
|---|---|---|
| `db` | PostgreSQL | internal only |
| `backend` | FastAPI app | internal only (proxied by `edge-proxy` and `frontend`) |
| `edge-proxy` | fail-closed allow-list nginx | `127.0.0.1:8090` on the VM → Tailscale Funnel → public internet |
| `frontend` | admin-only nginx + static bundle | `:8080` — only the hypervisor/colocated VMs today; see §2 |

Plus two things outside Docker on the VM itself:
- **Tailscale**, joined to tailnet `tail176472`, running `tailscale funnel --bg 8090` — this is
  what makes `edge-proxy` (and therefore the public API) reachable from the internet.
- Nothing else — the public *frontend* bundle isn't hosted here at all; it's on Cloudflare Pages.

Also running, outside this repo's compose stack but on the same VM: a dedicated Uptime Kuma
instance (`/opt/monitoring`, port 3001) and a nightly backup cron — these were set up as part of
the same DevOps rollout but their config isn't in this repo's git history yet (still sandbox-only
as of this writing; see §3.7).

### 3.2 Common operator commands

Run from `~/parking-recheck` on the VM (or from this repo's root when working locally before
syncing):

```bash
./pipeline.sh doctor              # check prerequisites/config before doing anything else
./pipeline.sh build-production    # build production images locally
./pipeline.sh deploy               # bring the stack up + verify (records last-good-tag)
./pipeline.sh verify                # health-check the running stack
./pipeline.sh status                # docker compose ps
./pipeline.sh logs [service]        # follow logs, optionally for one service
./pipeline.sh create-admin <user> [name] [manager|sysadmin]   # create/reset a real admin
./pipeline.sh rollback [tag]        # redeploy a previous image tag (defaults to last-good)
./pipeline.sh down                  # stop the stack (keeps data volumes)
```

### 3.3 Triggering a deploy (CD)

The `Deploy` GitHub Actions workflow (`.github/workflows/deploy.yml`) is
**`workflow_dispatch`-only — it never runs automatically after CI goes green.** This is
deliberate, not a gap to fix: GitHub's free plan blocks required-reviewer environment
protection rules on private repos, so there's no paid-tier gate to sit in front of an
automatic trigger. A human clicking "Run workflow" is the approval gate; the workflow itself
still independently re-verifies CI passed for the exact commit being deployed, so a manual
click can't accidentally deploy untested code. **Practical consequence: after every merge to
`main`, someone has to remember to trigger this by hand** — nothing deploys on its own.

**GitHub UI:** repo → Actions tab → "Deploy" (left sidebar) → "Run workflow" button (top
right) → optionally enter a specific commit SHA (defaults to the latest `main`) → "Run
workflow".

**CLI:**

```bash
gh workflow run Deploy --ref main
# or for a specific commit — use the FULL 40-character SHA, not a short one:
# actions/checkout resolves a short SHA as a branch/tag-name pattern, not a commit,
# and the checkout step fails.
gh workflow run Deploy --ref main -f sha=<full-commit-sha>

# watch it:
gh run list --workflow=Deploy --limit 1
gh run watch <run-id> --exit-status
```

**Timing gotcha:** if you just merged a PR, wait for the `push`-triggered `ci.yml` run on the
new merge commit to actually finish before dispatching `Deploy` — the "Confirm CI passed for
this exact commit" step checks CI results for that exact SHA, and a merge commit is a *new* SHA
that CI has to run again for, separately from whatever ran on the PR branch. Dispatching too
early fails closed (refuses to deploy, touches nothing) rather than deploying untested code, but
you'll need to re-dispatch once CI actually finishes.

Only deploys the VM-hosted Docker Compose stack (admin bundle + backend). It does **not**
touch Cloudflare Pages — see §3.3.1 below for the public (inspector) bundle, which needs its
own separate deploy step every time.

### 3.3.1 Deploying a frontend change

Two separate build/deploy paths now — don't confuse them:

```bash
cd production/frontend

# Public (inspector) bundle -> Cloudflare Pages
VITE_API_BASE="https://parking-recheck.tail176472.ts.net" npm run build:public
./scripts/verify-build-split.sh dist/public   # must print PASS before deploying
npx wrangler pages deploy dist/public --project-name=parking-recheck-public --branch=main

# Admin bundle -> rebuild the VM's internal `frontend` container
npm run build:admin   # sanity check locally if you want, not required
# then on the VM:
./pipeline.sh deploy   # rebuilds all services from the current production/ + compose file
```

`build:public` automatically renames its output to `dist/public/index.html` (Cloudflare Pages
only auto-serves `index.html` at `/`; Vite otherwise emits the build named after its source
entry file, `public.html`) — no manual rename step needed.

`verify-build-split.sh` is the safety net for the public bundle — it fails if any admin-only
code (detected via the `/api/admin/` string marker, which survives minification) leaks into the
public build. Never skip this check before a Pages deploy.

**Cloudflare Pages has no CI/CD hook** — merging to `main` and even running `Deploy` does
**not** update the public site. It stays frozen at whatever was last manually deployed via
`wrangler pages deploy` until someone runs the command above again. Treat "did my frontend
change reach the public site" as **no** by default unless this was actually run.

### 3.4 Checking the public path is still fail-closed

```bash
# From the VM itself, direct to the edge-proxy:
./deploy/edge-proxy/verify-allow-list.sh http://127.0.0.1:8090
# Expect: PASS: allow-list is fail-closed

# From outside the network, over the real public path:
curl -s -o /dev/null -w "%{http_code}\n" https://parking-recheck.tail176472.ts.net/api/health
# Expect: 200
curl -s -o /dev/null -w "%{http_code}\n" https://parking-recheck.tail176472.ts.net/api/admin/stats
# Expect: 502 (Tailscale Funnel's HTTP-terminating relay translates the edge-proxy's raw
# connection-drop into a 502 for internet clients — this is the correct signature at this layer,
# not a bug; a 200 or 403 here would be the actual red flag)
```

### 3.5 Tailscale Funnel maintenance

```bash
sudo tailscale status              # confirm still joined to tail176472
sudo tailscale funnel status        # confirm Funnel config is active (--bg persists across SSH sessions)
sudo tailscale funnel --bg 8090     # re-enable if it ever shows "No serve config"
```

If `tailscale funnel` ever needs re-authenticating or re-enabling from scratch, expect two
one-time human gates: `tailscale up` needs an interactive OAuth approval (opens a URL), and
Funnel itself needs a one-time per-tailnet admin-console enable (the CLI prints a separate URL
for this the first time). Both are one-time per tailnet, already done for `tail176472`.

### 3.6 Cloudflare Pages auth

`wrangler` (Cloudflare's CLI) needs `wrangler login` before `wrangler pages deploy` will work.
If running this from a **remote host** (not your own laptop): the OAuth callback server binds to
`localhost:8976` on whatever machine runs the command, so if your browser is on a different
device, its redirect to `localhost:8976` will fail even though login is otherwise fine — capture
the failed redirect URL from your browser's address bar and `curl` it directly against
`localhost:8976` on the remote host to complete the handshake manually. There's no global
`wrangler` binary installed by default — use `npx wrangler ...`.

### 3.7 Known limitations / open items

- **Admin remote-access mechanism is not yet decided** (Tailscale ACL vs. VPN) — currently
  reachable only from the hypervisor host or a colocated VM (see §2). Don't assume any
  particular remote path works for `:8080` until this is resolved.
- **No real end-to-end browser QR-scan test has been run yet** against the live public path —
  only protocol-level checks (curl, WebFetch, CORS preflight). Worth doing before treating this
  as fully field-verified.
- **Observability (Uptime Kuma) and backup/DR are running for real on the VM, but their
  Ansible/compose config is not yet committed to this repo** — they were set up via a sandbox
  copy of this project and still only exist there in git history. The services themselves are
  live and VM-level (not tied to which repo owns the CD workflow), so this doesn't affect
  day-to-day operation — it just means a from-scratch rebuild of this VM wouldn't yet reproduce
  them from this repo alone.
