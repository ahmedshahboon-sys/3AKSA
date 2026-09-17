# 3AKSA — Visual & UI Master Source

هذه الوثيقة هي **المصدر البصري الرسمي المعتمد** لمشروع 3AKSA / عكسة.

أي Mockup أو صورة تصورية سابقة تخالف هذه الوثيقة تعتبر غير معتمدة.

## 1. الهوية

- الاسم العربي: **عكسة**
- الاسم الإنجليزي الرسمي: **3AKSA**
- الخط الرسمي الوحيد: **Readex Pro**
- اللوقو الأساسي: الحزمة الرسمية `3AKSA_VISUAL_SOURCE_OF_TRUTH.zip`
- اللوقو البناتي: الحزمة الرسمية `3AKSA_VISUAL_SOURCE_OF_TRUTH.zip`

ممنوع تغيير شكل الرمز أو نسبه من نفسك.

## 2. الألوان

### الهوية الأساسية
- Primary Lime: `#B8F000`
- Interaction Green: `#8FCB00`
- Secondary Blue: `#32B8FF`
- Gold: `#F5C451`

### Dark
- Background: `#111315`
- Cards: `#1A1D21`
- Elevated: `#22262B`
- Primary Text: `#F5F7FA`
- Secondary Text: `#A7AFB8`

### Light
- Background: `#F7F8FA`
- Cards: `#FFFFFF`
- Primary Text: `#171A1F`
- Secondary Text: `#6F7782`

### Pink Theme
نفس البنية والـUX تمامًا، مع استبدال ألوان الهوية الأساسية بدرجات وردية/فوشيا متناسقة مع اللوقو الوردي.

## 3. فلسفة الواجهة

3AKSA يجب أن يبدو:
- خفيف.
- شبابي.
- حديث.
- واضح.
- Mobile First.
- سريع على الأجهزة الضعيفة.
- غير مزدحم.

لا نحول التطبيق إلى شبكة اجتماعية ثقيلة.

## 4. Bottom Navigation الرسمي

الترتيب الرسمي الثابت:

1. الرئيسية
2. الغرف
3. القريبون
4. الخاص
5. حسابي

التلفزيون **ليس** Tab رئيسيًا في Bottom Navigation.
يدخل من الرئيسية أو من داخل الغرفة عند تفعيله.

## 5. الصفحة الرئيسية

الترتيب المقترح المعتمد:
- Header: لوقو 3AKSA + جرس إشعارات.
- بطاقة ترحيب بالمستخدم.
- الغرف النشطة الآن.
- الأصدقاء Online.
- بطاقة التلفزيون.
- الطلبات الجديدة: طلبات صداقة + طلبات مراسلة.
- إعلان خفيف إن وجد.
- الصلاة القادمة.
- عدادات عامة: Online الآن + المسجلون + الزوار حسب التصميم النهائي.

لا تجعل الصفحة الرئيسية Feed.

## 6. صفحة الغرف

أعلى الصفحة:
- عنوان "الغرف".
- زر + إنشاء غرفة.
- Search.

Filters:
- الكل.
- للجميع.
- أولاد.
- بنات.
- المفضلة.

Sorting:
- أبجدي.
- الأكثر ناس الآن.
- الأكثر نشاطًا.
- الأحدث.

Card الغرفة تعرض:
- اسم الغرفة.
- وصف قصير.
- نوع الغرفة.
- عدد الموجودين الآن.
- TV badge إن كان مفعلًا.
- المسؤول.
- Favorite button.

لا تستخدم صور ضخمة للغرف كشرط أساسي؛ الأولوية للسرعة والخفة.

## 7. داخل الغرفة

Header:
- رجوع.
- اسم الغرفة.
- عدد الموجودين.
- Favorite.
- Share.
- More.

إذا TV مفعّل:
- Player خفيف أعلى الشات.
- اسم القناة.
- Mute/Volume.
- Fullscreen.
- يمكن تصغيره.

داخل الشات:
- Avatar صغير.
- Display Name.
- Online indicator.
- Gender indicator.
- Owner/Moderator badge عند الحاجة.
- Bubble خفيفة.
- Timestamp.

رسائل النظام: دخول، خروج، Kick/Ban عند الحاجة، Gift event.

Composer:
- زر Stickers/Reactions.
- Text field.
- Voice Note mic.
- Send.

## 8. Chat V1

المسموح:
- Text.
- Voice Notes.
- Stickers.
- Free Reactions.
- Premium Reactions.
- Paid Gifts.

الممنوع في V1:
- إرسال صور.
- إرسال فيديو.
- مكالمات صوت.
- مكالمات فيديو.
- Voice Rooms.
- ملفات عشوائية.

رمز المايك مسموح فقط لتسجيل **Voice Note**.
رمز Speaker/Volume مسموح فقط داخل **مشغل التلفزيون** أو إعدادات الصوت، وليس كميزة مكالمة.

## 9. صفحة القريبون

Header: "القريبون" + حالة إذن الموقع.

Filters: الكل، أولاد، بنات.

كل Card:
- Avatar.
- Display Name.
- Gender.
- Approximate Distance.
- Mutual Friends.
- Online status.
- إضافة صديق.
- مراسلة.
- More: حظر / إبلاغ.

المستخدم العادي لا يرى Coordinates أو Map أو Exact Location.

## 10. الخاص

Tabs: المحادثات، طلبات المراسلة.

List item:
- Avatar.
- Name.
- Last message preview.
- Time.
- Unread badge.
- Voice Note indicator عند الحاجة.

داخل المحادثة: Text، Voice Notes، Stickers، Reactions، Gifts.

ممنوع: كاميرا، صور، Video Call button، Voice Call button.

## 11. حسابي

Header: Avatar، Display Name، Gender، Online، Status text اختياري، Edit profile.

ثم: الرصيد، شحن، تحويل، سجل العمليات.

Sections:
- الأصدقاء.
- طلبات الصداقة.
- المحظورون.
- المتجر.
- مشترياتي.
- الإطارات.
- الأصوات.
- التفاعلات.
- الملصقات.
- الثيم.
- اللغة.
- الأصوات والاهتزاز.
- الإشعارات.
- الخصوصية.
- الأجهزة.
- الدعم/حول.

## 12. الرصيد والمتجر

الرصيد يعرض: شحن، تحويل، السجل.
السجل يدعم شحن، شراء، تحويل صادر/وارد، Gift sent، Gift received share، Refund، Admin adjustment.

المتجر ديناميكي ويعرض مميز، إطارات، ملصقات، تفاعلات، أصوات دخول، عناصر تجميلية.

## 13. Entry Sounds / Gifts / Reactions

Entry Sounds تعمل فقط عند الشراء والتفعيل والسماح بها من الغرفة وعدم كتمها واحترام Cooldown.

Press/Long Press على الرسالة يفتح Bottom Sheet بالتسلسل:
1. Free reactions.
2. Premium reactions المملوكة.
3. Gifts المدفوعة.

Gift event يظهر خفيفًا في الشات ولا يغطي المحتوى.

## 14. التلفزيون والصلاة والإشعارات

التلفزيون قسم مستقل من الرئيسية، ويمكن أن يظهر Player أعلى الشات داخل الغرفة عند تفعيله.

الصلاة Toast صغير غير مزعج تقريبًا 3 ثوانٍ ولا يغطي Composer.

Notification Center يشمل Private message، Message request، Friend request، Friend accepted، Recharge، Purchase، Transfer، Gift، Admin alert، App update.

## 15. Responsive / Safe Area

إجباري احترام Android Status Bar، Android Navigation Buttons، Gesture Area، iPhone Notch، Home Indicator، Browser Bars، Keyboard.

Bottom Navigation لا يدخل تحت System UI، وComposer لا يختفي خلف Keyboard. استخدم dynamic viewport مثل `100dvh`.

## 16. Future Media

مستقبلًا فقط، وغير ظاهر في V1:
- Voice Rooms.
- Voice Calls.
- Video Calls.
- Social Live Streaming.

يجب أن تكون البنية جاهزة لها، لكن لا تظهر في الواجهة الحالية.

## 17. شكل المكونات

- Corner radius ناعم وغير مبالغ.
- Buttons Rounded.
- Cards واضحة وخفيفة.
- Shadows خفيفة.
- Neon Glow محدود جدًا.
- Icons موحدة وحديثة.
- Badges صغيرة وواضحة.
- Animations سريعة وخفيفة.

## 18. قاعدة نهائية

إذا اختلف أي Mockup أو اقتراح UI مستقبلي مع هذه الوثيقة: **هذه الوثيقة هي المرجع الأساسي حتى يصدر تعديل معتمد من صاحب المشروع.**
