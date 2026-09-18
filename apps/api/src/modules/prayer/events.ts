import { EventEmitter } from 'node:events';

export type PrayerName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'sunset' | 'maghrib' | 'isha';

export type PrayerDueEvent = {
  userId: string;
  prayer: PrayerName;
  referenceKey: string;
  referenceName: string;
  scheduledAt: string;
  message: string;
  soundEnabled: boolean;
};

class PrayerEventBus {
  private readonly emitter = new EventEmitter();

  onDue(listener: (event: PrayerDueEvent) => void) {
    this.emitter.on('due', listener);
    return () => this.emitter.off('due', listener);
  }

  emitDue(event: PrayerDueEvent) {
    this.emitter.emit('due', event);
  }
}

export const prayerEvents = new PrayerEventBus();
