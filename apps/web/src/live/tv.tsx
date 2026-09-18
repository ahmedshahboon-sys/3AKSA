import { useMemo, useState } from 'react';
import type { TvChannel } from '@3aksa/api-client';
import { api } from '../runtime';
import { useApiResource } from '../useApiResource';
import { ScreenHeader } from '../ui';
import { Icon } from '../icons';
import { LiveState } from './common';
import { LiveTvPlayer } from './tvPlayer';

export function LiveTvScreen(){
  const [search,setSearch]=useState('');
  const [group,setGroup]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const resource=useApiResource(async()=>{
    const response=await api.tvChannels({sort:'manual',limit:500});
    return response.channels;
  },[]);
  const groups=useMemo(()=>[...new Set((resource.data??[]).map((item)=>item.groupName).filter((value):value is string=>Boolean(value)))].toSorted((a,b)=>a.localeCompare(b,'ar')),[resource.data]);
  const visible=(resource.data??[]).filter((channel)=>(!group||channel.groupName===group)&&(!search||channel.name.includes(search)||channel.groupName?.includes(search)));
  const selected=(resource.data??[]).find((channel)=>channel.id===selectedId)??visible[0]??null;

  function choose(channel:TvChannel){setSelectedId(channel.id);}
  return (
    <main className="page-shell">
      <ScreenHeader title="التلفزيون" eyebrow="قنوات مرخصة فقط" backTo="/"/>
      {selected?<section className="tv-player"><LiveTvPlayer src={selected.streamUrl} title={selected.name}/><div className="tv-controls"><div><b>{selected.name}</b><small>{selected.groupName||'بث مباشر'}</small></div></div></section>:null}
      <label className="search-box"><Icon name="search" size={20}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="دور على قناة..."/></label>
      <div className="chips"><button className={!group?'chip active':'chip'} type="button" onClick={()=>setGroup('')}>الكل</button>{groups.map((item)=><button className={group===item?'chip active':'chip'} type="button" key={item} onClick={()=>setGroup(item)}>{item}</button>)}</div>
      <LiveState loading={resource.loading} error={resource.error} empty={!visible.length}>
        <div className="channel-list">{visible.map((channel)=><button type="button" className={selected?.id===channel.id?'active':''} key={channel.id} onClick={()=>choose(channel)}>{channel.logoUrl?<img className="channel-logo" src={channel.logoUrl} alt=""/>:<span>📺</span>}<div><b>{channel.name}</b><small>{channel.groupName||'متاحة'}</small></div></button>)}</div>
      </LiveState>
      <p className="v1-note">القنوات تظهر فقط بعد تأكيد حقوق البث من الإدارة. عكسة ما تضيفش بث غير مرخص.</p>
    </main>
  );
}
