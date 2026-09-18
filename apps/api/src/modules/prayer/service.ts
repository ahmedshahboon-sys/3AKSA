import { randomUUID } from 'node:crypto';
import { CalculationMethod, Coordinates, PrayerTimes } from 'adhan';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import type { PrayerName } from './events.js';

type PrayerReferenceRow = {
  key: string;
  name_ar: string;
  latitude: number;
  longitude: number;
  timezone: string;
  active: boolean;
  sort_order: number;
};

type PrayerSettingsRow = {
  calculation_method: string;
  fajr_offset_minutes: number;
  sunrise_offset_minutes: number;
  dhuhr_offset_minutes: number;
  asr_offset_minutes: number;
  sunset_offset_minutes: number;
  maghrib_offset_minutes: number;
  isha_offset_minutes: number;
  revision: number;
  updated_at: Date;
};

type PrayerPreferencesRow = {
  user_id: string;
  reference_key: string;
  prayer_alerts_enabled: boolean;
  prayer_sound_enabled: boolean;
  gentle_reminders_enabled: boolean;
  updated_at: Date;
};

export type PrayerScheduleItem = {
  instant: string;
  localTime: string;
};

export type PrayerSchedule = Record<PrayerName, PrayerScheduleItem>;

const ACTUAL_PRAYERS: PrayerName[] = ['fajr','dhuhr','asr','maghrib','isha'];

function roundMinute(date: Date) {
  const value = new Date(date);
  if (value.getUTCSeconds() >= 30) value.setUTCMinutes(value.getUTCMinutes() + 1);
  value.setUTCSeconds(0, 0);
  return value;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function localHm(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function parsePrayerDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_PRAYER_DATE');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year!, month! - 1, day!, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month! - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('INVALID_PRAYER_DATE');
  }
  return date;
}

function referenceDto(row: PrayerReferenceRow) {
  return {
    key: row.key,
    name: row.name_ar,
    timezone: row.timezone
  };
}

function settingsDto(row: PrayerSettingsRow) {
  return {
    calculationMethod: row.calculation_method,
    offsets: {
      fajr: row.fajr_offset_minutes,
      sunrise: row.sunrise_offset_minutes,
      dhuhr: row.dhuhr_offset_minutes,
      asr: row.asr_offset_minutes,
      sunset: row.sunset_offset_minutes,
      maghrib: row.maghrib_offset_minutes,
      isha: row.isha_offset_minutes
    },
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

async function prayerSettings(client?: PoolClient) {
  const sql = `SELECT calculation_method,fajr_offset_minutes,sunrise_offset_minutes,
                      dhuhr_offset_minutes,asr_offset_minutes,sunset_offset_minutes,
                      maghrib_offset_minutes,isha_offset_minutes,revision,updated_at
               FROM prayer_settings
               WHERE singleton=true
               LIMIT 1`;
  const result = client ? await client.query<PrayerSettingsRow>(sql) : await query<PrayerSettingsRow>(sql);
  const row = result.rows[0];
  if (!row) throw new Error('PRAYER_SETTINGS_MISSING');
  return row;
}

async function prayerReference(key: string, client?: PoolClient) {
  const sql = `SELECT key,name_ar,latitude,longitude,timezone,active,sort_order
               FROM prayer_references
               WHERE key=$1 AND active=true
               LIMIT 1`;
  const result = client
    ? await client.query<PrayerReferenceRow>(sql,[key])
    : await query<PrayerReferenceRow>(sql,[key]);
  return result.rows[0] ?? null;
}

function scheduleItem(date: Date, offset: number, timeZone: string): PrayerScheduleItem {
  const adjusted = roundMinute(addMinutes(date, offset));
  return {
    instant: adjusted.toISOString(),
    localTime: localHm(adjusted, timeZone)
  };
}

function calculateSchedule(reference: PrayerReferenceRow, date: string, settings: PrayerSettingsRow): PrayerSchedule {
  const coordinates = new Coordinates(reference.latitude, reference.longitude);
  const params = CalculationMethod.MuslimWorldLeague();
  const prayerTimes = new PrayerTimes(coordinates, parsePrayerDate(date), params);

  const baseMaghrib = prayerTimes.maghrib;

  return {
    fajr: scheduleItem(prayerTimes.fajr, settings.fajr_offset_minutes, reference.timezone),
    sunrise: scheduleItem(prayerTimes.sunrise, settings.sunrise_offset_minutes, reference.timezone),
    dhuhr: scheduleItem(prayerTimes.dhuhr, settings.dhuhr_offset_minutes, reference.timezone),
    asr: scheduleItem(prayerTimes.asr, settings.asr_offset_minutes, reference.timezone),
    sunset: scheduleItem(baseMaghrib, settings.sunset_offset_minutes, reference.timezone),
    maghrib: scheduleItem(baseMaghrib, settings.maghrib_offset_minutes, reference.timezone),
    isha: scheduleItem(prayerTimes.isha, settings.isha_offset_minutes, reference.timezone)
  };
}

export async function listPrayerReferences() {
  const result = await query<PrayerReferenceRow>(
    `SELECT key,name_ar,latitude,longitude,timezone,active,sort_order
     FROM prayer_references
     WHERE active=true
     ORDER BY sort_order,name_ar`
  );
  return result.rows.map(referenceDto);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2-lat1) * rad;
  const dLon = (lon2-lon1) * rad;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

export async function nearestPrayerReference(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('INVALID_LATITUDE');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('INVALID_LONGITUDE');
  const result = await query<PrayerReferenceRow>(
    `SELECT key,name_ar,latitude,longitude,timezone,active,sort_order
     FROM prayer_references
     WHERE active=true`
  );
  if (result.rows.length===0) throw new Error('PRAYER_REFERENCE_NOT_FOUND');
  const nearest = result.rows
    .map((row)=>({row,distanceKm:haversineKm(latitude,longitude,row.latitude,row.longitude)}))
    .sort((a,b)=>a.distanceKm-b.distanceKm)[0]!;
  return {
    reference: referenceDto(nearest.row),
    approximateDistanceKm: Math.round(nearest.distanceKm)
  };
}

export async function getPrayerSchedule(referenceKey: string, date?: string) {
  const reference = await prayerReference(referenceKey);
  if (!reference) throw new Error('PRAYER_REFERENCE_NOT_FOUND');
  const settings = await prayerSettings();
  const prayerDate = date ?? dateInTimeZone(new Date(),reference.timezone);

  const cached = await query<{schedule: PrayerSchedule}>(
    `SELECT schedule
     FROM prayer_schedule_cache
     WHERE reference_key=$1 AND prayer_date=$2 AND settings_revision=$3
     LIMIT 1`,
    [reference.key,prayerDate,settings.revision]
  );
  if (cached.rows[0]) {
    return {
      reference:referenceDto(reference),
      date:prayerDate,
      timezone:reference.timezone,
      schedule:cached.rows[0].schedule,
      settingsRevision:settings.revision,
      cached:true
    };
  }

  const schedule = calculateSchedule(reference,prayerDate,settings);
  await query(
    `INSERT INTO prayer_schedule_cache (reference_key,prayer_date,settings_revision,schedule)
     VALUES ($1,$2,$3,$4::jsonb)
     ON CONFLICT (reference_key,prayer_date,settings_revision)
     DO UPDATE SET schedule=EXCLUDED.schedule,generated_at=now()`,
    [reference.key,prayerDate,settings.revision,JSON.stringify(schedule)]
  );

  return {
    reference:referenceDto(reference),
    date:prayerDate,
    timezone:reference.timezone,
    schedule,
    settingsRevision:settings.revision,
    cached:false
  };
}

async function ensurePreferences(userId: string, client?: PoolClient) {
  const sql = `INSERT INTO user_prayer_preferences (user_id)
               VALUES ($1)
               ON CONFLICT (user_id) DO UPDATE SET user_id=EXCLUDED.user_id
               RETURNING user_id,reference_key,prayer_alerts_enabled,prayer_sound_enabled,
                         gentle_reminders_enabled,updated_at`;
  const result = client
    ? await client.query<PrayerPreferencesRow>(sql,[userId])
    : await query<PrayerPreferencesRow>(sql,[userId]);
  return result.rows[0]!;
}

export async function getPrayerPreferences(userId: string) {
  const row = await ensurePreferences(userId);
  return {
    referenceKey:row.reference_key,
    prayerAlertsEnabled:row.prayer_alerts_enabled,
    prayerSoundEnabled:row.prayer_sound_enabled,
    gentleRemindersEnabled:row.gentle_reminders_enabled,
    updatedAt:row.updated_at
  };
}

export async function updatePrayerPreferences(
  userId: string,
  patch: {
    referenceKey?: string | undefined;
    prayerAlertsEnabled?: boolean | undefined;
    prayerSoundEnabled?: boolean | undefined;
    gentleRemindersEnabled?: boolean | undefined;
  }
) {
  return withTransaction(async (client)=>{
    const current = await ensurePreferences(userId,client);
    const referenceKey = patch.referenceKey ?? current.reference_key;
    if (!(await prayerReference(referenceKey,client))) throw new Error('PRAYER_REFERENCE_NOT_FOUND');

    const result = await client.query<PrayerPreferencesRow>(
      `UPDATE user_prayer_preferences
       SET reference_key=$2,
           prayer_alerts_enabled=$3,
           prayer_sound_enabled=$4,
           gentle_reminders_enabled=$5,
           updated_at=now()
       WHERE user_id=$1
       RETURNING user_id,reference_key,prayer_alerts_enabled,prayer_sound_enabled,
                 gentle_reminders_enabled,updated_at`,
      [
        userId,
        referenceKey,
        patch.prayerAlertsEnabled ?? current.prayer_alerts_enabled,
        patch.prayerSoundEnabled ?? current.prayer_sound_enabled,
        patch.gentleRemindersEnabled ?? current.gentle_reminders_enabled
      ]
    );
    const row=result.rows[0]!;
    return {
      referenceKey:row.reference_key,
      prayerAlertsEnabled:row.prayer_alerts_enabled,
      prayerSoundEnabled:row.prayer_sound_enabled,
      gentleRemindersEnabled:row.gentle_reminders_enabled,
      updatedAt:row.updated_at
    };
  });
}

export async function resolveAndSetPrayerReference(userId: string, latitude: number, longitude: number) {
  const nearest = await nearestPrayerReference(latitude,longitude);
  await updatePrayerPreferences(userId,{referenceKey:nearest.reference.key});
  return nearest;
}

async function requireSuperAdmin(userId: string, client?: PoolClient) {
  const sql = `SELECT 1 FROM staff_roles
               WHERE user_id=$1 AND role='super_admin'
               LIMIT 1`;
  const result = client ? await client.query(sql,[userId]) : await query(sql,[userId]);
  if ((result.rowCount ?? 0)===0) throw new Error('SUPER_ADMIN_REQUIRED');
}

export async function getPrayerAdminSettings(actorUserId: string) {
  await requireSuperAdmin(actorUserId);
  return settingsDto(await prayerSettings());
}

const offsetNames = ['fajr','sunrise','dhuhr','asr','sunset','maghrib','isha'] as const;
type OffsetName = typeof offsetNames[number];

export async function updatePrayerAdminSettings(
  actorUserId: string,
  offsets: Partial<Record<OffsetName,number>>
) {
  if (Object.keys(offsets).length===0) throw new Error('NO_PRAYER_SETTINGS_CHANGES');
  for (const [key,value] of Object.entries(offsets)) {
    if (!offsetNames.includes(key as OffsetName) || !Number.isInteger(value) || value! < -60 || value! > 60) {
      throw new Error('INVALID_PRAYER_OFFSET');
    }
  }

  return withTransaction(async (client)=>{
    await requireSuperAdmin(actorUserId,client);
    const current=await prayerSettings(client);
    const next = {
      fajr:offsets.fajr ?? current.fajr_offset_minutes,
      sunrise:offsets.sunrise ?? current.sunrise_offset_minutes,
      dhuhr:offsets.dhuhr ?? current.dhuhr_offset_minutes,
      asr:offsets.asr ?? current.asr_offset_minutes,
      sunset:offsets.sunset ?? current.sunset_offset_minutes,
      maghrib:offsets.maghrib ?? current.maghrib_offset_minutes,
      isha:offsets.isha ?? current.isha_offset_minutes
    };

    const result=await client.query<PrayerSettingsRow>(
      `UPDATE prayer_settings SET
         fajr_offset_minutes=$1,
         sunrise_offset_minutes=$2,
         dhuhr_offset_minutes=$3,
         asr_offset_minutes=$4,
         sunset_offset_minutes=$5,
         maghrib_offset_minutes=$6,
         isha_offset_minutes=$7,
         revision=revision+1,
         updated_by=$8,
         updated_at=now()
       WHERE singleton=true
       RETURNING calculation_method,fajr_offset_minutes,sunrise_offset_minutes,
                 dhuhr_offset_minutes,asr_offset_minutes,sunset_offset_minutes,
                 maghrib_offset_minutes,isha_offset_minutes,revision,updated_at`,
      [next.fajr,next.sunrise,next.dhuhr,next.asr,next.sunset,next.maghrib,next.isha,actorUserId]
    );
    const updated=result.rows[0]!;
    await client.query(
      `INSERT INTO prayer_admin_actions (id,actor_user_id,action,metadata)
       VALUES ($1,$2,'prayer_offsets_update',$3::jsonb)`,
      [randomUUID(),actorUserId,JSON.stringify({offsets,revision:updated.revision})]
    );
    return settingsDto(updated);
  });
}

export function prayerMessage(prayer: PrayerName) {
  const labels: Record<PrayerName,string> = {
    fajr:'الفجر',
    sunrise:'الشروق',
    dhuhr:'الظهر',
    asr:'العصر',
    sunset:'الغروب',
    maghrib:'المغرب',
    isha:'العشاء'
  };
  return `وقت صلاة ${labels[prayer]} 🌙 نوض صلّي وتعالى`;
}

export function actualPrayerNames() {
  return [...ACTUAL_PRAYERS];
}
