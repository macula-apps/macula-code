# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-16

### Added

- Connection to the live fleet via `@macula-io/ts` 0.17.0, with a status
  bar item that reflects the link state and clicks to connect/disconnect.
- Mesh Rooms: open an unguessable `agents.room.<hex>` topic or join one by
  topic, with participant and last-message tracking in the Mesh Rooms view.
- Mesh Agents: one RPC call per configured procedure, JSON payload in, the
  reply shown in a document; the procedure list is the `macula.agents`
  setting.
- Mesh Content: share a snippet or whole editor as a content-addressed blob
  (MCID copied to the clipboard), and fetch any MCID back into a document.
- Collaborative editing: local edits are published as
  `(path, offset, removed, inserted)` envelopes on `macula.code.edits` and
  remote envelopes are applied to the same open document (last-write-wins).
- Realm derivation matching the Erlang SDK: a realm name is hashed with
  SHA-256 into the 32-byte tag (`macula_realm:id/1`), a 64-hex tag is
  passed through, empty means the all-zero realm.
- Identity handling: the Ed25519 identity is persisted mode 0600; an
  unreadable file rotates the key loudly and persists the replacement;
  only a failed persist falls back to an ephemeral identity, which
  refuses to connect.
- `macula.autoConnect`, `macula.agents`, `macula.enableCollaboration`,
  `macula.stationHost`/`stationPort`/`realm`/`identityPath` settings.
- Keybindings: `ctrl+alt+m c` connect, `ctrl+alt+m d` disconnect,
  `ctrl+alt+m o` open room, `ctrl+alt+m s` share snippet.

### Fixed

- The scaffold no longer depends on a sibling `macula-ts` checkout to
  build: the `build:go` prebuild step is gone and `@macula-io/ts` is
  pinned to `^0.17.0` from npm.
- `activationEvents` no longer uses `*`; the extension activates on
  startup finished.
