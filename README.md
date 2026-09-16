# macula-code

[![CI](https://img.shields.io/github/actions/workflow/status/macula-apps/macula-code/ci.yml?branch=main&label=CI)](https://github.com/macula-apps/macula-code/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](#license)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.90%2B-007ACC?logo=visualstudiocode)](https://code.visualstudio.com)
[![code](https://img.shields.io/badge/vibe-sovereign-FB923C.svg)](https://github.com/macula-apps/macula-code)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-support-ea4aaa.svg?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/rgfaber)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/macula-code-full-dark.svg">
    <img src="assets/macula-code-full-light.svg" alt="Macula Code" width="320">
  </picture>
</p>

<p align="center">
  <strong>Sovereign collaborative editing, mesh rooms, AI agents, and content sharing — the Macula mesh inside VS Code</strong>
</p>

---

## What is macula-code?

A VS Code extension built directly on
[`@macula-io/ts`](https://github.com/macula-io/macula-ts) (which is an FFI
over [`macula-go`](https://github.com/macula-io/macula-go)), against a real
[`macula-station`](https://github.com/macula-io/macula-station) on the live
fleet. No servers, no accounts: your Ed25519 identity lives in a
mode-0600 file on your own machine, and every byte travels over the mesh.

**What it does, concretely:**

- **Connect** — status bar shows the link state and clicks to connect or
  disconnect; `ctrl+alt+m c` / `ctrl+alt+m d`.
- **Mesh Rooms** — open an unguessable `agents.room.<hex>` topic (the same
  convention macula-mcp uses), join one by topic, and see who has spoken
  there.
- **Mesh Agents** — one unary RPC per configured procedure
  (`hecate-rag.query`, `hecate-llm.complete`, `hecate-dns.resolve`,
  `hecate-git.search` by default; the list is a setting), JSON payload in,
  reply shown in a document.
- **Mesh Content** — share a snippet or the whole editor as a
  content-addressed blob (`putContent`), get the MCID on the clipboard;
  fetch any MCID back (`getContent`, hash-verified client-side by the
  SDK).
- **Collaborative editing** — while connected, edits to open documents are
  published as `(path, offset, removed, inserted)` envelopes on
  `macula.code.edits` and remote envelopes are applied to the same open
  document. Conflicts resolve last-write-wins by arrival order — the
  honest v0.1 semantics.

## Status

**v0.1.0 — the scaffold made real.** Everything above compiles and is
unit-tested where the SDK allows it (realm derivation). It runs against
the live classical fleet on `@macula-io/ts` 0.17.0. The 11.0.0
post-quantum port is planned but not started: it will touch realm
derivation, identity handling, and the org-namespaced procedure names.

## Install

Not yet on the Marketplace. Two ways today:

```sh
# From a GitHub Release (tag v* builds and attaches the .vsix):
# https://github.com/macula-apps/macula-code/releases
code --install-extension macula-code-0.1.0.vsix

# Or build it yourself:
npm install
npm run compile
npx @vscode/vsce package
code --install-extension macula-code-0.1.0.vsix
```

## Configuration

| Setting | Default | Meaning |
|---|---|---|
| `macula.stationHost` | `station-de-frankfurt.macula.io` | Station the extension dials |
| `macula.stationPort` | `4433` | Its QUIC port |
| `macula.realm` | `""` | Realm name (SHA-256 hashed to the 32-byte tag, per `macula_realm:id/1`) or a 64-hex tag passed through; empty = the all-zero realm |
| `macula.identityPath` | `~/.macula-code/identity.json` | Persisted Ed25519 identity, written and kept mode 0600 |
| `macula.autoConnect` | `true` | Connect when the extension activates |
| `macula.enableCollaboration` | `true` | Publish and apply shared edits |
| `macula.agents` | the four defaults above | Procedures listed in the Mesh Agents view |

## Development

```sh
npm install
npm run compile   # tsc
npm test          # vitest (realm derivation)
npm run watch     # tsc -w
```

## License

Apache-2.0. See [LICENSE](LICENSE).
