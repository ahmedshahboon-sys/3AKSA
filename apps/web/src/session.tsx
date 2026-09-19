import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, type AuthSession, type AuthUser, type Gender } from '@3aksa/api-client';
import {
  api,getAccessToken,getCachedUser,getInstallationId,getPlatform,realtime,
  setAccessToken,setCachedUser
} from './runtime';

type SessionStatus='loading'|'authenticated'|'anonymous';

type SessionContextValue={
  status:SessionStatus;
  user:AuthUser|null;
  offline:boolean;
  login:(input:{login:string;password:string})=>Promise<void>;
  register:(input:{
    username:string;displayName:string;phone:string;gender:Gender;password:string;
  })=>Promise<void>;
  logout:()=>Promise<void>;
  refresh:()=>Promise<void>;
};

const SessionContext=createContext<SessionContextValue|null>(null);

function saveSession(session:AuthSession){
  setAccessToken(session.accessToken);
  setCachedUser(session.user);
  realtime.refreshAuth();
}

export function SessionProvider({children}:{children:ReactNode}){
  const [status,setStatus]=useState<SessionStatus>('loading');
  const [user,setUser]=useState<AuthUser|null>(()=>getCachedUser<AuthUser>());
  const [offline,setOffline]=useState(false);

  const clear=useCallback(()=>{
    setAccessToken(null);
    setCachedUser(null);
    realtime.disconnect();
    setUser(null);
    setOffline(false);
    setStatus('anonymous');
  },[]);

  const refresh=useCallback(async()=>{
    const token=getAccessToken();
    if(!token){
      clear();
      return;
    }
    try{
      const response=await api.me();
      setUser(response.user);
      setCachedUser(response.user);
      setOffline(false);
      setStatus('authenticated');
      realtime.connect();
    }catch(error){
      if(error instanceof ApiError && error.code==='NETWORK_ERROR' && getCachedUser<AuthUser>()){
        setUser(getCachedUser<AuthUser>());
        setOffline(true);
        setStatus('authenticated');
        return;
      }
      clear();
    }
  },[clear]);

  useEffect(()=>{void refresh();},[refresh]);

  const login=useCallback(async(input:{login:string;password:string})=>{
    const session=await api.login({
      ...input,
      deviceId:getInstallationId(),
      platform:getPlatform()
    });
    saveSession(session);
    setUser(session.user);
    setOffline(false);
    setStatus('authenticated');
  },[]);

  const register=useCallback(async(input:{
    username:string;displayName:string;phone:string;gender:Gender;password:string;
  })=>{
    const session=await api.register({
      ...input,
      deviceId:getInstallationId(),
      platform:getPlatform()
    });
    saveSession(session);
    setUser(session.user);
    setOffline(false);
    setStatus('authenticated');
  },[]);

  const logout=useCallback(async()=>{
    try{await api.logout();}catch{/* local logout must still succeed */}
    clear();
  },[clear]);

  const value=useMemo<SessionContextValue>(()=>({
    status,user,offline,login,register,logout,refresh
  }),[status,user,offline,login,register,logout,refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(){
  const value=useContext(SessionContext);
  if(!value)throw new Error('useSession must be used inside SessionProvider');
  return value;
}
