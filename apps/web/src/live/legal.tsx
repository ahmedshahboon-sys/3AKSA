import {Link} from 'react-router-dom';
import {getLanguage,t} from '../i18n';

type Kind='privacy'|'terms'|'about'|'support';

const copy={
  ar:{
    privacy:{
      title:'سياسة الخصوصية',
      body:[
        'عكسة منصة دردشة نصية وصوتية. نجمع أقل قدر من البيانات اللازمة لتشغيل الحساب، الأمان، الرسائل المؤقتة، الإشعارات والميزات التي تختار تفعيلها.',
        'ميزة «القريبون» اختيارية. لا نستخدم موقعك لهذه الميزة إلا بعد تفعيلها ومنح إذن الموقع، ويظهر للمستخدمين الآخرين تقدير للمسافة فقط وليس الإحداثيات الخام.',
        'الرسائل النصية والصوتية مؤقتة وتُحذف بعد 24 ساعة من وقت إنشاء كل رسالة. ملفات الصوت المرتبطة بها تدخل ضمن نفس سياسة الحذف.',
        'Telemetry التقني، إذا كان مفعّلًا، يقتصر على معلومات مثل نوع الخطأ، المسار، إصدار التطبيق، المنصة والوقت. لا نسجل محتوى الرسائل أو الصوت أو كلمات المرور أو التوكنات أو الهاتف الكامل أو الموقع الدقيق ضمن Telemetry.',
        'يمكنك التحكم في Nearby والإشعارات والأصوات والظهور، ويمكنك حذف حسابك من الإعدادات. عند الحذف تُلغى الجلسات ويظل اسم المستخدم محجوزًا وفق سياسة المنصة.'
      ]
    },
    terms:{
      title:'شروط الاستخدام',
      body:[
        'باستخدام عكسة توافق على عدم استخدام المنصة للسبام أو التحرش أو انتحال الشخصية أو المحتوى غير المناسب أو إساءة استخدام الأنظمة المالية.',
        'الرسائل مؤقتة بطبيعتها، لذلك لا تعتمد على عكسة كوسيلة أرشفة أو تخزين دائم.',
        'العناصر المدفوعة والرصيد داخل المنصة تخضع لسجل مالي داخلي، ويجب ألا تحاول تكرار الطلبات أو استغلال أخطاء الدفع أو الرصيد.',
        'يجوز تقييد أو حظر الحساب عند إساءة الاستخدام أو محاولة تجاوز الحماية. أسماء المستخدمين المحذوفة أو المحظورة قد تبقى محجوزة.'
      ]
    },
    about:{
      title:'عن عكسة',
      body:[
        'عكسة — 3AKSA منصة اجتماعية خفيفة للرسائل النصية والصوتية والغرف والتواصل الخاص.',
        'التصميم الأساسي عربي، مع دعم الإنجليزية، والهدف أن تبقى التجربة خفيفة وسريعة على الويب وPWA وAndroid.',
        'لا تعتمد المنصة على الصور أو الفيديو داخل المحادثات الأساسية؛ التركيز على النص والصوت والتفاعل الاجتماعي.'
      ]
    },
    support:{
      title:'الدعم',
      body:[
        'لو واجهتك مشكلة في الدخول أو الاسترجاع أو الجهاز أو الرصيد أو البلاغات، استخدم أدوات الاسترجاع والإبلاغ داخل التطبيق أولًا.',
        'لا تشارك كلمة المرور أو رموز الاسترجاع أو رموز MFA مع أي شخص. الدعم الحقيقي لا يحتاج منك إرسال كلمة مرورك.'
      ]
    }
  },
  en:{
    privacy:{
      title:'Privacy Policy',
      body:[
        '3AKSA is a text and voice social chat platform. We collect only the data needed to run accounts, security, temporary messaging, notifications, and features you choose to enable.',
        'Nearby is optional. Location is used for Nearby only after you enable the feature and grant permission. Other users receive an approximate distance, not your raw coordinates.',
        'Text and voice messages are temporary and expire 24 hours after each message is created. Associated voice files follow the same retention rule.',
        'When technical telemetry is enabled, it is limited to details such as error type, route, app version, platform, and timestamp. Message content, voice data, passwords, tokens, full phone numbers, and exact location are not recorded in telemetry.',
        'You can control Nearby, notifications, sounds, and visibility, and you can delete your account from settings. Deletion revokes sessions while the username remains reserved under platform policy.'
      ]
    },
    terms:{
      title:'Terms of Service',
      body:[
        'By using 3AKSA you agree not to use the service for spam, harassment, impersonation, inappropriate content, or abuse of financial features.',
        'Messages are intentionally temporary, so 3AKSA should not be treated as permanent storage or an archive.',
        'Paid items and wallet activity use an internal ledger. Attempts to duplicate requests or exploit balance/payment errors are prohibited.',
        'Accounts may be restricted for abuse or attempts to bypass protections. Deleted or banned usernames may remain reserved.'
      ]
    },
    about:{
      title:'About 3AKSA',
      body:[
        '3AKSA is a lightweight social platform for text, voice messages, rooms, and private conversations.',
        'Arabic is the primary experience with English support, and the product is designed to stay lightweight across Web, PWA, and Android.',
        'Core chat does not depend on image or video uploads; the focus is text, voice, and social interaction.'
      ]
    },
    support:{
      title:'Support',
      body:[
        'For sign-in, recovery, device, wallet, or safety issues, use the in-app recovery and reporting tools first.',
        'Never share your password, recovery code, or MFA code. Legitimate support does not need your password.'
      ]
    }
  }
} as const;

export function PublicLegalScreen({kind}:{kind:Kind}){
  const language=getLanguage();
  const page=copy[language][kind];
  return <main className="legal-page">
    <section className="legal-card">
      <Link className="secondary-button link-reset" to="/">3AKSA</Link>
      <p className="eyebrow">3AKSA · عكسة</p>
      <h1>{page.title}</h1>
      <div className="legal-copy">{page.body.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
      <nav className="legal-links">
        <Link to="/privacy">{t('privacy',language)}</Link>
        <Link to="/terms">{t('terms',language)}</Link>
        <Link to="/about">{t('about',language)}</Link>
        <Link to="/support">{t('support',language)}</Link>
        <Link to="/download">{t('download',language)}</Link>
      </nav>
    </section>
  </main>;
}
