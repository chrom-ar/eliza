import { describe, test, expect, beforeEach, vi } from 'vitest';
import { NostrBase } from './base';
import { EventEmitter } from 'events';
import { finalizeEvent } from 'nostr-tools/pure';
import { Relay } from 'nostr-tools/relay';

// Mock nostr-tools
vi.mock('nostr-tools/relay', () => ({
  Relay: {
    connect: vi.fn()
  }
}));

vi.mock('nostr-tools/pure', () => ({
  finalizeEvent: vi.fn()
}));

describe('NostrBase', () => {
  let nostrBase: NostrBase;
  const mockConfig = {
    NOSTR_CONTENT_TOPIC: 'test/topic/PLACEHOLDER',
    NOSTR_TOPIC: 'test',
    NOSTR_RELAY_WSS: 'wss://test.relay'
  };

  beforeEach(() => {
    nostrBase = new NostrBase(mockConfig);
    vi.clearAllMocks();
  });

  test('should initialize with config', () => {
    expect(nostrBase).toBeInstanceOf(EventEmitter);
    expect(nostrBase.nostrConfig).toBe(mockConfig);
  });

  test('should connect to relay on init', async () => {
    const mockRelay = {
      subscribe: vi.fn(),
      publish: vi.fn(),
      close: vi.fn()
    };
    (Relay.connect as any).mockResolvedValue(mockRelay);

    await nostrBase.init();

    expect(Relay.connect).toHaveBeenCalledWith(mockConfig.NOSTR_RELAY_WSS);
    expect(nostrBase.nostrRelay).toBe(mockRelay);
  });

  test('should subscribe to topics', async () => {
    const mockRelay = {
      subscribe: vi.fn(),
      publish: vi.fn(),
      close: vi.fn()
    };
    (Relay.connect as any).mockResolvedValue(mockRelay);
    await nostrBase.init();

    const mockCallback = vi.fn();
    await nostrBase.subscribe(mockCallback, 'test-topic');

    expect(mockRelay.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          kinds: [1],
          '#t': ['test/topic/test-topic']
        })
      ]),
      expect.any(Object)
    );
  });

  test('should send messages', async () => {
    const mockRelay = {
      subscribe: vi.fn(),
      publish: vi.fn(),
      close: vi.fn()
    };
    (Relay.connect as any).mockResolvedValue(mockRelay);
    await nostrBase.init();

    const mockSecretKey = new Uint8Array(32);
    const mockSignedEvent = { id: 'test-id', sig: 'test-sig' };
    (finalizeEvent as any).mockReturnValue(mockSignedEvent);

    await nostrBase.sendMessage('test message', 'test-topic', 'test-room', mockSecretKey);

    expect(finalizeEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1,
        content: expect.any(String),
        tags: expect.arrayContaining([['t', 'test/topic/test-topic']])
      }),
      mockSecretKey
    );
    expect(mockRelay.publish).toHaveBeenCalledWith(mockSignedEvent);
  });

  test('should clean up on stop', async () => {
    const mockRelay = {
      subscribe: vi.fn(),
      publish: vi.fn(),
      close: vi.fn()
    };
    (Relay.connect as any).mockResolvedValue(mockRelay);
    await nostrBase.init();

    await nostrBase.stop();
    expect(mockRelay.close).toHaveBeenCalled();
  });
});
