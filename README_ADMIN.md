# SNN Admin README

This document is the **operator guide** for running and supporting the SNN platform without needing tribal knowledge.

## 1) Quick Start (2–3 minutes)

### Prerequisites
- Node.js 18+ (recommended)
- npm
- A machine/network where browsers can reach this server

### Install and run
```bash
npm install
npm start
```

By default, server uses:
- HTTP: `3000`
- WebSocket (OSC over WS): `9000`

Current defaults come from `config.json`.

### Open the main pages
Assuming server host is `HOST` and HTTP port is `3000`:
- Landing: `http://HOST:3000/`
- Controller: `http://HOST:3000/controller` (same as `/controller/index.html`)
- Admin controller: `http://HOST:3000/controller/admin.html`
- Visual simulation: `http://HOST:3000/snn` (same as `/snn/index.html`)
- Monitor: `http://HOST:3000/monitor.html`

## 2) What changed vs old README

The system now runs the neural simulation **server-side** (`simulation/SimulationRunner`), and browser pages are clients.

- No manual simulation-ID handshake is required for normal operation.
- Controllers connect directly with `/connectController`.
- Visuals connect with `/registerVisual`.
- Admin connects with `/connectAdmin` and receives full state.

Legacy routes are still accepted (e.g. `/registerSimulation`, `/update/*`).

## 3) Runtime architecture

- `server.js` hosts HTTP static files + WebSocket OSC router.
- `simulation/simulation.js` owns SNN state and applies parameter updates.
- Clients:
  - `public/snn` = renderer/audio visual client
  - `public/controller` = performer controller (single assigned neuron + pulse)
  - `public/controller/admin.html` = full network control panel
  - `public/monitor.html` = server operations dashboard

## 4) HTTP API (admin/ops)

### `GET /api/config`
Returns runtime config used by browser clients:
```json
{
  "wsUrl": "ws://...:9000",
  "maxControllers": 6,
  "httpPort": 3000,
  "wsPort": 9000
}
```

### `GET /api/controller/check?controllerId=<id>`
Capacity check used by controller page.

Response shape:
```json
{ "current": 2, "max": 6, "allowed": true }
```

### `GET /api/clients`
Returns all connected clients, activity timestamps, counts, and server simulation status.

### `DELETE /api/clients/:id`
Force-disconnect a controller/admin/visual client.
- Server sends OSC `/disconnect` to controller/admin before closing.

### `POST /api/state/save`
Save current simulation state to JSON.

Body (optional):
```json
{ "path": "/absolute/or/relative/path.json" }
```
Default path: `state_dump.json` in project root.

### `POST /api/state/load`
Load saved state JSON and rebroadcast init/state to visuals.

Body (optional):
```json
{ "path": "/absolute/or/relative/path.json" }
```
Default path: `state_dump.json`.

## 5) OSC protocol map (WebSocket)

All client/server realtime traffic is OSC over WebSockets (`osc.js`).

## 5.1 Registration & control channels

### Client -> Server
- `/registerVisual <visualId?>`
- `/registerSimulation` (legacy alias for visual registration)
- `/connectController <controllerId>`
- `/connectAdmin <adminId>`
- `/connectMonitor`
- `/getState <clientId>`

### Server -> Client
- `/server/init <clientId> <jsonInitState>`
- `/assignment/neuron <id>` (controller only)
- `/disconnect <message>`
- `/activity <clientId>` (monitor)
- `/clientDisconnected <clientId>` (monitor)

## 5.2 Update messages accepted by server simulation

The server accepts both prefixes:
- Preferred: `/client/...`
- Legacy: `/update/...`

### Core updates
- `/client/neuron <id:int> <value:float>`
- `/client/pulse/{id} <value:float>`
- `/client/spike/{id}`
- `/client/spike {id}` (space form also handled)
- `/client/syntype/{id} <value:float>`
- `/client/weight/{from}/{to} <value:float>`
- `/client/drop/{from}/{to} <value:float>`

### Global/parameter updates
The simulation handles these keys (space or underscore variants where applicable):
- `weight mean`, `weight size`
- `delay mean`, `delay size`
- `syn type`
- `dropout` and `dropout value`
- `sim steps`, `syn tau`, `types all`
- `pulse force`, `pulse width`
- `gravity force`, `repel force`, `attract force`
- `audio volume`, `audio mute`, `show scopes`
- `circle size`, `note duration`, `note volume`
- `dt`, `noise`, `net`, `scale`, `knobs`
- `dc all`

Example forms:
- `/client/weight mean <float>`
- `/client/weight_mean <float>`
- `/client/audio volume <float>`
- `/client/audio_volume <float>`

## 5.3 Server broadcasts produced after updates

- `/server/neuron <id> <value>`
- `/server/spike/{id}`
- `/server/voltages <v1> <v2> ...` (visual clients)
- `/server/neurons/dc <clientId> <dc1> <dc2> ...`
- `/server/syntype/{id} <value>`
- `/server/weight/{from}/{to} <value>`
- `/server/delay/{from}/{to} <value>`
- `/server/drop/{from}/{to} <0|1>`
- `/server/droporder <jsonArrayOfFromToKeys>`
- `/server/{setting}` for parameter synchronization

## 6) External OSC UDP forwarding (optional)

Configured via `config.json`:
```json
"oscForward": {
  "host": "192.168.1.255",
  "port": 57120
}
```

Behavior:
- On every spike, server forwards `/pulse <neuronId>` via UDP.
- Incoming update messages containing `/dc` or `/neuron` are forwarded too.
  - `/neuron` is mapped to UDP `/dc`.

## 7) CLI options for `server.js`

```bash
node server.js [options]
```

Supported options:
- `--ip <host>` or `--host <host>`: force WS URL host for clients
- `--state <file>`: load state file on startup
- `--neurons <n>`: override neuron count
- `--autosave`: enable autosave after state-changing updates
- `--autosave-path <file>`: autosave destination (default `state_dump.json`)
- `--autosave-delay <ms>`: debounce delay for autosave (default `750`)

## 8) Recommended operator workflow

1. Start server (`npm start`).
2. Open one visual page (`/snn`) on display machine.
3. Open one or more performer controllers (`/controller`) on phones/tablets.
4. Open admin page (`/controller/admin.html`) on operator laptop.
5. Open monitor (`/monitor.html`) for health/activity and force disconnects.
6. Save state before/after sessions via `POST /api/state/save`.

## 9) Troubleshooting

- Controller shows “Maximum number of controllers reached”:
  - Increase `maxControllers` in `config.json`, restart server.
- Clients fail WS connection:
  - Check `GET /api/config` and network reachability to WS port.
- No external OSC output:
  - Verify `oscForward.host/port` and firewall/UDP routing.
- Need to reset session quickly:
  - Use monitor disconnect buttons or `DELETE /api/clients/:id`.
  - Reload a known-good state with `POST /api/state/load`.

---
If you want, I can also generate a one-page **runbook checklist** (`RUNBOOK.md`) for live performances (pre-flight, show-time, shutdown).