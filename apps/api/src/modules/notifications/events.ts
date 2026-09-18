import { EventEmitter } from 'node:events';

export type NotificationRealtimePayload = {
  userId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    soundKey: string | null;
    createdAt: Date;
  };
};

class NotificationEventBus {
  private readonly emitter = new EventEmitter();

  onNew(listener:(event:NotificationRealtimePayload)=>void){
    this.emitter.on('new',listener);
    return ()=>this.emitter.off('new',listener);
  }

  emitNew(event:NotificationRealtimePayload){
    this.emitter.emit('new',event);
  }
}

export const notificationEvents=new NotificationEventBus();
