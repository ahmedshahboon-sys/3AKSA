import { useState } from 'react';
import { api } from '../runtime';
import { readableError, useApiResource } from '../useApiResource';
import { ScreenHeader } from '../ui';
import { LiveState } from './common';

export function LivePrayerSettingsScreen(){
  const [error,setError]=useState('');
  const resource=useApiResource(async()=>{
    const [references,preferences,schedule]=await Promise.all([api.prayerReferences(),api.prayerPreferences(),api.prayerSchedule()]);
    return {references:references.references,preferences:preferences.preferences,schedule:schedule.prayer};
  },[]);
  async function patch(input:Parameters<typeof api.updatePrayerPreferences>[0]){
    setError('');
    try{const response=await api.updatePrayerPreferences(input);resource.setData((current)=>current?{...current,preferences:response.preferences}:current);}
    catch(err){setError(readableError(err));}
  }
  const data=resource.data;
  return <main className="page-shell">
    <ScreenHeader title="مواقيت الصلاة" eyebrow="Africa/Tripoli" backTo="/account"/>
    {error?<div className="live-error">{error}</div>:null}
    <LiveState loading={resource.loading} error={resource.error} empty={!data}>
      {data?<><section className="prayer-settings-card"><label><span>المرجع</span><select value={data.preferences.referenceKey} onChange={(e)=>void patch({referenceKey:e.target.value})}>{data.references.map((ref)=><option value={ref.key} key={ref.key}>{ref.name}</option>)}</select></label>
        <label><span>تنبيهات الصلاة</span><input type="checkbox" checked={data.preferences.prayerAlertsEnabled} onChange={(e)=>void patch({prayerAlertsEnabled:e.target.checked})}/></label>
        <label><span>صوت تنبيه الصلاة</span><input type="checkbox" checked={data.preferences.prayerSoundEnabled} onChange={(e)=>void patch({prayerSoundEnabled:e.target.checked})}/></label>
        <label><span>التذكيرات الخفيفة</span><input type="checkbox" checked={data.preferences.gentleRemindersEnabled} onChange={(e)=>void patch({gentleRemindersEnabled:e.target.checked})}/></label>
      </section><section className="prayer-times-grid">{([['fajr','الفجر'],['sunrise','الشروق'],['dhuhr','الظهر'],['asr','العصر'],['maghrib','المغرب'],['isha','العشاء']] as const).map(([key,label])=><div key={key}><span>{label}</span><b>{data.schedule.schedule[key].localTime}</b></div>)}</section></>:null}
    </LiveState>
  </main>;
}
