import { describe, expect, test } from 'bun:test';

import { resolveEmbeddedWasmB64 } from '@llman-sdd/core';

// Minimal valid wasm: magic \0asm + version 1 (0x01 0x00 0x00 0x00).
const WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0xff]);
const WASM_B64 = Buffer.from(WASM_BYTES).toString('base64');

describe('resolveEmbeddedWasmB64', () => {
  test('decodes a base64 wasm blob back to identical bytes', () => {
    const decoded = resolveEmbeddedWasmB64(WASM_B64);
    expect(decoded).toBeDefined();
    expect([...(decoded as Uint8Array)]).toEqual([...WASM_BYTES]);
  });

  test('accepts base64 with padding/whitespace variants via lenient decoding', () => {
    expect(resolveEmbeddedWasmB64(` ${WASM_B64}\n`)).toBeDefined();
  });

  test('rejects empty and absent values', () => {
    expect(resolveEmbeddedWasmB64(undefined)).toBeUndefined();
    expect(resolveEmbeddedWasmB64('')).toBeUndefined();
  });

  test('rejects non-string values', () => {
    expect(resolveEmbeddedWasmB64(123)).toBeUndefined();
    expect(resolveEmbeddedWasmB64({})).toBeUndefined();
  });

  test('rejects blobs without the WASM magic (base64 never throws, magic is the guard)', () => {
    const notWasm = Buffer.from('definitely not a wasm binary').toString('base64');
    expect(resolveEmbeddedWasmB64(notWasm)).toBeUndefined();
  });
});
