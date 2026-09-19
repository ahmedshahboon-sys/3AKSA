import { io, type Socket } from 'socket.io-client';

export type RealtimeOptions = {
  url: string;
  path: string;
  getAccessToken: () => string | null | undefined;
  allowCookieAuth?: boolean;
};

export type AckPayload = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  retryAfterSeconds?: number;
  replayed?: boolean;
};

export type RealtimeEventMap = {
  'notification:new': { notification: unknown };
  'prayer:time': {
    prayer: string;
    referenceKey: string;
    referenceName: string;
    scheduledAt: string;
    message: string;
    soundEnabled: boolean;
    displayDurationMs: number;
  };
  'room:presence': { roomId: string; onlineCount: number };
  'room:member-joined': { roomId: string; user: unknown };
  'room:member-left': { roomId: string; user: unknown };
  'room:message': { roomId?: string; message: unknown };
  'room:message-deleted': { roomId: string; messageId: string };
  'room:reaction': { roomId: string; messageId: string; reaction: string; count: number };
  'room:tv-state': { roomId: string; tv: unknown };
  'private:message': { conversationId: string; message: unknown };
  'private:request': { conversationId: string; peer: unknown; message: unknown };
  'private:reaction': { conversationId: string; messageId: string; reaction: string; count: number };
};

function normalizePath(path: string) {
  const leading = path.startsWith('/') ? path : `/${path}`;
  return leading;
}

export class RealtimeClient {
  private readonly options: RealtimeOptions;
  private socket: Socket | null = null;

  constructor(options: RealtimeOptions) {
    this.options = { ...options, path: normalizePath(options.path) };
  }

  get connected() {
    return Boolean(this.socket?.connected);
  }

  connect() {
    const token = this.options.getAccessToken();
    if (!token && !this.options.allowCookieAuth) return null;

    if (this.socket) {
      this.socket.auth = token ? { accessToken: token } : {};
      if (!this.socket.connected) this.socket.connect();
      return this.socket;
    }

    this.socket = io(this.options.url, {
      path: this.options.path,
      autoConnect: true,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: token ? { accessToken: token } : {},
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      timeout: 10_000
    });
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  refreshAuth() {
    const token = this.options.getAccessToken();
    if (!this.socket) return this.connect();
    this.socket.auth = token ? { accessToken: token } : {};
    if (this.socket.connected) {
      this.socket.disconnect().connect();
    } else if (token || this.options.allowCookieAuth) {
      this.socket.connect();
    }
    return this.socket;
  }

  on<K extends keyof RealtimeEventMap>(event: K, listener: (payload: RealtimeEventMap[K]) => void) {
    const socket = this.connect();
    if (!socket) return () => undefined;
    socket.on(event as string, listener as (...args: unknown[]) => void);
    return () => {
      socket.off(event as string, listener as (...args: unknown[]) => void);
    };
  }

  onConnection(listener: (connected: boolean) => void) {
    const socket = this.connect();
    if (!socket) {
      listener(false);
      return () => undefined;
    }
    const connected = () => listener(true);
    const disconnected = () => listener(false);
    socket.on('connect', connected);
    socket.on('disconnect', disconnected);
    listener(socket.connected);
    return () => {
      socket.off('connect', connected);
      socket.off('disconnect', disconnected);
    };
  }

  emitAck<T extends AckPayload = AckPayload>(event: string, payload?: unknown): Promise<T> {
    const socket = this.connect();
    if (!socket) return Promise.resolve({ ok: false, error: 'UNAUTHORIZED' } as T);
    return new Promise<T>((resolve) => {
      socket.timeout(12_000).emit(event, payload ?? {}, (error: Error | null, response?: T) => {
        if (error) {
          resolve({ ok: false, error: 'REALTIME_TIMEOUT' } as T);
          return;
        }
        resolve(response ?? ({ ok: true } as T));
      });
    });
  }

  joinRoom(roomId: string) {
    return this.emitAck('room:join', { roomId });
  }

  leaveRoom(roomId: string) {
    return this.emitAck('room:leave', { roomId });
  }

  sendRoomText(roomId: string, text: string, clientMessageId = crypto.randomUUID()) {
    return this.emitAck('room:message:send', { roomId, text, clientMessageId });
  }

  sendRoomVoice(roomId: string, audio: ArrayBuffer | Uint8Array, durationMs: number, clientMessageId = crypto.randomUUID()) {
    return this.emitAck('room:voice:send', { roomId, audio, durationMs, clientMessageId });
  }

  setRoomLike(roomId: string, messageId: string, active = true) {
    return this.emitAck('room:reaction:like:set', { roomId, messageId, active });
  }

  setRoomTv(roomId: string, patch: { enabled?: boolean; channelId?: string | null }) {
    return this.emitAck('room:tv:set', { roomId, ...patch });
  }

  startPrivate(username: string, text: string, clientMessageId = crypto.randomUUID()) {
    return this.emitAck('private:message:start', { username, text, clientMessageId });
  }

  joinPrivate(conversationId: string) {
    return this.emitAck('private:conversation:join', { conversationId });
  }

  leavePrivate(conversationId: string) {
    return this.emitAck('private:conversation:leave', { conversationId });
  }

  sendPrivateText(conversationId: string, text: string, clientMessageId = crypto.randomUUID()) {
    return this.emitAck('private:message:send', { conversationId, text, clientMessageId });
  }

  sendPrivateVoice(conversationId: string, audio: ArrayBuffer | Uint8Array, durationMs: number, clientMessageId = crypto.randomUUID()) {
    return this.emitAck('private:voice:send', { conversationId, audio, durationMs, clientMessageId });
  }

  setPrivateLike(conversationId: string, messageId: string, active = true) {
    return this.emitAck('private:reaction:like:set', { conversationId, messageId, active });
  }

  heartbeat() {
    return this.emitAck('presence:heartbeat');
  }
}
