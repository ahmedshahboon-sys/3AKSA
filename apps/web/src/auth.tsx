import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, type Gender } from '@3aksa/api-client';
import { useSession } from './session';
import { api } from './runtime';

const errorText:Record<string,string>={
  INVALID_CREDENTIALS:'اسم المستخدم/الرقم أو كلمة المرور مش صحيحة.',
  ACCOUNT_UNAVAILABLE:'الحساب غير متاح.',
  DEVICE_BLOCKED:'الجهاز هذا ممنوع من إنشاء أو استخدام حساب.',
  INVALID_USERNAME:'اسم المستخدم غير صالح.',
  USERNAME_TAKEN:'اسم المستخدم مستخدم من قبل.',
  USERNAME_RESERVED:'اسم المستخدم هذا محجوز.',
  OWNER_CLAIM_INVALID:'رمز تفعيل المالك غير صحيح.',
  OWNER_CLAIM_UNAVAILABLE:'تفعيل حساب المالك غير مجهز على السيرفر حالياً.',
  INVALID_DISPLAY_NAME:'الاسم لازم يكون بين حرفين و80 حرف.',
  INVALID_PHONE:'رقم الهاتف غير صالح.',
  PHONE_TAKEN:'رقم الهاتف مربوط بحساب ثاني.',
  INVALID_GENDER:'اختار ولد أو بنت.',
  WEAK_PASSWORD:'كلمة المرور لازم تكون من 8 إلى 128 حرف وتحتوي حرف ورقم على الأقل.',
  INVALID_RECOVERY:'رمز أو طلب الاسترجاع غير صالح أو انتهت صلاحيته.',
  RATE_LIMITED:'محاولات كثيرة. جرّب بعد شوية.',
  NETWORK_ERROR:'ما قدرناش نوصل للسيرفر. تأكد من النت وجرب مرة ثانية.'
};

function message(error:unknown){
  if(error instanceof ApiError)return errorText[error.code] ?? `تعذر إكمال العملية (${error.code}).`;
  return 'صار خطأ غير متوقع. جرّب مرة ثانية.';
}

export function AuthScreen(){
  const {login,register,recover}=useSession();
  const [mode,setMode]=useState<'login'|'register'|'recover'>('login');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [registrationUsername,setRegistrationUsername]=useState('');
  const [recoveryReady,setRecoveryReady]=useState(false);
  const [recoveryRequestId,setRecoveryRequestId]=useState('');

  function switchMode(next:typeof mode){
    setMode(next);setError('');setNotice('');
  }

  async function submitAuth(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const password=String(form.get('password')??'');
    setBusy(true);
    try{
      if(mode==='login'){
        await login({login:String(form.get('login')??'').trim(),password});
      }else{
        const confirm=String(form.get('confirmPassword')??'');
        if(password!==confirm){setError('كلمتا المرور مش نفس بعض.');return;}
        const ownerClaimCode=String(form.get('ownerClaimCode')??'').trim();
        await register({
          username:String(form.get('username')??'').trim(),
          displayName:String(form.get('displayName')??'').trim(),
          phone:String(form.get('phone')??'').trim(),
          gender:String(form.get('gender')??'boy') as Gender,
          password,
          ...(ownerClaimCode?{ownerClaimCode}:{})
        });
      }
    }catch(err){setError(message(err));}
    finally{setBusy(false);}
  }

  async function requestRecovery(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    try{
      const response=await api.requestPasswordRecovery(String(form.get('login')??'').trim());
      setRecoveryRequestId(response.requestId);
      setRecoveryReady(true);
      setNotice('تم تسجيل الطلب. لو الحساب موجود، الدعم يقدر يراجع الطلب ويعطيك رمز استرجاع مؤقت.');
    }catch(err){setError(message(err));}
    finally{setBusy(false);}
  }

  async function confirmRecovery(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError('');setNotice('');
    const form=new FormData(event.currentTarget);
    const newPassword=String(form.get('newPassword')??'');
    const confirm=String(form.get('confirmPassword')??'');
    if(newPassword!==confirm){setBusy(false);setError('كلمتا المرور مش نفس بعض.');return;}
    try{
      await recover({
        requestId:String(form.get('requestId')??'').trim(),
        recoveryCode:String(form.get('recoveryCode')??'').trim(),
        newPassword
      });
    }catch(err){setError(message(err));}
    finally{setBusy(false);}
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <img className="auth-logo" src={`${import.meta.env.BASE_URL}icons/logo-main-192.png`} alt="عكسة" />
        <div className="auth-heading">
          <span>3AKSA</span>
          <h1>عكسة</h1>
          <p>دردشة خفيفة، غرف، خاص وأكثر.</p>
        </div>

        <div className="segmented auth-tabs" aria-label="الحساب">
          <button type="button" className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>دخول</button>
          <button type="button" className={mode==='register'?'active':''} onClick={()=>switchMode('register')}>حساب جديد</button>
          <button type="button" className={mode==='recover'?'active':''} onClick={()=>switchMode('recover')}>استرجاع</button>
        </div>

        {mode!=='recover'?(
          <form className="auth-form" onSubmit={submitAuth}>
            {mode==='login'?(
              <label><span>اسم المستخدم أو رقم الهاتف</span><input name="login" autoComplete="username" required /></label>
            ):(
              <>
                <label><span>اسم المستخدم</span><input name="username" autoComplete="username" minLength={3} maxLength={24} required dir="ltr" value={registrationUsername} onChange={(event)=>setRegistrationUsername(event.target.value)} /></label>
                {registrationUsername.trim().toLowerCase()==='ahmed'?(
                  <label><span>رمز تفعيل المالك</span><input name="ownerClaimCode" type="password" autoComplete="off" minLength={20} required dir="ltr" /></label>
                ):null}
                <label><span>الاسم الظاهر</span><input name="displayName" autoComplete="name" minLength={2} maxLength={80} required /></label>
                <label><span>رقم الهاتف</span><input name="phone" autoComplete="tel" inputMode="tel" required dir="ltr" placeholder="+218..." /></label>
                <fieldset className="gender-picker">
                  <legend>الجنس</legend>
                  <label><input type="radio" name="gender" value="boy" defaultChecked /> ولد ♂</label>
                  <label><input type="radio" name="gender" value="girl" /> بنت ♀</label>
                </fieldset>
              </>
            )}

            <label>
              <span>كلمة المرور</span>
              <div className="password-field">
                <input name="password" type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} maxLength={128} required />
                <button type="button" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?'إخفاء':'إظهار'}</button>
              </div>
            </label>

            {mode==='register'?(
              <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
            ):null}

            {mode==='login'?<button className="link-button" type="button" onClick={()=>switchMode('recover')}>نسيت كلمة المرور؟</button>:null}
            {error?<div className="auth-error" role="alert">{error}</div>:null}
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy?'جاري...':mode==='login'?'خش لعكسة':'إنشاء الحساب'}
            </button>
          </form>
        ):(
          <>
            {!recoveryReady?(
              <form className="auth-form" onSubmit={requestRecovery}>
                <p className="muted">اكتب اسم المستخدم أو رقم الهاتف. الرد ما يكشفش إذا الحساب موجود أو لا.</p>
                <label><span>اسم المستخدم أو رقم الهاتف</span><input name="login" autoComplete="username" required /></label>
                {error?<div className="auth-error" role="alert">{error}</div>:null}
                <button className="primary-button auth-submit" disabled={busy}>إرسال طلب الاسترجاع</button>
                <button className="secondary-button" type="button" onClick={()=>{setRecoveryReady(true);setError('');}}>عندي رمز استرجاع</button>
              </form>
            ):(
              <form className="auth-form" onSubmit={confirmRecovery}>
                {notice?<div className="success-note" role="status">{notice}</div>:null}
                <label><span>رقم طلب الاسترجاع</span><input name="requestId" defaultValue={recoveryRequestId} required dir="ltr" /></label>
                <label><span>رمز الاسترجاع المؤقت</span><input name="recoveryCode" autoComplete="one-time-code" required dir="ltr" /></label>
                <label><span>كلمة المرور الجديدة</span><input name="newPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                <button className="link-button" type="button" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?'إخفاء كلمة المرور':'إظهار كلمة المرور'}</button>
                {error?<div className="auth-error" role="alert">{error}</div>:null}
                <button className="primary-button auth-submit" disabled={busy}>تغيير كلمة المرور والدخول</button>
                <button className="secondary-button" type="button" onClick={()=>{setRecoveryReady(false);setNotice('');setRecoveryRequestId('');}}>طلب جديد</button>
              </form>
            )}
          </>
        )}

        <Link className="secondary-button link-reset auth-download-link" to="/download">تنزيل عكسة / تثبيت PWA</Link>\n        <p className="auth-footnote">الرسائل النصية والصوتية تنحذف تلقائيًا بعد 24 ساعة من إنشائها.</p>
      </section>
    </main>
  );
}
