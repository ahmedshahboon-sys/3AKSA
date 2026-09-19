import { useState, type FormEvent } from 'react';
import { ApiError, type Gender } from '@3aksa/api-client';
import { useSession } from './session';

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
  WEAK_PASSWORD:'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل مع حروف وأرقام.',
  RATE_LIMITED:'محاولات كثيرة. جرّب بعد شوية.',
  NETWORK_ERROR:'ما قدرناش نوصل للسيرفر. تأكد من النت وجرب مرة ثانية.'
};

function message(error:unknown){
  if(error instanceof ApiError)return errorText[error.code] ?? `تعذر إكمال العملية (${error.code}).`;
  return 'صار خطأ غير متوقع. جرّب مرة ثانية.';
}

export function AuthScreen(){
  const {login,register}=useSession();
  const [mode,setMode]=useState<'login'|'register'>('login');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const [registrationUsername,setRegistrationUsername]=useState('');

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setError('');
    const form=new FormData(event.currentTarget);
    const password=String(form.get('password')??'');
    setBusy(true);
    try{
      if(mode==='login'){
        await login({
          login:String(form.get('login')??'').trim(),
          password
        });
      }else{
        const confirm=String(form.get('confirmPassword')??'');
        if(password!==confirm){
          setError('كلمتا المرور مش نفس بعض.');
          return;
        }
        await register({
          username:String(form.get('username')??'').trim(),
          displayName:String(form.get('displayName')??'').trim(),
          phone:String(form.get('phone')??'').trim(),
          gender:String(form.get('gender')??'boy') as Gender,
          password,
          ownerClaimCode:String(form.get('ownerClaimCode')??'').trim() || undefined
        });
      }
    }catch(err){
      setError(message(err));
    }finally{
      setBusy(false);
    }
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

        <div className="segmented auth-tabs">
          <button type="button" className={mode==='login'?'active':''} onClick={()=>{setMode('login');setError('');}}>دخول</button>
          <button type="button" className={mode==='register'?'active':''} onClick={()=>{setMode('register');setError('');}}>حساب جديد</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode==='login' ? (
            <label><span>اسم المستخدم أو رقم الهاتف</span><input name="login" autoComplete="username" required /></label>
          ) : (
            <>
              <label><span>اسم المستخدم</span><input name="username" autoComplete="username" minLength={3} maxLength={32} required dir="ltr" value={registrationUsername} onChange={(event)=>setRegistrationUsername(event.target.value)} /></label>
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
              <input name="password" type={showPassword?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} required />
              <button type="button" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?'إخفاء':'إظهار'}</button>
            </div>
          </label>

          {mode==='register'?(
            <label><span>تأكيد كلمة المرور</span><input name="confirmPassword" type={showPassword?'text':'password'} autoComplete="new-password" minLength={8} required /></label>
          ):null}

          {error?<div className="auth-error" role="alert">{error}</div>:null}
          <button className="primary-button auth-submit" disabled={busy} type="submit">
            {busy?'جاري...':mode==='login'?'خش لعكسة':'إنشاء الحساب'}
          </button>
        </form>

        <p className="auth-footnote">الرسائل النصية والصوتية تنحذف تلقائيًا بعد 24 ساعة من إنشائها.</p>
      </section>
    </main>
  );
}
