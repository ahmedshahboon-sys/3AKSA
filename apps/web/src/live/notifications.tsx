import { useEffect, useState } from 'react';
import type { AppNotification, NotificationPreferences } from '@3aksa/api-client';
import { api, realtime } from '../runtime';
import { readableError, useApiResource } from '../useApiResource';
import { ScreenHeader } from '../ui';
import { Icon } from '../icons';
import { relativeTime, LiveState } from './common';
import { enableWebPush, webPushState } from './push';

export function LiveNotificationsScreen(){
  const [actionError,setActionError]=useState('');
  const [notice,setNotice]=useState('');
  const resource=useApiResource(async()=>{
    const [notifications,preferences,push]=await Promise.all([api.notifications(100),api.notificationPreferences(),webPushState()]);
    return {notifications:notifications.notifications,preferences:preferences.preferences,push};
  },[]);

  useEffect(()=>realtime.on('notification:new',(payload)=>{
    const notification=payload.notification as AppNotification;
    resource.setData((current)=>current?{...current,notifications:[notification,...current.notifications.filter((item)=>item.id!==notification.id)]}:current);
  }),[]);

  async function read(notification:AppNotification){
    if(notification.readAt)return;
    try{
      const response=await api.markNotificationRead(notification.id);
      resource.setData((current)=>current?{...current,notifications:current.notifications.map((item)=>item.id===notification.id?response.notification:item)}:current);
    }catch(error){setActionError(readableError(error));}
  }
  async function readAll(){
    try{await api.markAllNotificationsRead();await resource.reload();}
    catch(error){setActionError(readableError(error));}
  }
  async function toggle(key:string,value:boolean){
    try{
      const response=await api.updateNotificationPreferences({[key]:value});
      resource.setData((current)=>current?{...current,preferences:response.preferences}:current);
    }catch(error){setActionError(readableError(error));}
  }
  async function enablePush(){
    setActionError('');setNotice('');
    try{await enableWebPush();setNotice('تم تفعيل إشعارات الجهاز ✅');await resource.reload();}
    catch(error){setActionError(readableError(error));}
  }

  const prefs=resource.data?.preferences;
  return (
    <main className="page-shell">
      <ScreenHeader title="الإشعارات" eyebrow="كل الجديد" backTo="/" trailing={<button className="text-button" type="button" onClick={()=>void readAll()}>قراءة الكل</button>}/>
      {actionError?<div className="live-error">{actionError}</div>:null}{notice?<div className="success-note">{notice}</div>:null}
      <section className="notification-settings">
        <div><b>إشعارات الجهاز</b><small>{resource.data?.push.subscribed?'مفعلة على الجهاز':'غير مفعلة'}</small></div>
        <button className="secondary-button" type="button" onClick={()=>void enablePush()} disabled={!resource.data?.push.supported}>{resource.data?.push.subscribed?'إعادة الربط':'تفعيل'}</button>
      </section>
      {prefs?<NotificationPreferencePanel prefs={prefs} onToggle={toggle}/>:null}
      <LiveState loading={resource.loading} error={resource.error} empty={!resource.data?.notifications.length}>
        <div className="notification-list">{resource.data?.notifications.map((item)=>(
          <button className={item.readAt?'notification-live':'notification-live unread'} type="button" key={item.id} onClick={()=>void read(item)}>
            <span className="notification-icon"><Icon name="bell"/></span>
            <div className="grow"><b>{item.title}</b><p>{item.body}</p></div><time>{relativeTime(item.createdAt)}</time>
          </button>
        ))}</div>
      </LiveState>
    </main>
  );
}

function NotificationPreferencePanel({prefs,onToggle}:{prefs:NotificationPreferences;onToggle:(key:string,value:boolean)=>Promise<void>}){
  const rows=[
    ['muteAll','كتم كل الأصوات',prefs.sounds.muteAll],
    ['messageSounds','أصوات الرسائل',prefs.sounds.messages],
    ['uiSounds','أصوات الواجهة',prefs.sounds.interface],
    ['roomSounds','أصوات الغرف',prefs.sounds.rooms],
    ['vibration','الاهتزاز',prefs.sounds.vibration],
    ['privateMessages','تنبيه الرسائل الخاصة',prefs.categories.privateMessages],
    ['messageRequests','طلبات المراسلة',prefs.categories.messageRequests],
    ['friendRequests','طلبات الصداقة',prefs.categories.friendRequests],
    ['walletEvents','الرصيد والمشتريات',prefs.categories.walletEvents]
  ] as const;
  return <section className="preference-panel"><h3>الإعدادات</h3>{rows.map(([key,label,value])=><label key={key}><span>{label}</span><input type="checkbox" checked={value} onChange={(e)=>void onToggle(key,e.target.checked)}/></label>)}</section>;
}
