# ADR 0007: Atomic Configuration Storage Foundation

## Status

Accepted.

## Context

EspControl currently persists cards and subpages through restored ESPHome text
entities. This remains the production compatibility path, but a future
versioned device configuration service needs storage that cannot lose the last
working configuration when power is interrupted during a save.

The storage mechanism must work on constrained panels, avoid requiring a JSON
library, and allow the document format to evolve independently of its durable
envelope.

## Decision

Use `ConfigurationStore` as the storage boundary for the future configuration
service. It stores an opaque payload in two fixed-capacity slots. Each slot has
a versioned header containing a generation, payload length, and CRC32 checksum.

A commit writes and syncs the payload before publishing and syncing its header.
The other valid slot is not modified. Reads validate both slots and select the
newest valid generation; if the newest slot is incomplete or corrupt, the
previous valid generation is returned.

The core store depends only on a narrow `StorageBackend`. The later ESPHome
adapter will own flash preferences or partition access. Document parsing,
schema validation, legacy text-entity import, and the HTTP API remain separate
layers.

## Migration

This foundation does not change production persistence or any Home Assistant
entity. Later stages will:

1. define and validate the versioned configuration document;
2. add an ESPHome storage adapter and configuration service;
3. import current text entities into the document;
4. dual-write the old and new formats while rollback is supported; and
5. switch the web configurator only when a device advertises the new API.

## Consequences

- The last valid configuration survives interrupted payload and header writes.
- Storage format changes require a new envelope version or an explicit reader.
- Payload size is bounded by the platform adapter's fixed slot capacity.
- Firmware integrations must check every load and commit result explicitly.
- The existing text-entity configuration remains authoritative until the
  migration service is integrated and physically tested.
