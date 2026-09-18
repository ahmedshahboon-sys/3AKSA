import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '@3aksa/api-client';

const errorText:Record<string,string>={
  NETWORK_ERROR:'ما قدرناش نوصل للسيرفر.',
  UNAUTHORIZED:'الجلسة انتهت. سجل دخول من جديد.',
  RATE_LIMITED:'طلبات كثيرة في وقت قصير. جرّب بعد شوية.',
  ROOM_NOT_FOUND:'الغرفة مش موجودة.',
  ROOM_PRIVATE:'الغرفة خاصة.',
  ROOM_BOYS_ONLY:'الغرفة هذي للأولاد فقط.',
  ROOM_GIRLS_ONLY:'الغرفة هذي للبنات فقط.',
  ROOM_BANNED:'أنت ممنوع من دخول الغرفة.',
  ROOM_FULL:'الغرفة وصلت للحد الأقصى.',
  RELATIONSHIP_BLOCKED:'التواصل بين الحسابين محظور.',
  INSUFFICIENT_BALANCE:'رصيدك ما يكفيش للعملية.',
  STORE_ITEM_NOT_FOUND:'المنتج مش موجود.',
  ITEM_NOT_PURCHASABLE:'المنتج مش متاح للشراء.',
  ALREADY_OWNED:'المنتج موجود عندك من قبل.',
  TV_CHANNEL_NOT_AVAILABLE:'القناة مش متاحة توا.',
  PRAYER_REFERENCE_NOT_FOUND:'مرجع مواقيت الصلاة مش متاح.'
};

export function readableError(error:unknown){
  if(error instanceof ApiError)return errorText[error.code]??`صار خطأ (${error.code})`;
  if(error instanceof Error)return error.message;
  return 'صار خطأ غير متوقع.';
}

export function useApiResource<T>(loader:()=>Promise<T>,deps:DependencyList=[]){
  const loaderRef=useRef(loader);
  loaderRef.current=loader;
  const [data,setData]=useState<T|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const sequence=useRef(0);

  const reload=useCallback(async()=>{
    const id=++sequence.current;
    setLoading(true);
    setError('');
    try{
      const value=await loaderRef.current();
      if(sequence.current===id)setData(value);
      return value;
    }catch(err){
      if(sequence.current===id)setError(readableError(err));
      return null;
    }finally{
      if(sequence.current===id)setLoading(false);
    }
  },[]);

  useEffect(()=>{
    void reload();
    return()=>{sequence.current+=1;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },deps);

  return {data,setData,loading,error,reload};
}
