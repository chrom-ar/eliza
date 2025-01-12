import { describe, test, expect, beforeEach, vi } from 'vitest';
import { NostrDelivery } from './nostrDelivery';
import { NostrBase } from './base';
import { IAgentRuntime } from '@elizaos/core';

// Mock NostrBase
vi.mock('./base');

describe('NostrDelivery', () => {
  let nostrDelivery: NostrDelivery;
  let mockRuntime: IAgentRuntime;
  let mockConfig: any;

  beforeEach(() => {
    mockRuntime = {
      agentId: 'test-agent-id',
      ensureUserExists: vi.fn(),
      ensureConnection: vi.fn(),
      messageManager: {
        createMemory: vi.fn()
      },
      getSetting: vi.fn()
    } as unknown as IAgentRuntime;

    mockConfig = {
      NOSTR_CONTENT_TOPIC: 'test/topic/PLACEHOLDER',
      NOSTR_TOPIC: 'test',
      NOSTR_RELAY_WSS: 'wss://test.relay'
    };

    nostrDelivery = new NostrDelivery(mockRuntime, mockConfig);
  });

  test('should initialize correctly', async () => {
    await nostrDelivery.init();
    expect(NostrBase.prototype.init).toHaveBeenCalled();
  });

  test('should handle incoming messages', async () => {
    await nostrDelivery.init();

    const mockEvent = {
      content: JSON.stringify({
        body: 'test message',
        roomId: 'test-room'
      }),
      timestamp: Date.now()
    };

    // Get the callback passed to nostrBase.on('message')
    // Reverse the array to get the last call for the previous tests
    const messageCallback = (NostrBase.prototype.on as any).mock.calls.reverse().find(
      call => call[0] === 'message'
    )[1];

    await messageCallback(mockEvent);

    expect(mockRuntime.ensureUserExists).toHaveBeenCalled();
    expect(mockRuntime.ensureConnection).toHaveBeenCalled();
    expect(mockRuntime.messageManager.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          text: 'test message',
          source: 'nostr'
        })
      })
    );
  });

  test('should send messages', async () => {
    await nostrDelivery.init();

    const mockSecretKey = new Uint8Array(32);
    await nostrDelivery.send('test message', mockSecretKey, 'test-room');

    expect(NostrBase.prototype.sendMessage).toHaveBeenCalledWith(
      'test message',
      mockConfig.NOSTR_CONTENT_TOPIC,
      'test-room',
      mockSecretKey
    );

    expect(mockRuntime.messageManager.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          text: 'test message',
          source: 'nostr'
        })
      })
    );
  });

  test('should handle cleanup on stop', async () => {
    await nostrDelivery.init();
    await nostrDelivery.stop();

    expect(NostrBase.prototype.stop).toHaveBeenCalled();
  });
});