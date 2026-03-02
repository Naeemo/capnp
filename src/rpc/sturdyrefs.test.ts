/**
 * SturdyRefs Tests
 *
 * Tests for Level 2 RPC - Persistent capability references
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  RestoreHandler,
  type SturdyRef,
  SturdyRefManager,
  createSturdyRef,
  deserializeSturdyRef,
  isSturdyRefValid,
  serializeSturdyRef,
} from './sturdyrefs.js';

describe('SturdyRefManager', () => {
  let manager: SturdyRefManager;

  beforeEach(() => {
    manager = new SturdyRefManager('test-vat');
  });

  it('should save a capability as SturdyRef', () => {
    const capability = { test: 'capability' };
    const exportId = 1;

    const ref = manager.saveCapability(capability, exportId);

    expect(ref.vatId).toBe('test-vat');
    expect(ref.localId).toBeDefined();
    expect(ref.version).toBe(1);
  });

  it('should restore a capability from SturdyRef', () => {
    const capability = { test: 'capability' };
    const exportId = 1;

    const ref = manager.saveCapability(capability, exportId);
    const restored = manager.restoreCapability(ref);

    expect(restored).not.toBeNull();
    expect(restored?.capability).toBe(capability);
    expect(restored?.exportId).toBe(exportId);
  });

  it('should return null for non-existent SturdyRef', () => {
    const ref: SturdyRef = {
      vatId: 'test-vat',
      localId: 'non-existent',
    };

    const restored = manager.restoreCapability(ref);
    expect(restored).toBeNull();
  });

  it('should return null for wrong vatId', () => {
    const capability = { test: 'capability' };
    const ref = manager.saveCapability(capability, 1);

    const wrongRef: SturdyRef = {
      ...ref,
      vatId: 'wrong-vat',
    };

    const restored = manager.restoreCapability(wrongRef);
    expect(restored).toBeNull();
  });

  it('should handle expired SturdyRefs', () => {
    const capability = { test: 'capability' };
    const ref = manager.saveCapability(capability, 1, { ttlMs: -1 }); // Already expired

    const restored = manager.restoreCapability(ref);
    expect(restored).toBeNull();
  });

  it('should drop SturdyRefs', () => {
    const capability = { test: 'capability' };
    const ref = manager.saveCapability(capability, 1);

    const dropped = manager.dropSturdyRef(ref.localId);
    expect(dropped).toBe(true);

    const restored = manager.restoreCapability(ref);
    expect(restored).toBeNull();
  });

  it('should list active SturdyRefs', () => {
    manager.saveCapability({ test: 1 }, 1);
    manager.saveCapability({ test: 2 }, 2);

    const active = manager.getActiveRefs();
    expect(active.length).toBe(2);
  });

  it('should cleanup expired refs', () => {
    manager.saveCapability({ test: 1 }, 1, { ttlMs: 10000 }); // Valid
    manager.saveCapability({ test: 2 }, 2, { ttlMs: -1 }); // Expired

    const cleaned = manager.cleanupExpired();
    expect(cleaned).toBe(1);

    const active = manager.getActiveRefs();
    expect(active.length).toBe(1);
  });

  it('should support custom localId', () => {
    const capability = { test: 'capability' };
    const ref = manager.saveCapability(capability, 1, { localId: 'my-custom-id' });

    expect(ref.localId).toBe('my-custom-id');

    const restored = manager.restoreCapability(ref);
    expect(restored?.capability).toBe(capability);
  });

  it('should support metadata', () => {
    const capability = { test: 'capability' };
    const metadata = { description: 'Test capability' };
    const ref = manager.saveCapability(capability, 1, { metadata });

    expect(ref.metadata).toEqual(metadata);
  });
});

describe('SturdyRef Serialization', () => {
  it('should serialize and deserialize SturdyRef', () => {
    const ref: SturdyRef = {
      vatId: 'test-vat',
      localId: 'test-id',
      version: 1,
      expiresAt: Date.now() + 10000,
      metadata: { key: 'value' },
    };

    const serialized = serializeSturdyRef(ref);
    const deserialized = deserializeSturdyRef(serialized);

    expect(deserialized).toEqual(ref);
  });

  it('should return null for invalid JSON', () => {
    const deserialized = deserializeSturdyRef('invalid json');
    expect(deserialized).toBeNull();
  });

  it('should return null for missing required fields', () => {
    const deserialized = deserializeSturdyRef('{"vatId": "test"}');
    expect(deserialized).toBeNull();
  });

  it('should validate SturdyRef expiration', () => {
    const validRef: SturdyRef = {
      vatId: 'test',
      localId: 'test',
      expiresAt: Date.now() + 10000,
    };
    expect(isSturdyRefValid(validRef)).toBe(true);

    const expiredRef: SturdyRef = {
      vatId: 'test',
      localId: 'test',
      expiresAt: Date.now() - 10000,
    };
    expect(isSturdyRefValid(expiredRef)).toBe(false);

    const noExpiryRef: SturdyRef = {
      vatId: 'test',
      localId: 'test',
    };
    expect(isSturdyRefValid(noExpiryRef)).toBe(true);
  });

  it('should create SturdyRef with createSturdyRef', () => {
    const ref = createSturdyRef('vat-1', 'local-1', { ttlMs: 5000, metadata: { key: 'value' } });

    expect(ref.vatId).toBe('vat-1');
    expect(ref.localId).toBe('local-1');
    expect(ref.version).toBe(1);
    expect(ref.expiresAt).toBeGreaterThan(Date.now());
    expect(ref.metadata).toEqual({ key: 'value' });
  });
});
