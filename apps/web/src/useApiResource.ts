import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError } from '@3aksa/api-client';

const errorText:Record<string,string>={
  NETWORK_ERROR:'ما قدرناش نوصل للسيرفر.',
  UNAUTHORIZED:'الجلسة انتهت. سجل دخول من جديد.',
  RATE_LIMITED:'طلبات كثيرة في وقت قصير. جرّب بعد شوية.',
  INVALID_USERNAME:'اسم المستخدم لازم يكون من 3 إلى 24 حرف/رقم ويقبل . _ - فقط.',
  INVALID_DISPLAY_NAME:'الاسم الظاهر لازم يكون بين حرفين و80 حرف.',
  INVALID_PHONE:'رقم الهاتف غير صالح.',
  INVALID_GENDER:'اختار الجنس قبل إنشاء الحساب.',
  WEAK_PASSWORD:'كلمة المرور لازم تكون 8 أحرف على الأقل.',
  USERNAME_RESERVED:'اسم المستخدم هذا محجوز. اختار اسم ثاني.',
  USERNAME_TAKEN:'اسم المستخدم مستخدم من قبل.',
  PHONE_TAKEN:'رقم الهاتف مربوط بحساب من قبل.',
  DEVICE_BLOCKED:'الجهاز هذا محظور من إنشاء حسابات.',
  REGISTRATION_FAILED:'صار خطأ أثناء إنشاء الحساب. جرّب مرة ثانية.',
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
  PRAYER_REFERENCE_NOT_FOUND:'مرجع مواقيت الصلاة مش متاح.',
  CONVERSATION_NOT_FOUND:'المحادثة مش موجودة.',
  MESSAGE_SEND_FAILED:'تعذر إرسال الرسالة.',
  PRIVATE_MESSAGE_SEND_FAILED:'تعذر إرسال الرسالة الخاصة.',
  PRIVATE_VOICE_SEND_FAILED:'تعذر إرسال التسجيل.',
  VOICE_SEND_FAILED:'تعذر إرسال التسجيل.',
  REALTIME_ERROR:'الاتصال المباشر بالسيرفر انقطع. جرّب مرة ثانية.',
  REALTIME_TIMEOUT:'السيرفر تأخر في الرد. جرّب مرة ثانية.',
  GEOLOCATION_DENIED:'تعذر الوصول للموقع. راجع إذن الموقع في الجهاز.',
  PUSH_NOT_SUPPORTED:'الجهاز أو المتصفح ما يدعمش Push.',
  WEB_PUSH_NOT_CONFIGURED:'إشعارات Push مش مفعلة على السيرفر توا.',
  PUSH_PERMISSION_DENIED:'لازم تسمح بالإشعارات من إعدادات الجهاز أو المتصفح.'
};

export function readableError(error:unknown){
  if(error instanceof ApiError)return errorText[error.code]??`صار خطأ (${error.code})`;
  if(error instanceof Error)return errorText[error.message]??error.message;
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
    const handleOnline=()=>void reload();
    window.addEventListener('online',handleOnline);
    return()=>{
      window.removeEventListener('online',handleOnline);
      sequence.current+=1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },deps);

  return {data,setData,loading,error,reload};
}
