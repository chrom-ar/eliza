export interface Message {
  timestamp: number;
  body: any;
  roomId: string;
}

export interface MessageCallback {
  (message: Message): Promise<void> | void;
}

export interface MessageProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publishToGeneral(message: Message): Promise<void>;
  publishToRoom(message: Message): Promise<void>;
  subscribeToRoom(roomId: string, callback: MessageCallback, expirationSeconds?: number): Promise<void>;
  unsubscribeFromRoom(roomId: string): Promise<void>;
}

export interface MessageProviderConfig {
  type: 'waku' | 'redis';
  // Common config options
  generalTopic?: string;
  roomTopicPrefix?: string;

  // Waku specific options
  wakuContentTopic?: string;
  wakuTopic?: string;

  // Redis specific options
  redisUrl?: string;
  redisKeyPrefix?: string;
}