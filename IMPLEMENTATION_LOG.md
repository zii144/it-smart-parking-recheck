# Implementation Log — IT-Smart Parking Recheck DevOps

**Status: RECORD OF WHAT ACTUALLY HAPPENED**, as opposed to the sibling `proposed_*.md` /
`devops_plan.md` files, which are (still, mostly) proposals. This file exists because a real VM
was found already deployed ahead of what any planning doc described, and real changes have been
made to it since — future sessions need the actual sequence of events and the reasoning behind
each decision, not just the end state. Entries are grouped by topic, each dated. Newest work is
at the bottom of each section (chronological within topic).

---

## 1. Discovery: `parking-recheck` VM already existed, ahead of both repos' git history

**2026-07-24.** While investigating running VMs on the host (`iactor`, `.247`/`.248`), found a
third VM, `parking-recheck` (4 vCPU / 8 GB, Ubuntu 24.04, `192.168.122.13` on the libvirt
`default` NAT network), matching the exact sizing `proposed_provisioning.md` recommends —
created 2026-07-23, already running the full stack (`postgres:16-alpine`, `parking-backend`,
`parking-frontend` via `docker compose`, tag `nogit`).

**What made it notable:** the running build already had the Phase-0 hardening
(`proposed_provisioning.md` §"Real-repo-specific gaps") that neither this repo nor its git
history has committed yet — non-root backend `USER app`, live CSP with the CARTO allow-list,
`server_tokens off`, Docker log rotation. The deployed tree at `/home/dy/parking-recheck` on the
VM is a raw file copy (`Makefile`, `pipeline.sh`, `production/`, `deploy/`), **not a git
checkout** — no way to trace who ran the deploy or when via `git log`. `~/.bash_history` on the
host has no `virt-install`/`rsync` trace either. Treat the VM's filesystem, not this repo's
`main` branch, as the actual source of truth for what's live until someone reconciles the two.

**Decision:** don't try to reverse-engineer provenance further — proceed treating the VM as the
real target environment `proposed_provisioning.md` was planning for, and keep this log going
forward so the *next* gap-analysis session isn't starting from zero again.

---

## 2. LAN access (before this, only reachable from the hypervisor itself)

**Problem:** `parking-recheck` sits on libvirt's `default` NAT network
(`192.168.122.0/24`) — private to the hypervisor, no route from the office LAN
(`192.168.1.0/24`), no DNAT rule forwarding it either. This is normal libvirt NAT behavior, not
a misconfiguration — `devops-test`/`deltapath-uc` are the same way.

**Interim fix while a DMZ VLAN doesn't exist yet:** added a host-nginx reverse-proxy site
matching the existing convention already in use for other NAT-network VMs on this host
(`deltapath-uc` → `:9092`, the unrelated `manageparking-dev` → `:9095`, see §6 for why that one's
unrelated):

- `/etc/nginx/sites-available/parking-recheck-dev` (symlinked into `sites-enabled`), plain HTTP,
  `listen 9096`, `proxy_pass http://192.168.122.13:8080`.
- Reachable at **`http://192.168.1.247:9096`** from anywhere on the office LAN.
- This is explicitly a **dev/testing path**, not the production access path — the public-facing
  design is the DMZ VLAN 30 + edge-proxy work in `proposed_public_access_rollout.md`. Revisit
  whether to keep this port around once the real path is live (low risk either way — LAN-only).

---

## 3. Login was failing — root cause was an empty DB, not a bug

**2026-07-24.** User reported login failing through `:9096`. Investigation:
- Backend + DB were both healthy; `alembic_version` = `0004_admin_management`, schema fine.
- `admin_users` and `inspectors` tables both had **zero rows** — nobody had provisioned an
  account after the fresh deploy. Every login attempt correctly returned "帳號或密碼錯誤"
  (wrong username/password) because, literally, no accounts existed yet. Not a DB/backend
  defect.
- Separately (found while testing, not the actual cause): `CORS_ALLOW_ORIGINS` in
  `deploy/.env.production` was hardcoded to `http://192.168.122.13:8080` only, not the
  `:9096` LAN address — would have blocked any true cross-origin call from a browser. Fixed by
  making it comma-separated: `CORS_ALLOW_ORIGINS=http://192.168.122.13:8080,http://192.168.1.247:9096`.

**Accounts created** (custom, not the sandbox's stock demo usernames — user specified these
exact ones instead of `manager01`/`sysadmin01`/`insp01`/`insp02`):
| Username | Password | Type | Role / permission |
|---|---|---|---|
| `admin01` | `admin123` | admin console | `sysadmin` |
| `ins01` | `ins123` | inspector app | `has_permission=1` |

Created via `./pipeline.sh create-admin admin01 admin01 sysadmin` (built-in command) and a
one-off Python snippet run through `docker compose exec backend python -` for the inspector
(mirroring exactly what `create-admin` does internally — bcrypt hash via `app.security`, no
raw SQL) since `pipeline.sh` has no `create-inspector` equivalent.

**Deliberately reverted, don't redo without re-reading this:** first attempt was to flip
`SEED_DEMO_DATA=true` to get the sandbox's full built-in demo dataset (`insp01`/`insp02`,
`manager01`, `sysadmin01`, sample locations/case/QR codes). That requires overriding a
**hardcoded** production-hardening guard in `deploy/docker-compose.prod.yml`
(`SEED_DEMO_DATA: "false"`, comment: *"Production hardening: no demo accounts..."* — this exact
guard is why the sandbox's Bandit/security review passed clean). User redirected to two specific
custom accounts instead before that path was taken further, so:
- `deploy/docker-compose.prod.yml`: `SEED_DEMO_DATA: "false"` → `SEED_DEMO_DATA: ${SEED_DEMO_DATA:-false}`
  (parameterized, but **still defaults to false** — no functional change, just makes it a
  one-line override if ever needed again instead of a compose-file edit).
- The temporary `SEED_DEMO_DATA=true` line added to `deploy/.env.production` was removed again
  before it ever took effect. **`admin01`/`ins01` are the only two accounts that exist; the
  sandbox's stock demo accounts do not exist on this VM.**

**Still true and worth remembering:** `admin01`/`ins01`/passwords are effectively test
credentials living only in this VM's DB (not in git, unlike the sandbox's stock demo accounts
which *are* in git) — lower exposure than the `SEED_DEMO_DATA=true` path would have been, but
still: replace with real accounts (or at least rotate these) before the DMZ/public-access work
in §5 goes further than Phase A.

---

## 4. Host hardening blockers from `proposed_provisioning.md`, both closed 2026-07-24

Two items had been open since the original provisioning assessment (2026-07-23):

- **Unprivileged QEMU.** `sudo cat /etc/libvirt/qemu.conf | grep -E "^user|^group"` came back
  blank — that's actually the *pass* condition: Ubuntu's `libvirt-daemon-system` package default
  (when `user`/`group` are left commented out) is the dedicated unprivileged `libvirt-qemu`
  user, not root. Confirmed directly against the live process, not just inferred from config:
  `ps -eo user,pid,cmd | grep qemu-system` showed `parking-recheck`'s QEMU process running as
  `libvirt-qemu`. **Closed, no action needed.**

- **Storage isolation.** Original plan assumed `/var/vm-storage` ("vm-pool") had ZFS/LVM
  dataset-level isolation available. Actual finding: it's a single plain **XFS** filesystem
  (`/dev/sdb1`, 9.1TB) with quotas explicitly disabled at mount (`noquota`) — no `zpool`/`zfs`/
  meaningful `lvs` on this host at all. Enabling XFS project quotas would need a mount-option
  change affecting the *entire* filesystem (i.e. `devops-test`/`deltapath-uc`'s disks too), so
  that was ruled out as disproportionate for isolating one VM.
  - A second disk, `/dev/sda` (893.8GB, unpartitioned), was initially proposed as physical
    isolation — **user overruled this: that disk is SSD, reserved for something else, do not
    touch it.**
  - **What was actually done:** a **loopback-file-backed XFS volume**, still on the same 9TB
    drive, giving `parking-recheck` its own independent filesystem instance with a hard space
    ceiling, without remounting or otherwise touching the shared filesystem:
    - `parking-recheck` shut down cleanly (`virsh shutdown`, confirmed `shut off`).
    - `/var/vm-storage/.parking-recheck-vol.img` — 120GB sparse file (actual usage ~8.4GB at
      time of writing; grows on demand, capped at 120GB).
    - Formatted XFS, loop-mounted at `/var/vm-storage/parking-recheck-vol`.
    - `/etc/fstab` entry added (`loop,defaults,nofail`) so it survives reboot without blocking
      boot if the loop file is ever missing/corrupt.
    - `parking-recheck.qcow2` and `parking-recheck-seed.iso` moved into the new mount;
      ownership (`libvirt-qemu:kvm`) preserved by the move.
    - VM's libvirt XML redefined (`virsh dumpxml` → sed the two `<source file=...>` paths →
      `virsh define`) to point at the new location, then `virsh start`.
    - Verified: same IP reacquired (`192.168.122.13`), all three containers came back healthy
      (`backend` briefly restarted once while Postgres was still starting — self-recovered,
      expected), `:9096` end-to-end login re-verified working post-migration.
  - **Old path (`/var/vm-storage/parking-recheck.qcow2` at the top level) no longer exists —
    if a script or note anywhere still references it, it's stale.**

---

## 5. Public-facing DMZ rollout — in progress

Full design lives in `proposed_public_access_rollout.md` (builds on `proposed_provisioning.md` /
`proposed_network_diag.md`, doesn't re-litigate the architecture, just sequences execution).
Requirement: public IP reaches inspector/public routes; `/admin` and `/api/admin/*` must never
be reachable via the public path, only via VPN.

**Refinement made 2026-07-24, before starting Phase A:** the original plan's Phase A said to
*move* `parking-recheck`'s vNIC from the NAT network onto the new DMZ bridge network. Changed to
**add a second vNIC instead, keep the existing NAT one** — so the just-fixed LAN dev path
(`:9096`, `192.168.122.13`) keeps working throughout the VLAN/switch/router buildout instead of
going dark until Phases B and C (Aruba, DrayTek — both manual, outside this session's reach) are
also done. Retire the NAT NIC later, once the DMZ path is proven end-to-end.

**Phase A — done, 2026-07-24.** Host-side VLAN plumbing, executed and verified:
- `/etc/netplan/60-vlan30.yaml` applied: `eno8403.30` (802.1Q sub-interface, VLAN 30) enslaved
  to new bridge `br-vlan30`. Verified afterward that `eno8403`'s own address and existing
  services (AdGuard DNS on `.247:53`, `erp.it-smart.tw`) were unaffected.
- Bridged libvirt network `dmz-vlan30` (`forward mode='bridge'`, bound to `br-vlan30`) defined,
  started, autostart enabled.
- Second vNIC hot-attached to `parking-recheck` on `dmz-vlan30` (`virsh attach-interface
  ... --config --live`) — persistent and live, no VM restart needed. Original NAT NIC left
  alone, so `:9096` kept working throughout. Inside the guest this appears as `enp7s0`
  (MAC `52:54:00:3e:e3:ab`) — currently down/unconfigured, no IP yet, since there's no DHCP or
  assigned subnet on VLAN 30 until Phase C picks one.

**Phase B (Aruba Instant On 1930) — DONE, 2026-07-24.** Executed manually by the user via the
switch's local web GUI (`https://192.168.1.220`), guided step-by-step. This switch is JL685A
(48G 4SFP/SFP+). Actual navigation used (this firmware version differs slightly from the
2020-edition PDF manual — noted for next time):

- **VLAN 30 created**: `VLAN` menu → VLAN Configuration tile → `+` Add → VLAN ID `30`.
- **Port membership screen** is split into two tabs not present in the older PDF manual:
  **"VLAN Membership - By Interface"** and **"VLAN Membership - By VLAN"** — used **By VLAN**
  (select VLAN from a dropdown, then edit ports' membership for that VLAN).
- **Uplink port to the DrayTek identified as port 48** (not guessable from LLDP — the DrayTek
  doesn't send LLDP). Method: resolved the DrayTek's LAN MAC via `ip neigh show 192.168.1.1`
  (`14:49:bc:7d:42:e0`, confirmed as gateway via the `192.168.2.0/24 via 192.168.1.1 dev
  eno8403` static route) on the Dell host, then looked it up in the switch's **MAC Address
  Table** feature — showed learned on port 48. Faster and more reliable than physically tracing
  cables or guessing.
- **Both port 44 and port 48** set to: VLAN 30 → Participation **Include**, Tagging **Tagged**
  (via the By-VLAN edit dialog). **Verified both still show VLAN 1 → Included, Untagged**
  before saving — this is what preserves existing native/untagged LAN traffic on those ports.
- **Save Configuration** clicked (required separately — changes apply immediately but don't
  survive a switch reset otherwise).
- **Verified immediately after, from the Dell host**: DNS (`erp.it-smart.tw` via
  `192.168.1.247:53`), `https://erp.it-smart.tw`, the `:9096` LAN proxy to `parking-recheck`,
  and gateway ping (`192.168.1.1`) all confirmed working, unchanged.

**Phase C (DrayTek, Vigor2135, firmware V4.4.2.1) — starting, 2026-07-24.** Router confirmed
dual-homed at the DrayTek end too: `192.168.1.1` (reached through the Aruba trunk we just
configured, MAC `14:49:bc:7d:42:e0`) and `192.168.185.1` (separate direct/VPN-reachable leg,
MAC `14:49:bc:8c:09:10`) are the same physical unit (same DrayTek login page/CSP on both,
shared `14:49:bc` OUI, differing only in per-port MAC as expected). Logging into `192.168.1.1`
for Phase C since that's the leg physically fed by the Aruba trunk (port 48).

**User backed up the router's current configuration before any changes** (`System Maintenance
>> Configuration Backup`, per the manual's TOC p.403) — good practice, gives a known-good
rollback point.

**Design consideration found before executing anything:** the Vigor2135's `LAN >> VLAN
Configuration` is a port-based+tag-based hybrid (assign P1-P4 to VLAN rows, each row mapped to
one of 4 LAN subnets, optional 802.1Q tag+VID per row; the same physical port *can* belong to
multiple rows). Whether it reliably demultiplexes an *externally*-tagged trunk (from the Aruba,
as just configured) the way a proper switch would is uncertain for this class of device —
safer alternative if a spare port exists on both ends: run a second cable, Aruba (free port) →
a free Vigor2135 LAN port, carrying VLAN 30 **untagged** on that dedicated link instead of
relying on tag demux on the shared/existing port. Checking port availability on both devices
before deciding which approach to use — not yet answered.

**Design changed mid-execution (2026-07-24): dedicated port instead of shared tagged trunk.**
User checked and found spare ports on both ends — Vigor2135 had P3/P4 free, Aruba had port 43
free (idle in the UI). Switched to the lower-risk design: a **second physical cable, Aruba port
43 → DrayTek P3, carrying VLAN 30 untagged** (not relying on the router's tagged-VLAN-on-a-
shared-port demux behavior, which is uncertain on SMB routers like this one). Port 44 (Dell
side) is unaffected and still correctly trunks VLAN 30 tagged — that's a different link, still
needed. Port 48 (the original DrayTek uplink) was left with its VLAN 30 tag still configured
even though it's now unused for this purpose — harmless (nothing on the router listens for it),
but flagged here as an optional cleanup item, not yet done.

Executed:
- **Aruba port 43**: `VLAN Membership - By VLAN` → VLAN 30 → Include + **Untagged** (not Tagged
  — this is a dedicated single-VLAN link, no tagging needed) → Apply. Verified port 43
  auto-dropped to Excluded on VLAN 1 (switch behavior: a port can only be untagged-member of one
  VLAN at a time). Saved.
- **DrayTek**: `LAN >> VLAN` (the router's own port-based VLAN page, separate feature from the
  Aruba's) — P3 was already on its own row (**VLAN2**, previously mapped to Subnet LAN1 along
  with everything else, no actual isolation yet); changed VLAN2's Subnet dropdown to **LAN3**,
  left P1/P2/P4's rows (VLAN0/VLAN1/VLAN3) untouched. This is what enabled the LAN3 checkbox on
  `LAN >> General Setup` (greyed out otherwise — the manual notes LAN2-4 must be enabled via the
  VLAN page first, not directly).
- **LAN3 configured** (`LAN >> General Setup` → LAN3 → Details Page): Enable ticked, **For NAT
  Usage** (not Routing — matches LAN1's pattern, needed for WAN port-redirection to reach a
  LAN3 host), **IP Address 192.168.30.1**, subnet mask `255.255.255.0/24`, **DHCP Server:
  Disabled** (deliberate — `parking-recheck`'s DMZ NIC gets a static IP directly, and a DMZ
  segment is safer with one less running service). Clicked OK.
- **User backed up the router's config before starting** (`System Maintenance >> Configuration
  Backup`) — known-good rollback point exists if anything here needs undoing.

**PAUSED here, 2026-07-24 — not abandoned.** Router is prompting for the reboot required to
fully apply the new LAN3 subnet. User deferred it: *"will reboot now, all office is in work"* →
then asked to pause and save progress instead, reboot to happen later. **Nothing is lost** — all
settings above are saved on the router, just not yet active pending that reboot. Next session:
confirm with user whether the reboot happened; if not, that's the next action, then verify (DNS,
`erp.it-smart.tw`, `:9096` proxy, gateway ping) same as after every prior change, then continue
with NAT port redirection (WAN 80/443 → edge proxy on `parking-recheck`'s DMZ NIC), firewall
default-deny VLAN30↔LAN1, VPN admin exception, and finally Phase D (the edge proxy itself, not
started).

**Note (2026-07-24, still same pause):** user flagged that their own internet access may drop
during the DrayTek reboot (expected — it's the WAN-side router). This is a client-side/session
risk, not a config risk: the Dell host and Aruba switch are LAN-local and stay reachable to each
other regardless of WAN state, so nothing above is at risk from the reboot itself. If the chat
session drops mid-reboot, this log plus memory already has the full resume state — next session
just needs to re-run the post-change verification (DNS, `erp.it-smart.tw`, `:9096` proxy, gateway
ping) and continue from NAT port redirection.

**Reboot completed and verified, 2026-07-24 — Phase C done.** User rebooted the DrayTek.
Post-reboot verification from the Dell host, same checklist as every prior change: gateway ping
(`192.168.1.1`), WAN reachability (`1.1.1.1`), internal DNS, `https://erp.it-smart.tw` (HTTP 200),
`:9096` LAN proxy to `parking-recheck` (HTTP 200), DrayTek admin UI reachable (HTTP 302) — all
passed, nothing broke. A direct ping to the new LAN3 gateway (`192.168.30.1`) from the Dell host
got no reply, but that's inconclusive, not a failure signal: the Dell host has no static route to
`192.168.30.0/24` (checked `ip route` — only `.1.0/24` and `.2.0/24` have static routes), so the
ping likely exited via the wrong interface/gateway entirely rather than actually reaching the
DrayTek's LAN3 leg. **Authoritative confirmation instead came from the router's own System
Status / Online Status page**, which the user checked directly: **LAN3 shows Enabled, IP
`192.168.30.1`.** Phase C is complete — LAN3 subnet is live.

**Static IP assigned, 2026-07-24.** `enp7s0` (MAC `52:54:00:3e:e3:ab`) given a static
`192.168.30.2/24` via a new `/etc/netplan/60-dmz-vlan30.yaml` (kept separate from cloud-init's
`50-cloud-init.yaml` so it survives cloud-init regeneration), no gateway set on this interface
(default route stays on the NAT NIC — LAN3 is "For NAT Usage" on the router, which handles the
return path for port-forwarded traffic without the VM needing a gateway here). Applied with
`netplan apply` directly (not `netplan try` — its interactive accept prompt doesn't work cleanly
over a non-TTY SSH heredoc; low risk anyway since this only touches the second NIC, not the one
carrying the SSH session). Verified both NICs alive simultaneously afterward.

**Layer-2 DMZ path proven, 2026-07-24.** `ip neigh` on the VM showed a fresh `REACHABLE` ARP
entry for the DrayTek's real MAC (`14:49:bc:7d:42:e0`) at `192.168.30.1` — confirms the full
chain (VM vNIC → host `br-vlan30` → `eno8403.30` VLAN tag → Aruba port 43 untagged → DrayTek P3)
actually works end-to-end, which was the real risk in the dedicated-port design from Phase C.
Separately, `ping`/`curl https://` from the VM *to the router's own admin interface*
(`192.168.30.1`) timed out — not investigated further (no host-level tcpdump available, no
passwordless sudo on the Dell host this session) since it's the opposite traffic direction from
what's actually needed (NAT redirection is router→VM, not VM→router-admin) and a DrayTek
silently blocking self-management access from a DMZ subnet is a reasonable default, not
necessarily a problem. Revisit only if it turns out to matter later.

**Phase D started (minimal scope), 2026-07-24 — before opening any WAN NAT rule.** Checked
first: `parking-frontend` publishes `0.0.0.0:8080`, already reachable on the new DMZ IP, and its
own nginx proxies `/api/*` (including `/api/admin/*`) straight to the backend with no path
restriction. Forwarding WAN 80/443 → `192.168.30.2:8080` directly would have put `/admin` on the
public internet immediately, violating the core requirement — so before touching the router,
built the minimum viable edge proxy to close that gap first (user explicitly chose this
sequencing over "configure NAT disabled" or "enable now, fix later" when asked).

- New `edge` service added to `deploy/docker-compose.prod.yml` — `nginx:1.27-alpine`, config
  mounted from new `deploy/edge-nginx.conf`, published as `192.168.30.2:80:80` (bound to the DMZ
  IP specifically, not `0.0.0.0` — not reachable via the NAT NIC or office LAN, only the DMZ
  path). `depends_on: frontend`.
- `deploy/edge-nginx.conf`: `location /admin { return 403; }` and `location /api/admin/ { return
  403; }` (confirmed against `production/backend/app/main.py` — every admin route, including
  `POST /api/admin/login`, lives under that one prefix, so this one block covers all of it,
  including blocking the ability to even attempt an admin login publicly). Everything else
  `proxy_pass`es to `frontend:80` unchanged (same headers as the frontend's own config).
  Deliberately HTTP-only for now (port 443/TLS not set up — no cert yet, out of scope for this
  step; flagged as a follow-up before this is actually exposed to WAN).
- Brought up with `docker compose ... up -d edge` (same `dc` invocation pattern as
  `pipeline.sh`'s wrapper). **Side effect worth knowing about:** this also recreated
  `parking-prod-frontend-1` — compose rebuilt the frontend image (`TAG=latest` is set in
  `.env.production`, and the running frontend container wasn't already on a fresh `latest` build)
  because `edge` has `depends_on: frontend`. `backend`/`db` were untouched (still the same
  containers, uptime unbroken). Confirmed low-risk after the fact: same `production/frontend`
  source tree, `backend` is *also* already running `parking-backend:latest` (not the `nogit` tag
  §1 described — that record is stale; a real deploy since then already moved both services to
  `latest`, `deploy/.last-good-tag` just wasn't updated to match). Re-verified `:9096` and
  `:8080` both still `200` after the recreation — no regression.
- **Verified end-to-end from the VM itself** (`curl` to `192.168.30.2` — note: `curl --interface
  enp7s0` against the VM's own IP misroutes and gives false `000` failures; plain `curl
  http://192.168.30.2/...` is the correct self-test): `/` → `200` (serves `index.html`),
  `/api/login` (real inspector-login path, confirmed via `grep` in `main.py` — `/api/inspector/
  login` was a wrong guess, doesn't exist) → `422` (reached the backend, validated and rejected
  an empty body — proof the passthrough path works), `/admin` and `/admin/` → `403`, `/api/admin/
  login` → `403`, `/api/admin/cases` → `403`.

**NAT port redirection — done, verified 2026-07-25.** User configured it manually via the
DrayTek admin UI. Verified by logging into `https://192.168.1.1` (Playwright, admin creds
supplied by user for this one read-only check, session logged out and `state.json` deleted
immediately after) and reading `NAT >> Port Redirection` directly: rule #5, `parking-recheck-http`,
enabled, WAN interface ALL, TCP, public port **80** → private IP **`192.168.30.2`** — correct,
matches `edge`'s current HTTP-only listener. Four other pre-existing rules on that page (`VM`
28443→`.108`, `ODOO` 81→`.109`, `OpenKM` 8080→`.10`, `SSH` 22→`.108`) are unrelated LAN services on
this same router, not touched.

**Firewall default-deny VLAN30↔LAN1 — effectively already satisfied, 2026-07-25.** Checked
`LAN >> General Setup`'s Inter-LAN Routing matrix: LAN3 is unchecked against LAN1/LAN2/LAN4 in
both directions (and vice versa) — DMZ subnet cannot reach the office LAN or other LANs by
default. This appears to be the router's default state for a newly-enabled LAN (not something
explicitly toggled during Phase C), but it satisfies the requirement as-is. No separate firewall
filter rule needed for the base default-deny.

**Still open:** VPN admin exception (the Inter-LAN matrix is all-or-nothing per subnet — a
narrow "VPN pool → `192.168.30.2:8443` only" rule isn't achievable there; needs an actual
Firewall filter rule instead, not yet found/created), then TLS/443 for `edge` (needs a cert —
DNS-01 vs HTTP-01 still undecided, needs the WAN redirect live first either way, which it now
is). **User is testing external reachability from a device off this network next** (`curl`/browser
to `http://220.133.223.9/` — see WAN-IP correction below — expecting `/` to load and `/admin` to
be unreachable) before we pick this back up.

**Correction to earlier assumption about `192.168.185.1` (found 2026-07-25, worth fixing in
memory too):** the 2026-07-24 session concluded `192.168.1.1` and `192.168.185.1` were "the same
physical DrayTek, two legs" based on a shared login page and `14:49:bc` MAC OUI prefix. Re-checked
now with actual admin access: this router's Dashboard only lists **WAN1** (Ethernet/PPPoE,
public IP `220.133.223.9`) and **WAN3** (USB, disconnected) — nothing matching `192.168.185.0/24`
appears anywhere (not WAN, not LAN1-4, not the IP Routed Subnet). The Dell host's own default
route (`ip route show default`) goes out via `eno8303` → `192.168.185.1`, a **different**
gateway than the one reached via `eno8403` → `192.168.1.1` (the Aruba-trunked path this whole DMZ
build is on). Likely explanation: two separate but identical ISP-supplied router units (hence
same login page / OUI), not one device with two legs. **Practical effect: the public IP for
everything in §5 is `220.133.223.9`, not `211.75.185.1`** — external testing must target the
former. The Dell host itself has no route to test this directly (no static route to
`220.133.223.9` via `192.168.1.1`), consistent with needing genuine external-network validation
per Phase E — not a new problem, just confirms why that step can't be skipped.

Once Phase B/C are both done and the real DMZ subnet is known, `enp7s0` inside
`parking-recheck` needs a static IP in it (don't rely on DHCP for a server) before Phase D (edge
proxy) can be wired up. *(Done — see the "Static IP assigned" entry above.)*

**External test failed (2026-07-25) — narrowed down where the break is, root cause not yet
confirmed.** User ran `curl http://220.133.223.9:8080/` and `curl http://220.133.223.9/` from a
device off this network — both timed out (no RST, no response at all). Diagnosed end-to-end from
the inside, one hop at a time, to isolate where the break is:
- `edge` (nginx) on `192.168.30.2:80` is healthy — `curl` from inside the `parking-recheck` VM to
  its own DMZ IP returns `200 OK` with the expected security headers (CSP, X-Frame-Options,
  etc.). The origin server is not the problem.
- The Dell host itself has **no route** to `192.168.30.0/24` — its default route goes out
  `eno8303`/`192.168.185.1` (the other, unrelated gateway), so a naive `curl`/`ping` to
  `192.168.30.2` *from the Dell host* times out for a routing reason that has nothing to do with
  the DMZ build. Don't mistake that for a real symptom — test from inside `parking-recheck`
  (`ssh 192.168.122.13`, its libvirt NAT-network address) instead, which does have a direct
  `192.168.30.0/24 dev enp7s0` route.
- From inside the VM, `ping 192.168.30.1` (the DrayTek LAN3 gateway) shows 100% loss, but
  `ip neigh show 192.168.30.1` reports `REACHABLE` with a real MAC (`14:49:bc:7d:42:e0`) — i.e.
  ARP resolves fine, so L2 connectivity across `vnet4` → `br-vlan30` → `eno8403.30` → switch
  trunk → router is intact. The ping loss is just the DrayTek dropping ICMP echo to itself
  (common default hardening), not a path break. Confirms Phase A (host bridge/VLAN wiring) is
  still solid — nothing regressed there.
- Net effect: everything from the VM up to and including L2 reachability of the DrayTek is
  verified healthy. **The break is somewhere between the DrayTek and the public internet** —
  candidates, not yet checked: (a) ISP-side inbound filtering of port 80 on this WAN line (common
  default in TW even on business PPPoE, independent of anything configured on the DrayTek itself),
  (b) a DrayTek firewall/filter rule blocking WAN→LAN despite the NAT port-redirection rule being
  correct, (c) the WAN1 IP (`220.133.223.9`, confirmed 2026-07-25 morning) having changed again
  since — PPPoE is not guaranteed static unless provisioned as such.
- **Next step, needs the user back in the router UI** (read-only checks, low risk): reconfirm
  WAN1's current IP on the Dashboard/Online Status page, and check `Firewall >> General Setup`
  for the default WAN-to-LAN action and whether an explicit allow/filter rule exists for the
  port-80 redirection (some DrayTek firmware auto-lists one, some need it added separately from
  the NAT rule). Paused here pending that.

**Root cause confirmed (2026-07-25, later same day), via Playwright browser automation.** User
provided one-time admin creds (`admin`/`Hot54695273`, port 8000, plain HTTP — the router's own
login page warns about this and offers an HTTPS "click here" alternative not yet tried). Setup
notes for next time: this router's login form has no stable `name`/`id` attributes on its inputs
(only a shared `.userpwd` class on both fields) and the fields flicker in and out of the DOM
during initial render, so both CSS-selector `.fill()` and `page.evaluate()`-based value-setting
were flaky — what worked reliably was `page.mouse.click()` at the field's pixel coordinates
(from a screenshot) followed by `page.keyboard.type()`. The UI itself is a frameset (`header.htm`
+ `l_m.htm` + `menu.htm` + a content frame) with menu links firing `javascript:MainFunction(url)`
rather than plain `<a href>`, and duplicate labels (7 different "General Setup" links across
sections) — matched the *visible* Firewall-section one specifically by checking its href contains
`ipf1.cgi`. Logout is `.header.logout` in `header.htm`, POSTs to `/cgi-bin/wlogin.cgi`; verified
by re-requesting the dashboard afterward and confirming it 404s. `state.json` (Playwright's saved
cookie/session state) was deleted immediately after — no credentials retained anywhere.

Findings, `Firewall >> General Setup`:
- **"Enable Strict Security Firewall" is checked (enabled).** Per DrayTek's documented behavior,
  this makes *all* WAN-initiated sessions require an explicit matching Pass rule in the active
  filter set — overriding the Default Rule's own action for that traffic. NAT port redirection
  alone does not exempt a flow from this check.
- Default Rule's own Filter action is "Pass" — so if Strict Security Firewall were off, the
  default-allow would apply and this wouldn't be an issue. It's specifically the combination of
  Strict Security Firewall + no matching rule that bites here.
- "Block routing connections initiated from WAN": IPv4 unchecked (fine, irrelevant anyway since
  Strict Security Firewall is the actual blocker), IPv6 checked (not relevant to this IPv4 issue).
- Active filter set is `Set#1` ("Default Data Filter", set via the "Start Filter Set" dropdown).
  Opened it (`Firewall >> Filter Setup >> Set 1`): **all three enabled rules are direction
  `LAN/RT/VPN -> WAN`** (rule 1: block NetBIOS/DNS; rule 2: pass TCP/445 from
  `192.168.1.0/24` to `192.168.1.215`; rule 3: block `192.168.1.0/24` → `192.168.0.0/16`). Rules
  4-7 are present but disabled, also LAN→WAN direction. **There is no WAN→LAN rule in Set#1 at
  all** — nothing permits the inbound `WAN1:80 → 192.168.30.2:80` flow once Strict Security
  Firewall requires an explicit match.
- **This fully explains the external timeout.** Every layer we'd already verified (edge nginx
  healthy, VM DMZ NIC configured, host bridge/VLAN wiring, L2 reachability to the router via ARP,
  NAT redirection rule itself, Inter-LAN default-deny) was correct. The one untested layer — the
  Strict Security Firewall / Data Filter interaction — is where the packets actually get dropped,
  silently (matches the "connection timed out, no RST" symptom exactly: SYN arrives, gets
  filtered, nothing is ever sent back).

**Fix, not yet applied (still plan-only pending explicit go-ahead per
[[feedback-plan-only-devops]] equivalent working mode):** lowest-blast-radius option is adding one
explicit filter rule to Set#1 (or a set actually in the WAN's inbound path): Direction "WAN ->
LAN" (or "Any -> LAN3" if that's how this firmware phrases inbound direction), Dst IP
`192.168.30.2`, Service Type TCP/80, Action "Pass Immediately". Alternative (broader, not
recommended) is simply unchecking "Enable Strict Security Firewall" entirely, which would restore
default-Pass behavior for all WAN traffic — rejected as needlessly wide open compared to a single
scoped rule. Once the rule (or the toggle) is applied, re-run the same external
`curl http://220.133.223.9/` test to confirm `/` loads and `/admin` still doesn't (Inter-LAN
default-deny + no matching WAN rule for `/admin`'s different path — actually note: HTTP-level path
filtering like "/admin unreachable" isn't something the DrayTek filter can do at all, since it
operates on IP/port, not URL path — that distinction will need to be handled by the `edge` nginx
config itself, not the router; worth flagging to the user, this was implicitly assumed router-side
in earlier notes and isn't actually where that boundary is enforced).

**Filter rule applied (2026-07-25, later same day), walked the user through it live in their own
browser one step at a time (per [[feedback-hands-on-hardware-guidance]]).** Added `Firewall >>
Filter Setup >> Set 1 >> Rule 4`: Enable, Comment "WAN80 to parkin[g-recheck]", Direction `WAN ->
LAN/RT/VPN`, Destination IP single-address `192.168.30.2`, Service Type TCP dst-port 80 (src any),
Action "Pass Immediately". One real mistake happened mid-edit and got caught before saving badly:
the user's first pass at the Service Type popup put `80` in the Source Port field and left
Destination Port as "any" — the list view's summary format ("TCP, Port: from X to Y" = src X,
dst Y, confirmed against the pre-existing rule 2's "from any to 445") made this visible and it
was corrected to source=any/dest=80 before moving on. Verified in the router UI (screenshot) that
the saved rule reads exactly as intended.

**Result: external test (`curl http://220.133.223.9/`) still timed out after this fix.** Rather
than assume the filter rule was wrong, did a live-in-the-act NAT sessions table check (Diagnostics
>> NAT Sessions Table, polled every ~1s while running curl) — this is what actually proved the
filter rule fix *worked*: sessions appeared for `192.168.30.2:80` with peer IP `211.75.185.1`
(the *other*, unrelated gateway's public IP — confirms the earlier 2026-07-25-morning
"two separate ISP routers, not one box with two legs" conclusion, since that's the address my own
test traffic used egressing via `eno8303`) on 5 different high source ports matching 5 curl
attempts. So: NAT translation + firewall pass are both confirmed working now. The SYN reaches the
router and gets forwarded — but the client never got a reply.

**Second, independent bug found and fixed: no return-path routing on the VM for the DMZ
interface.** `parking-recheck`'s only default route was `via 192.168.122.1 dev enp1s0` (the
libvirt NAT network) — nothing routed traffic sourced from `192.168.30.2` back out `enp7s0`
toward `192.168.30.1`. Since Linux routes by destination not by arrival interface, any reply to
an inbound DMZ connection would try to exit via the wrong NIC entirely. Fixed via source-based
policy routing in `/etc/netplan/60-dmz-vlan30.yaml` (backed up first to
`60-dmz-vlan30.yaml.bak-20260725033704`):
```yaml
routes:
  - to: 0.0.0.0/0
    via: 192.168.30.1
    table: 130
routing-policy:
  - from: 192.168.30.2
    table: 130
```
Validated with `netplan generate --debug` (clean) before `netplan apply`. Confirmed post-apply:
`ip rule show` has the new `from 192.168.30.2 lookup 130` rule, table 130 has
`default via 192.168.30.1 dev enp7s0`, main table's own default route (via `enp1s0`) is untouched,
and SSH/management connectivity survived (`ping 192.168.122.1` still fine). This was applied with
explicit user go-ahead ("yes, apply it and run netplan apply").

**Result: external test *still* timed out after this second fix too. Investigated further and
found a third, more fundamental problem that is NOT something client-side config can fix.**
Live packet capture on the VM's `enp7s0` (`tcpdump`, 40s window, 4 curl attempts spread across it)
captured **zero packets** — the SYN never reaches the VM's NIC at all, despite the DrayTek's NAT
table showing it processed/forwarded the connection. Checked `rp_filter` on the VM first (a common
cause of exactly this symptom) — already loose (`2`) on every relevant interface, ruled out.
Used the DrayTek's own `Diagnostics >> Ping Diagnosis` to have the **router itself** ping
`192.168.30.2` directly (bypassing NAT/firewall/WAN entirely, pure LAN3-side test): **100% packet
loss, 5/5**. Checked `Diagnostics >> ARP Cache Table` on the router: it has plenty of entries, but
every single one is on LAN1 — **it has never once successfully ARP'd anything on LAN3**, despite
the VM successfully ARP'ing *it* (confirmed working, `REACHABLE` state, back on 2026-07-25
morning) and despite repeated real inbound attempts today. Ruled out what's checkable from the
router/host side: physical link on P3 is up (green, Dashboard), P3→LAN3 port mapping is correct
(`LAN >> VLAN`, VLAN2 row, P3 checked, Subnet LAN3), and the Dell host's bridge (`br-vlan30`) has
*both* MACs (router's `14:49:bc:7d:42:e0` via `eno8403.30`, VM's `52:54:00:3e:e3:ab` via `vnet4`)
correctly learned on their expected ports — so the host-side bridge isn't dropping anything either.
**The remaining suspect is the Aruba Instant On switch itself** — something about port 43's VLAN
30 membership or the router-facing leg of that path is one-directional (VM→router traffic
flows fine; router→VM does not), which point-to-point Ethernet switching shouldn't normally
produce unless something switch-side (storm control, port security, a stale/wrong VLAN
assignment on port 43 specifically) is filtering it. **No Aruba credentials were available this
session to check further** — this needs either switch admin access or a physical check
(unplug/replug, confirm port 43's VLAN config hasn't reverted) next session.

Net state as of pausing here: both real bugs found so far (missing firewall rule, missing VM
return-path route) are genuinely fixed and confirmed correct in isolation — but external access is
still not working, blocked on a third, separate switch-level issue outside what could be verified
or fixed this session.

**User confirmed the suspect (2026-07-25, same day, still paused).** User has hands-on access to
the Aruba switch and reports port 43 (the router-facing leg of the trunk) shows as **"isolated"**
in the switch's own UI, and reasons that's why it has no route to the server — matching the
one-directional-failure theory above exactly (port isolation would explain why the router can't
reach the VM while other traffic still flows). Not yet confirmed which exact screen/label this is
(Aruba Instant On phrases this a few different ways across firmware — could be a per-port
"Isolation" toggle on a VLAN or Security page); asked the user which menu/tab and exact wording
they're seeing before prescribing a fix, per [[feedback-hands-on-hardware-guidance]] (past
sessions burned time when a click-path was prescribed from generic docs instead of the user's
actual screen). **Paused here awaiting the user's answer** on where exactly the isolation setting
lives, before walking through removing/reconfiguring it.

---

## 6. Unrelated finding, worth remembering so it isn't rediscovered as a scare

`/etc/nginx/sites-enabled/manageparking-dev` (port `9095` → `192.168.122.90:8001`, i.e. the
`devops-test` VM) is **not this project**. Its OpenAPI title is `"ManageParking CRM"` — a
different, unrelated app that happens to share the word "parking." Don't confuse it with
`parking-recheck` during testing; they're on different VMs entirely.

---

## 7. Reference: current live topology (as of 2026-07-24, before DMZ work)

```
Internet (not yet wired up — see §5)
       |
   [not yet]
       |
LAN 192.168.1.0/24 ── host nginx :9096 ──▶ 192.168.122.13:8080 (parking-recheck, NAT network)
                                                  │
                                       docker compose: frontend / backend / db
                                       backend disk: /var/vm-storage/parking-recheck-vol/
                                                      (own 120GB loop-mounted XFS volume)
```

Accounts that exist on this deployment right now: `admin01`/`admin123` (sysadmin),
`ins01`/`ins123` (inspector, has permission). No sandbox stock demo accounts exist here.

---

## 8. `.215` backup-pull automation — in progress, paused mid-session

**2026-07-27.** Goal: make `.215` (`192.168.1.215`, the EOL Windows Server 2012 R2 box —
see `devops_plan.md` §0 for why it was rejected as an app host but kept as a backup-pull
target) actually pull the nightly `pg_dump` + uploads tarball on a **recurring** schedule.
Design (pull-only, `.215` initiates, `parking-recheck` holds zero credentials for `.215`) was
already built and validated once by hand on 2026-07-25; this session's job was to make it
recurring and re-verify the pieces it depends on before building on top of them.

**Keypair: reused, not regenerated.** User confirmed the private key from the 2026-07-25
one-time drill still exists on `.215` and they know its path (not recorded here — stays on
`.215`). The matching public key is already in `backup-puller`'s `authorized_keys` on
`parking-recheck`. No new keypair needed.

**Real bug found and fixed: the `.215`-only restriction on port 2222 was not actually
enforced.** Checked live state on `iactor` (`sudo iptables -t nat -L PREROUTING`,
`sudo iptables -L FORWARD`, both with `--line-numbers`):

- NAT/PREROUTING had **three** rules for `dpt:2222 → 192.168.122.13:22`: one unscoped
  (`0.0.0.0/0`, rule 6) sitting *before* two scoped duplicates (`192.168.1.215`, rules 7+8).
- FORWARD had the mirror problem: rule 3 was an unscoped ACCEPT for
  `* → 192.168.122.13:22`, alongside two scoped duplicates (rules 1+2).
- Since both chains are first-match-wins and the unscoped rules were reachable before/among
  the scoped ones, **any host that could reach `iactor:2222` got forwarded straight into
  `parking-recheck`'s real SSH port** — not just the SFTP-chrooted `backup-puller` account.
  This had been silently broken since these rules were first added; nothing in this session
  caused it, verification just finally caught it.
- One thing that *was* correct: rules 1–3 sit before the `LIBVIRT_FWI` jump (position 11 in
  FORWARD), so they don't suffer the "narrower rule placed after libvirt's unconditional
  reject" ordering bug documented in §5 for the earlier `virbr0` incident. Purely an
  unscoped/duplicate-rule problem, not a positioning one.
- **This is the third time this exact host has had a duplicate/unscoped rule silently
  defeating an intended restriction** (the `virbr0` `FORWARD` rule in §5's LAN-lockdown
  attempt was the first two). Worth treating as a pattern: **any existing "already scoped"
  rule on `iactor` should be re-verified live, not trusted from memory or a prior session's
  say-so**, before building anything new on top of it.
- **Fix applied and confirmed:** deleted the unscoped + duplicate rules by line number
  (highest first to avoid renumbering issues) —
  `iptables -t nat -D PREROUTING 8`, `-D PREROUTING 6`, `iptables -D FORWARD 3`, `-D FORWARD 2`.
  Re-verified afterward: exactly one DNAT rule and one FORWARD-accept rule remain in each
  chain, both scoped to `192.168.1.215`. Persisted via `sudo netfilter-persistent save`
  (confirmed it ran both the `ip4tables` and `ip6tables` plugins successfully).
- **Verification that nothing else broke:** `.90`/`.52`/`.166` (ERP, SIP) DNAT/FORWARD rules
  were untouched by the deletions (only their line-number labels shifted, not their order
  relative to each other or to `LIBVIRT_FWI`). `curl -v` to `erp.iactor.tw`/`tc.iactor.tw`
  reached full TLS certificate exchange before failing on an unrelated, pre-existing
  self-signed-cert trust issue — proves the network path is fine, not a regression. **SIP
  phone registration (`deltapath-uc`/`Venky 1001`) check deferred by the user to the next
  session** — not yet confirmed, don't assume it's fine, ask first next time.

**Backup mechanism itself (the thing `.215` will actually be pulling) — confirmed healthy.**
Checked directly on `parking-recheck`: `/etc/cron.d/parking-backup` installed correctly, two
consecutive nightly runs (2026-07-25, 2026-07-26) both logged OK for both the `.sql` dump and
the `uploads-*.tar.gz`. The uploads tarball is near-empty (~4K) because the live uploads
volume genuinely has zero files (`docker run ... find /data -type f` → `0`) — **not a gap**:
the app has had no real case-photo submissions yet, so there's nothing to validate the
non-empty path against. Don't flag this again as a testing gap; revisit only once real
uploads exist.

**Open items, paused here — continuing next session:**
1. SIP registration re-check (deferred by user to tomorrow).
2. Dedicated low-privilege local Windows account on `.215` for the Task Scheduler job
   (not the user's own admin login) — not yet created.
3. `icacls` the private key + backup destination folder to that account only.
4. The actual pull script + Task Scheduler registration (~19:30 UTC / 03:30 Taipei, after
   the VM's own 19:00/19:15 backup+prune), with a failure-alert action.
5. At-rest encryption on `.215`'s backup destination folder (7-Zip AES-256 or EFS) — given
   `.215` is EOL/unpatched, don't store these in plaintext even though they're pulled over
   an encrypted channel.
6. A real restore drill from the `.215`-side copy (not just file-size matching).
7. Once done, update `user_manual.md` §3.9/§3.10 to reflect a genuinely-recurring `.215`
   pull (currently describes it as unconfirmed/manual-only) and close out the corresponding
   open item in `devops_plan.md`/memory.

---

## 9. Uptime Kuma: stale-history cleanup, then upgraded 1.x → 2.x

**2026-07-30.** Two separate asks on the live `uptime-kuma` container
(`deploy/monitoring/docker-compose.yml`, deployed at `/opt/monitoring` on `parking-recheck`).

**Stale down-history cleanup.** Queried `kuma.db` directly (`sqlite3` is present in the
image). All `important=1` heartbeat rows besides the initial "up" ones turned out to be four
rows from 2026-07-25 14:52–14:57 — two ~1-minute down blips (`parking-app-health`,
`parking-prod-backend-1`) that self-recovered, left over from initial container setup/testing,
not real incidents (every monitor has been continuously up since, confirmed via
`max(heartbeat.id)` per monitor). Backed up `kuma.db` first, then set `important=0` on those
4 rows (ids 17/20/22/25) rather than deleting them outright — drops them from the Important
Events UI while leaving raw heartbeat/uptime-% data untouched.

**Version check → decision to upgrade.** User asked to update Kuma; checked the running
version first rather than assuming "update" meant a same-major bump — found `1.23.17` is
literally the last 1.x release ever cut (official final-1.x-minor line, bug-fixes-only, no
further features), and the only actual "new version" is the 2.x line (now 2.4.0), which
`docker-compose.yml`'s own header comment had previously pinned *against* — deliberately, for
stability, when this was written. Surfaced that conflict to the user instead of silently
executing either "just update" (would silently reverse a documented decision) or refusing
(user's ask was legitimate). User asked to see what 2.x actually changes first; found it's a
one-way, irreversible DB migration (official migration guide: no downgrade path, "if
interrupted, restore from backup and retry") but low-risk for *this* deployment specifically
because there was no real production monitoring history yet — the app itself hadn't gone live.
Recommended upgrading now rather than later, when a live incident-response dependency would
make the same irreversible migration much riskier. User agreed.

**Upgrade executed:**
1. Full tarball backup of the `parking-monitoring_kuma_data` volume before touching anything
   (`/opt/monitoring/kuma-data-backup-pre-v2-20260730055825.tar.gz` — separate from the
   in-place `kuma.db` copy made for the cleanup step above).
2. `docker compose down`, bumped `image:` to `louislam/uptime-kuma:2` in both the live
   `/opt/monitoring/docker-compose.yml` and this repo's tracked copy.
3. **First attempt was botched by me, not the migration**: backgrounded `docker compose up -d
   && docker logs -f` over SSH then killed the job to reclaim the terminal — this sent the
   remote shell a SIGHUP mid-pull, before any container existed. No partial migration
   resulted (compose hadn't gotten past the pull step), but Kuma sat offline until the retry.
   Lesson: don't background/kill a live SSH session that's mid-`compose up` for something
   stateful — pull the image synchronously first, *then* start, *then* tail logs with a
   bounded `timeout` instead of a kill.
4. Redone cleanly: `docker compose pull` (foreground, completed), `docker compose up -d`,
   then `timeout 45 docker logs -f`. Migration log showed all 5 monitors' daily buckets
   migrating into the new aggregate stat tables (`stat_minutely/hourly/daily`), "Clearing
   non-important heartbeats" (expected — raw heartbeat count dropped 6648→1438 per monitor,
   important-flagged rows unaffected), completed in under a minute, server came up on 2.4.0.
5. **Verified, not just watched logs and assumed**: `docker ps` healthy, all 5 monitor names/
   active flags intact in the migrated `kuma.db`, the 5 `important=1` rows from the cleanup
   step above were still exactly those 5 (stale-down cleanup survived the migration), `curl
   localhost:3001` → 302 (expected redirect to login).
6. Updated the tracked `deploy/monitoring/docker-compose.yml` comment block to stop saying
   "pinned to 1.x" and instead record the 2026-07-30 move to 2.x, the reasoning (migrate
   before go-live, not after), and that any *future* major bump needs the same
   backup-first treatment since there's no downgrade path once migrated.

**Not yet done:** repo changes (`docker-compose.yml`, this log entry) were written but not
committed as of this session — do that before assuming the tracked file matches what's live
on the VM long-term (it does match *right now*, just not in git history yet).

---

## 10. Log-driven incident sweep: 413s on inspector uploads, QR auto-fill dead since launch

**2026-08-28.** User asked to check the live VM's logs for CRUD errors from external clients.
Pulled `docker logs` from `parking-prod-edge-proxy-1` (public path) and `parking-prod-frontend-1`
(LAN admin path) on `parking-recheck` (`192.168.122.13`), extracted the true client IP from
`$http_x_forwarded_for` (Tailscale Funnel sets this — nginx's own `$remote_addr` is always the
docker bridge gateway, `172.18.0.1`), filtered for POST/PUT/PATCH/DELETE with 4xx/5xx. Found two
real, unrelated production bugs — both fixed and verified live in the same session.

### 10.1 Inspector photo uploads 413'ing (public path only — admin CRUD was fine)

**Root cause:** `deploy/edge-proxy/nginx.conf` (the public InspectorApp path, reverse-proxied
through Tailscale Funnel) had no `client_max_body_size` directive, so it silently defaulted to
nginx's compiled-in 1 MiB cap. `production/frontend/nginx.conf` (the internal admin path) already
set `client_max_body_size 12m;` to match the backend's `MAX_UPLOAD_BYTES` (8 MiB decoded ≈ 11 MiB
base64+JSON) — the edge-proxy config was just never brought in line when that admin-path fix was
made. Log evidence: 6 external clients (iPhone/LINE, Android) got 413 on `POST /api/cases` on
2026-08-28 alone, plus a cluster of unrelated `POST /api/login` 401s (bad-password attempts, one
IP rate-limited) and bot/scanner noise (GPTBot, `Assetnote` pentest scanner) correctly 444'd by
the fail-closed allow-list — that part was already working as designed.

**Fix:** added `client_max_body_size 12m;` to `deploy/edge-proxy/nginx.conf`, matching the admin
path. Shipped as [PR #51](https://github.com/zii144/it-smart-parking-recheck/pull/51) off
`origin/main` (this session's local `main` checkout was stale — 48 commits behind, diverged on a
now-superseded local-only `.gitignore` commit — so the fix branch was cut directly from
`origin/main` and local `main` was later hard-reset to match).

**Deployed and verified live** on the VM *before* the PR merged: rebuilt `parking-edge-proxy` at
the already-running tag (`af02ce4`), recreated just that container (`docker compose up -d
edge-proxy`, ~1s interruption to the public path only), then ran a full Playwright smoke test
through the real public origin — `parking-recheck-public.pages.dev` (Cloudflare Pages) → Funnel →
edge-proxy → backend — logging in as a throwaway inspector account, running the full 6-step case
wizard, and uploading a 3.2 MB photo. `POST /api/cases` → `200`, file landed intact server-side.
Confirmed `verify-allow-list.sh` still passes (no regression on the fail-closed behavior). Cleaned
up the test case, its uploaded photo, and the throwaway inspector account afterward.

PR merged same session (`429d803`). CI's Trivy image-scan check failed on that PR, but on a
brand-new HIGH-severity OpenSSL CVE (`CVE-2026-14456`, `libssl3t64` in the backend image's Debian
13 base layer, no fix in Debian's repos yet) — unrelated to this change (the PR never touches the
backend image) and would fail identically on `main` right now. No branch protection is configured
on `main`, so nothing technically blocked the merge; flagged as a separate open item rather than
conflated with this fix.

### 10.2 Real QR auto-fill has never worked in production

**Root cause:** `deploy/.env.production` on the VM had `QR_QUERY_ALLOWED_HOSTS=` (empty). The
backend's SSRF guard (`qr_service._is_allowed_url`) treats an empty allow-list as "real fetching
disabled" *by design* — but nobody had circled back to actually populate it once the VM went
public. Every real inspector QR scan hits `_resolve_url()` → allow-list check fails → immediate
`scan_failed`, before any network call — 100% manual entry, unconditionally, since the VM first
deployed (~2026-07-23, per §1). Separately, the frontend's hard-coded demo buttons (`QR-A1001`
etc.) also always fail in prod, but *correctly* so — `QR_DEMO_MODE=false` in
`docker-compose.prod.yml` is intentional (fake ticket numbers shouldn't resolve on a live system).

**Diagnosis before touching anything:** confirmed DNS + HTTPS egress from the `backend` container
to both `parkingfee.pma.gov.taipei` and `pay.taipei` work fine, then called
`taipei_parkingfee.scrape()` directly inside the container (bypassing only the allow-list check)
against the repo's own test-fixture ticket number, `Q7078443D090047` — full success against the
*real* live government site: 車號 `CAP-6198`, 停車日期/時間 `2026-07-07 09:00–11:29`, 費率, 已繳
金額 `50`. Scraper/parser/network path were all fine; the empty allow-list was the only blocker.

**Fix:** backed up `deploy/.env.production` (`.env.production.bak.20260828142132`), set
`QR_QUERY_ALLOWED_HOSTS=parkingfee.pma.gov.taipei,pay.taipei` (the code's own documented default —
see `config.py`'s comment on the setting), recreated the `backend` container (env-only change, no
image rebuild). This is a production behavior change (backend now makes live outbound fetches to
two external hosts off untrusted QR-derived URLs, gated by the existing allow-list/redirect-pin/
DNS-rebind guards in `qr_service.py`/`taipei_parkingfee.py`) — confirmed with the user before
applying, not assumed.

**Verified live**, two ways: (1) `qr_service.resolve()` called directly inside the container →
`status: success` against the real site; (2) full Playwright run through the actual public UI —
logged in as a second throwaway inspector, pasted the real QR URL
(`https://parkingfee.pma.gov.taipei/qr?tno=Q7078443D090047`) into the "線上查詢" field, and the
wizard auto-filled 帳單編號/車牌號碼/GPS and flipped 資料來源 to "QR 自動辨識" — the exact
behavior that had been broken since launch. Didn't push this one through to an actual saved case
(the save+photo path was already fully proven in §10.1's test, so a second one would've just been
duplicate test data); deleted the throwaway inspector account afterward.

**Not yet done:** this is a VM-local config change (`deploy/.env.production` is gitignored — see
`.gitignore` — so there's nothing to commit/PR for it); nothing in git tracks that
`QR_QUERY_ALLOWED_HOSTS` is now populated on the live VM besides this log entry and the `.bak`
file sitting next to it. If the VM is ever rebuilt from `deploy/.env.production.example` instead
of copied forward, this will silently regress back to disabled — worth promoting into the example
file's own guidance, or otherwise making sure whoever rebuilds the VM knows to set it.

---

## 11. Multi-agent code audit → year-boundary judgement bug fixed → uncovered severe VM/repo drift → brief full outage → recovered

**2026-08-28, same day as §10.** User asked for a multi-agent end-to-end audit (frontend/backend/
db/security) of the whole stack. Four parallel agents (code + local test suite only, deliberately
kept off the live VM to avoid concurrent SSH/docker access) reported back; consolidated findings
below, then the two highest-confidence live-affecting ones were fixed same session.

**Audit highlights** (full findings not reproduced here — see the four agents' reports in
conversation history if this needs revisiting):
- Backend: 172/172 tests passed, every route has coverage, zero migration/model drift *within the
  repo*. One real bug found and reproduced directly against the code (see below).
- Frontend: build/lint clean, `verify-build-split.sh` passes. Two HIGH bugs found: stale ticket
  data surviving a mid-wizard re-scan, and no client-side photo compression (compounds §10.1 —
  offline-queue localStorage quota and the edge-proxy body-size cap both still get hit by
  uncompressed real phone photos). Not fixed this session — flagged for next pass.
- DB: migration chain round-trips cleanly (fresh SQLite + fresh Postgres), but `0005`'s retroactive
  `UNIQUE` constraint has no dedup guard (reproduced failure with pre-existing duplicate rows —
  turned out to matter more than expected, see below). N+1 import pattern and an inconsistent
  AdminUser-delete guard also flagged, not fixed.
- Security: reported the edge-proxy's public listener never sets `X-Forwarded-For`, so the
  backend's IP-based login throttle (`app/main.py` `_client_ip`) trusts an unvalidated header —
  same finding independently reached by the backend agent. **Verified empirically before acting
  on it** (see below) — it does not hold in this deployment's actual topology. Everything else
  (bcrypt, JWT, RBAC, CORS, uploads, secrets) confirmed sound.

### 11.1 XFF finding: real gap in the code, not exploitable in this deployment

Before patching anything, sent a request through the *real* public Funnel path
(`https://parking-recheck.tarpon-gharial.ts.net`) with a spoofed
`X-Forwarded-For: 9.9.9.9, SPOOFTEST-...` header. Result: Tailscale Funnel discarded it outright
and substituted its own determined client identity — confirmed by running the same probe from the
VM itself (which showed up as the VM's own tailnet IP, `100.109.85.62`, not the spoofed value) and
separately by triggering a real CORS-preflight `OPTIONS` request from a browser on the office LAN
(logged XFF = `211.75.185.1`, the office's real public IP, matching `HANDOFF_dmz_rollout.md`'s
independent note of that same IP from `curl ifconfig.me`). Both audit agents reasoned from static
code only and concluded HIGH severity; the empirical test show it isn't reachable today, because
`edge-proxy` is published `127.0.0.1`-only — the only path in is through Funnel, which already
sanitizes this header. Applied the one-line `proxy_set_header X-Forwarded-For
$proxy_add_x_forwarded_for;` fix anyway (all 5 location blocks in
`deploy/edge-proxy/nginx.conf`) as cheap defense-in-depth against the topology ever changing, but
downgraded and reported it to the user as non-urgent hardening, not a live vulnerability — worth
remembering as a case where static analysis alone overstated exploitability and empirical
verification against the real deployed system caught it before wasted effort.

### 11.2 Year-boundary judgement bug — fixed, tested, deployed

**Root cause** (backend agent's finding, reproduced independently): `business_rules.py`'s
`compute_issue_datetime` infers the ticket's year from `parking_date` (ticket numbers only encode
month/day/time). A ticket physically issued 23:58 on Dec 31 but entered/synced after midnight has
`parking_date` already rolled to Jan 1 of the next year — the naive reconstruction then lands
~365 days from the real `parking_start`, and a genuinely-compliant, 3-minutes-late ticket silently
reads as **OVERDUE** with a nonsense multi-year diff, not even flagged as anomalous.

**Fix:** `compute_issue_datetime` now takes an optional `parking_start` and, only when the naive
(`parking_date.year`) result lands implausibly far away (> 48h), retries `year-1`/`year+1` and
keeps whichever reconstruction lands closest to `parking_start`. Backward compatible — omitting
`parking_start` (the `seed.py` call site) keeps the exact old behavior. Applied identically to
`prototype/backend/app/business_rules.py` and `production/backend/app/business_rules.py` (were
byte-identical before the change), plus the one call-site line in both `main.py` copies. Added 4
new tests (`test_business_rules.py` x3 unit-level, `test_judgement_edge_cases.py` x1 integration-
level hitting `/api/cases/preview`) to both `prototype/` and `production/` test trees. Full suites:
176/176 (production) and equivalent count (prototype) pass, zero failures.

### 11.3 Deploying the fix uncovered severe VM/repo drift — brief backend outage, recovered same session

Copied the two changed files (`business_rules.py`, `main.py`) plus the nginx fix to the VM,
rebuilt `backend`+`edge-proxy` at the already-running tag (`af02ce4`), recreated both containers —
**`backend` crash-looped, full outage** (no admin or inspector API access at all) until resolved.
Root cause was NOT the new code — it was pre-existing drift between the VM's raw-file-copy backend
tree (see §1's original warning about this) and the actual repo, invisible until a rebuild forced
Docker to re-read the VM's real (stale) source instead of reusing cached image layers:

1. `alembic upgrade head` failed immediately: `Can't locate revision identified by
   '0005_case_idx_loc_unique'` — the VM's `alembic/versions/` was missing that file entirely, even
   though the *live database* was already stamped at that revision (applied at some point by a
   build that had the file; the file itself never persisted on the VM's disk). Fixed by copying
   the migration file back — no new DB changes needed, alembic just needed the file present to
   resolve its history.
2. Next failure: `ModuleNotFoundError: No module named 'app.import_service'` — also missing on the
   VM entirely, despite being real, existing, tested code in the repo. `app/clock.py` missing too.
   Copied both over.
3. Next failure: `openpyxl`/`tzdata` weren't in the VM's `requirements.txt` (needed by the two
   files just restored). Full-file diff showed the VM's copy was missing exactly those two
   packages, nothing else — copied the whole file over.
4. Next failure: `ImportError: cannot import name 'password_matches' from 'app.security'` — the
   VM's `security.py` was missing the timing-safe login comparison entirely (the exact function
   the security audit had just praised as "confirmed sound" — it *is* sound, in the repo; it just
   was never deployed).
5. At that point, stopped fixing one crash at a time and instead ran a full `md5sum` diff of every
   backend file (`app/*.py`, `alembic/*`, `requirements*.txt`, `Dockerfile`) between the VM and the
   repo in one pass. Found `config.py`, `models.py`, `rate_limit.py`, `security.py`, `seed.py` all
   differed in content (`main.py`/`business_rules.py` already matched, from this session's own
   sync). Copied all five in one batch, re-diffed to confirm zero remaining mismatches, rebuilt
   once, restarted once — came up healthy on the first try.

**Deliberately not touched:** the VM's `backend/Dockerfile` still differs from the repo's (the
repo's was updated in PR #50's Trivy multi-stage-build fix, never promoted to the VM) — left alone
to keep this recovery's blast radius contained to what was actually needed to get the stack
healthy again. **Open item, not yet done:** promote the current `Dockerfile` to the VM the same
deliberate way, and — more importantly — figure out *why* the VM's backend tree had drifted this
far (six files + a migration, not just one or two) and whether prior "deploy this one fix" sessions
have been silently doing partial syncs like this one almost did. Worth a dedicated session to fully
reconcile the VM's `production/backend/` tree against `main` end-to-end rather than trusting
spot-diffs going forward.

**Verified recovered:** all 4 containers healthy; `verify-allow-list.sh` still PASS;
`/api/health` → 200; the year-rollover fix confirmed live (`Q12318435D235800` / `parking_date
2027-01-01` → `COMPLIANT`, 3.0 min diff, not OVERDUE); all 4 core tables (`cases`, `admin_users`,
`inspectors`, `locations`) queryable with no ORM/schema mismatch; no errors in `backend` logs in
the 60s following restart. Notable side observation: the live `cases` table has only 2 rows after
~4 weeks of real deployment — consistent with §10.1's 413 bug having silently blocked most real
submissions with photos this entire time, which reframes today's fixes as considerably higher-
impact than they looked evaluated individually.

---

## 12. Backend Dockerfile reconciled: `USER app` restored into git, promoted to the VM

**2026-08-28, same day.** Closes §11.3's open item. Two Trivy-fix PRs landed on `main` today
(#52, #53) that touched `production/backend/Dockerfile` and `prototype/backend/Dockerfile`, both
deliberately *not* promoted to the VM at the time — the VM's actually-running Dockerfile (an
older, pre-PR#50 revision) has `groupadd`/`useradd`/`USER app` non-root hardening the repo's
current file didn't have, and blindly overwriting would have shipped a container running as root.

Checked git history properly this time instead of assuming: `USER app` has **never once been
committed to this repo**, at any point in `production/backend/Dockerfile`'s history back through
d27892b (the first Trivy fix, Jul 27) — it was added by hand directly on the VM outside of git,
exactly matching §1's original "the running build already had... non-root backend `USER app`...
that neither this repo nor its git history has committed yet" finding from when this VM was first
discovered. So this wasn't a regression to fix; it was a feature that was never captured in the
first place.

**Fix:** added the `groupadd`/`useradd`/`chown`/`USER app` block back into both Dockerfiles,
placed after the app files are copied in (so `chown -R app:app /app` picks up everything),
combined with the now-merged `apt-get upgrade`/pip-strip Trivy fixes. `docker-entrypoint.sh` only
runs `alembic upgrade head` + `uvicorn` on port 8000 — confirmed neither needs root.

**Verified before deploying anything:** built a throwaway image on the VM with the reconciled
Dockerfile — build succeeds, `docker run --entrypoint whoami` → `app` (uid 999), `/app/data`
correctly owned by `app:app`, core imports (fastapi/sqlalchemy/alembic/uvicorn) all work, and a
full Trivy scan comes back completely clean (0 findings — the msgpack/setuptools finding from the
earlier PR #53 investigation didn't reproduce this build, consistent with it having been a
transient/non-deterministic build-isolation artifact rather than something this reconciliation
needed to fix).

**Deployed for real:** synced the reconciled `Dockerfile` to the VM (checksummed match before and
after), rebuilt `backend` at the live tag (`af02ce4`), recreated the container — came up healthy
on the first try this time, no drift-driven crash loop like §11.3. Confirmed: `whoami` inside the
running container → `app`; `verify-allow-list.sh` still PASS; `/api/health` → 200; DB query
sanity check (`cases` count) still works; no errors in logs since restart.

**Committed properly this time** — `production/backend/Dockerfile` and
`prototype/backend/Dockerfile` both now carry `USER app` in git, not just on the VM's disk. This
closes the specific gap; the broader open question from §11.3 (why the VM's tree drifted as far
as it did, and whether other "deploy one fix" sessions have been doing partial syncs) is still
open and still worth a dedicated reconciliation session.
