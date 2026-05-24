# Server Configuration Tab — Design Spec

**Date:** 2026-05-24
**Status:** Approved

## Overview

Add a "Configuration" tab to the server detail page in KatCraftPanel, allowing users to configure all Docker environment variables for the itzg/minecraft-server image. JVM options, memory, ports, game rules, and advanced flags are passed directly as Docker env vars (not via `user_jvm_args.txt`, which is regenerated on each container start).

## Architecture

- **Approach:** Tab-based (Approach A) — new "Configuration" tab in the existing server-detail page
- **Source of truth:** `.katcraft-server.json` metadata file per server
- **Application model:** Deferred — save writes metadata, apply recreates container on user confirmation
- **Existing behavior preserved:** `config-updater.js` double-write to `server.properties` is left untouched

## Data Model

All server configuration stored in `/app/servers/<name>/.katcraft-server.json`:

```json
{
  "name": "survival-1",
  "type": "PAPER",
  "version": "LATEST",
  "serverPort": 25565,
  "rconPort": 25575,
  "rconPassword": "minecraft",
  "autostart": false,
  "difficulty": "2",
  "mode": "0",
  "motd": "KatCraft - Survival 1",
  "maxPlayers": 20,
  "viewDistance": 10,
  "seed": "",
  "ops": "",
  "whitelist": "",
  "enableWhitelist": false,
  "pvp": true,
  "spawnProtection": 4,
  "enableCommandBlock": false,
  "allowFlight": false,
  "onlineMode": false,
  "timezone": "Europe/Paris",
  "memory": "2G",
  "initMemory": "2G",
  "maxMemory": "2G",
  "jvmOpts": "",
  "jvmXxOpts": "",
  "jvmDdOpts": "",
  "useAikarFlags": false,
  "useMeowiceFlags": false,
  "enableJmx": false,
  "jmxHost": "",
  "jmxPort": "7091"
}
```

Defaults for new fields: empty strings or false.

## Backend

### New Routes (in `src/routes/servers.js`)

**`GET /api/servers/:name/config`**
- Reads `.katcraft-server.json`, returns full config
- Falls back to `defaultServerMeta()` if file missing

**`PUT /api/servers/:name/config`**
- Receives full config object, validates basic types (ports in 1024-65535, memory format)
- Writes to `.katcraft-server.json`
- Returns saved config. Does NOT restart container.

**`POST /api/servers/:name/apply-config`**
- Recreates container with current metadata:
  1. Stop container (with timeout)
  2. Remove container
  3. `createServer(name, metadata)` — reads all options from metadata
  4. Start new container
  5. Rebuild velocity + autoserver configs
- Returns success/error

### Modifications to `src/services/docker.js`

Extend `createServer()` env-var mappings:

| Metadata field | Docker env var |
|---|---|
| `memory` | `MEMORY` |
| `initMemory` | `INIT_MEMORY` |
| `maxMemory` | `MAX_MEMORY` |
| `jvmOpts` | `JVM_OPTS` |
| `jvmXxOpts` | `JVM_XX_OPTS` |
| `jvmDdOpts` | `JVM_DD_OPTS` |
| `useAikarFlags` | `USE_AIKAR_FLAGS` |
| `useMeowiceFlags` | `USE_MEOWICE_FLAGS` |
| `enableJmx` | `ENABLE_JMX` |
| `jmxHost` | `JMX_HOST` |
| `jmxPort` | `JMX_PORT` |

Boolean fields are passed as `"true"`/`"false"` strings. Empty string fields are omitted from env vars.

**Memory logic:** When `initMemory`/`maxMemory` are non-empty, they take precedence. Otherwise `memory` is used for both `INIT_MEMORY` and `MAX_MEMORY`. The UI "simple mode" sets only `memory`; "advanced mode" exposes `initMemory` and `maxMemory` independently.

### Frontend API additions (`public/js/api.js`)

```javascript
getServerConfig(name) { ... },
updateServerConfig(name, config) { ... },
applyServerConfig(name) { ... },
```

## Frontend

### New Component: `public/js/components/server-config.js`

Accordion UI with 6 collapsible sections:

1. **JVM & Memory** — `memory` (simple mode: single field; advanced: `initMemory`/`maxMemory`), `jvmOpts` (textarea), `jvmXxOpts` (textarea), `jvmDdOpts`
2. **Optimization Flags** — toggles for `useAikarFlags`, `useMeowiceFlags`
3. **JMX / Profiling** — toggle `enableJmx`, conditional fields `jmxHost`, `jmxPort`
4. **Network & Ports** — `serverPort`, `rconPort`, `rconPassword`
5. **Game Rules** — `motd`, `difficulty` (select), `mode` (select), `maxPlayers`, `viewDistance`, `seed`, toggles: `pvp`, `allowFlight`, `enableCommandBlock`, `onlineMode`, `enableWhitelist` + `whitelist`
6. **Advanced** — `type` (select), `version` (select), `ops`, `timezone`, `spawnProtection`

Behavior:
- Sections collapsed by default
- First section ("JVM & Memory") can be open by default
- Conditional fields appear/disappear based on toggles (JMX host/port only when enabled)
- "Save Configuration" button at bottom

### Integration in `server-detail.js`

- Add 6th tab button: `<button class="tab" data-tab="configuration">Configuration</button>`
- Add lazy-load entry in `setupTabs()` that calls `ServerConfig.init(container, serverName)`

### User Flow

```
Open Configuration tab → Expand sections → Edit values → "Save Configuration"
    ↓
PUT /api/servers/:name/config
    ↓
Popup: "Configuration saved. Restart server to apply changes?"
    ├─ [Restart Now] → POST /apply-config → Toast "Server restarted"
    └─ [Later] → Popup closes, user continues
```

## Error Handling

- **Metadata read failure:** fallback to `defaultServerMeta()`, log error
- **Save failure:** HTTP 500, frontend toast with error message
- **Container recreation failure:** old container already removed, but `/data` persists on host volume. Log full error, return 500, frontend shows retry option.
- **Validation:** ports range 1024-65535, memory format validation on backend. No strict validation on JVM opts (image handles invalid values).

## Files Changed

| File | Change |
|---|---|
| `webapp/src/routes/servers.js` | Add 3 new routes |
| `webapp/src/services/docker.js` | Extend `createServer()` env mappings |
| `webapp/public/js/api.js` | Add 3 new API methods |
| `webapp/public/js/components/server-config.js` | **New file** — config component |
| `webapp/public/js/components/server-detail.js` | Add Configuration tab + lazy-load |
| `webapp/public/index.html` | Add `<script>` tag for server-config.js |

## What Is NOT Changed

- `config-updater.js` — existing `server.properties` writing preserved
- `server-create.js` — creation flow unchanged
- `user_jvm_args.txt` writing — `writeUserJvmArgs()` kept but not called for new paths
- Backup, RCON, file manager, terminal — untouched
