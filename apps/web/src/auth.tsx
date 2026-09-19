import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, type Gender } from '@3aksa/api-client';
import { useSession } from './session';
import { api } from './runtime';
import { getLanguage,setLanguage,type AppLanguage } from './i18n';

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
  const [language,setUiLanguage]=useState<AppLanguage>(()=>getLanguage());
  const L=(ar:string,en:string)=>language==='ar'?ar:en;
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
          <h1>{language==='ar'?'عكسة':'3AKSA'}</h1>
          <p>{L('دردشة خفيفة، غرف، خاص وأكثر.','Lightweight chat, rooms, private messages and more.')}</p>
        </div>
        <div className="language-switch" aria-label="Language">
          <button type="button" className={language==='ar'?'active':''} onClick={()=>{setLanguage('ar');setUiLanguage('ar');}}>العربية</button>
          <button type="button" className={language==='en'?'active':''} onClick={()=>{setLanguage('en');setUiLanguage('en');}}>English</button>
        </div>

        <div className="segmented auth-tabs" aria-label="الحساب">
          <button type="button" className={mode==='login'?'active':''} onClick={()=>switchMode('login')}>{L('دخول','Login')}</button>
          <button type="button" className={mode==='register'?'active':''} onClick={()=>switchMode('register')}>{L('حساب جديد','Register')}</button>
          <button type="button" className={mode==='recover'?'active':''} onClick={()=>switchMode('recover')}>{L('استرجاع','Recovery')}</button>
        </div>

        {mode!=='recover'?(
          <form className="auth-form" onSubmit={submitAuth}>
            {mode==='login'?(
              <label><span>{L('اسم المستخدم أو رقم الهاتف','Username or phone')}</span><input name="login" autoComplete="username" required /></label>
            ):(
              <>
                <label><span>{L('اسم المستخدم','Username')}</span><input name="username" autoComplete="username" minLength={3} maxLength={24} required dir="ltr" value={registrationUsername} onChange={(event)=>setRegistrationUsername(event.target.value)} /></label>
                {registrationUsername.trim().toLowerCase()==='ahmed'?(
                  <label><span>{L('رمز تفعيل المالك','Owner activation code')}</span><input name="ownerClaimCode" type="password" autoComplete="off" minLength={20} required dir="ltr" /></label>
                ):null}
                <label><span>{L('الاسم الظاهر','Display name')}</span><input name="displayName" autoComplete="name" minLength={2} maxLength={80} required /></label>
                <label><span>{L('رقم الهاتف','Phone number')}</span><input name="phone" autoComplete="tel" inputMode="tel" required dir="ltr" placeholder="+218..." /></label>
                <fieldset className="gender-picker">
                  <legend>{L('الجنس','Gender')}</legend>
                  <label><input type="radio" name="gender" value="boy" defaultChecked /> {L('ولد','Boy')} ♂</label>
                  <label><input type="radio" name="gender" value="girl" /> {L('بنت','Girl')} ♀</label>
                </fieldset>
              </>
            )}

            <label>
              <span>{L('كلمة المرور','Password')}</span>
              <div className="password-field">
                <input name="password" type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} maxLength={128} required />
                <button type="button" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?L('إخفاء','Hide'):L('إظهار','Show')}</button>
              </div>
            </label>

            {mode==='register'?(
              <label><span>{L('تأكيد كلمة المرور','Confirm password')}</span><input name="confirmPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
            ):null}

            {mode==='login'?<button className="link-button" type="button" onClick={()=>switchMode('recover')}>{L('نسيت كلمة المرور؟','Forgot password?')}</button>:null}
            {error?<div className="auth-error" role="alert">{error}</div>:null}
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy?L('جاري...','Working...'):mode==='login'?L('خش لعكسة','Open 3AKSA'):L('إنشاء الحساب','Create account')}
            </button>
          </form>
        ):(
          <>
            {!recoveryReady?(
              <form className="auth-form" onSubmit={requestRecovery}>
                <p className="muted">{L('اكتب اسم المستخدم أو رقم الهاتف. الرد ما يكشفش إذا الحساب موجود أو لا.','Enter your username or phone. The response does not reveal whether an account exists.')}</p>
                <label><span>اسم المستخدم أو رقم الهاتف</span><input name="login" autoComplete="username" required /></label>
                {error?<div className="auth-error" role="alert">{error}</div>:null}
                <button className="primary-button auth-submit" disabled={busy}>{L('إرسال طلب الاسترجاع','Send recovery request')}</button>
                <button className="secondary-button" type="button" onClick={()=>{setRecoveryReady(true);setError('');}}>{L('عندي رمز استرجاع','I have a recovery code')}</button>
              </form>
            ):(
              <form className="auth-form" onSubmit={confirmRecovery}>
                {notice?<div className="success-note" role="status">{notice}</div>:null}
                <label><span>{L('رقم طلب الاسترجاع','Recovery request ID')}</span><input name="requestId" defaultValue={recoveryRequestId} required dir="ltr" /></label>
                <label><span>{L('رمز الاسترجاع المؤقت','Temporary recovery code')}</span><input name="recoveryCode" autoComplete="one-time-code" required dir="ltr" /></label>
                <label><span>{L('كلمة المرور الجديدة','New password')}</span><input name="newPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
                <button className="link-button" type="button" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?L('إخفاء كلمة المرور','Hide password'):L('إظهار كلمة المرور','Show password')}</button>
                {error?<div className="auth-error" role="alert">{error}</div>:null}
                <button className="primary-button auth-submit" disabled={busy}>{L('تغيير كلمة المرور والدخول','Change password and sign in')}</button>
                <button className="secondary-button" type="button" onClick={()=>{setRecoveryReady(false);setNotice('');setRecoveryRequestId('');}}>{L('طلب جديد','New request')}</button>
              </form>
            )}
          </>
        )}

        <Link className="secondary-button link-reset auth-download-link" to="/download">{L('تنزيل عكسة / تثبيت PWA','Download 3AKSA / Install PWA')}</Link>
        <nav className="auth-legal-links"><Link to="/privacy">{L('الخصوصية','Privacy')}</Link><Link to="/terms">{L('الشروط','Terms')}</Link><Link to="/support">{L('الدعم','Support')}</Link></nav>
        <p className="auth-footnote">{L('الرسائل النصية والصوتية تنحذف تلقائيًا بعد 24 ساعة من إنشائها.','Text and voice messages expire 24 hours after they are created.')}</p>
      </section>
    </main>
  );
}
