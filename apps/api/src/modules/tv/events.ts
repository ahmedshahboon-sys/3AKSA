import { EventEmitter } from 'node:events';

export type TvBroadcastChannel = {
  id: string;
  name: string;
  groupName: string | null;
  streamUrl: string;
  logoUrl: string | null;
};

export type RoomTvBroadcastState = {
  enabled: boolean;
  channel: TvBroadcastChannel | null;
  updatedAt: Date | null;
};

type RoomStateEvent = {
  roomId: string;
  state: RoomTvBroadcastState;
};

class TvEventBus {
  private readonly emitter = new EventEmitter();

  onRoomState(listener: (event: RoomStateEvent) => void) {
    this.emitter.on('room-state', listener);
    return () => this.emitter.off('room-state', listener);
  }

  emitRoomState(event: RoomStateEvent) {
    this.emitter.emit('room-state', event);
  }
}

export const tvEvents = new TvEventBus();
