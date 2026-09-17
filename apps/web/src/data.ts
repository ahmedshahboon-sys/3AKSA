export type Gender = 'male' | 'female';

export type Room = {
  id: string;
  name: string;
  description: string;
  count: number;
  tv: boolean;
  kind: 'للجميع' | 'أولاد' | 'بنات';
  owner: string;
  favorite: boolean;
};

export const rooms: Room[] = [
  { id: 'tripoli-night', name: 'سهرة طرابلس', description: 'لمة خفيفة وسوالف على الجو الليبي', count: 34, tv: true, kind: 'للجميع', owner: 'محمد', favorite: true },
  { id: 'general-chat', name: 'سوالف عامة', description: 'دردشة مفتوحة من غير تعقيد', count: 21, tv: false, kind: 'للجميع', owner: 'خالد', favorite: false },
  { id: 'girls-lounge', name: 'لمة البنات', description: 'غرفة بنات فقط', count: 17, tv: false, kind: 'بنات', owner: 'سارة', favorite: false },
  { id: 'boys-corner', name: 'قعدة الشباب', description: 'سوالف يومية وخفيفة', count: 13, tv: false, kind: 'أولاد', owner: 'علي', favorite: true },
];

export const nearbyPeople = [
  { name: 'محمد', distance: '650 متر', mutual: '3 أصدقاء مشتركين', gender: 'male' as Gender },
  { name: 'سارة', distance: '1.2 كم', mutual: 'صديق مشترك', gender: 'female' as Gender },
  { name: 'خالد', distance: '2.4 كم', mutual: 'بدون أصدقاء مشتركين', gender: 'male' as Gender },
];

export const privateChats = [
  { id: 'ahmed', name: 'أحمد', preview: 'تمام، نشوفك بكرة 😄', time: 'الآن', unread: 2, voice: false },
  { id: 'rahaf', name: 'رهف', preview: 'تسجيل صوتي', time: '12 د', unread: 0, voice: true },
  { id: 'mohamed', name: 'محمد', preview: 'خش للغرفة توا', time: '1 س', unread: 0, voice: false },
];

export const transactions = [
  { label: 'شحن رصيد', amount: '+25.000 د.ل', meta: 'اليوم · 02:10', tone: 'positive' },
  { label: 'شراء ملصقات', amount: '-3.500 د.ل', meta: 'أمس · 18:42', tone: 'negative' },
  { label: 'تحويل وارد من محمد', amount: '+5.000 د.ل', meta: 'أمس · 14:05', tone: 'positive' },
  { label: 'Gift sent · وردة ذهبية', amount: '-1.250 د.ل', meta: '15 سبتمبر · 23:11', tone: 'negative' },
  { label: 'Refund', amount: '+0.750 د.ل', meta: '14 سبتمبر · 10:31', tone: 'positive' },
  { label: 'Admin adjustment', amount: '+1.000 د.ل', meta: '12 سبتمبر · 16:20', tone: 'positive' },
];

export const storeProducts = [
  { id: 'frame-neon', category: 'إطارات', name: 'إطار لايم', price: '4.500 د.ل', preview: '🟢', owned: true },
  { id: 'stickers-libya', category: 'ملصقات', name: 'ملصقات ليبية', price: '3.500 د.ل', preview: '😄', owned: false },
  { id: 'reaction-fire', category: 'تفاعلات', name: 'تفاعل النار', price: '2.000 د.ل', preview: '🔥', owned: true },
  { id: 'entry-teacher', category: 'أصوات دخول', name: 'المعلم جي', price: '5.000 د.ل', preview: '🔊', owned: false },
  { id: 'entry-thunder', category: 'أصوات دخول', name: 'رعد', price: '4.000 د.ل', preview: '⚡', owned: false },
  { id: 'cosmetic-crown', category: 'تجميلية', name: 'شارة التاج', price: '6.500 د.ل', preview: '👑', owned: false },
];

export const notifications = [
  { title: 'رسالة خاصة', body: 'أحمد بعتلك رسالة جديدة.', time: 'الآن', unread: true },
  { title: 'طلب مراسلة', body: 'عندك طلب مراسلة جديد.', time: '5 د', unread: true },
  { title: 'طلب صداقة', body: 'سالم يبي يضيفك.', time: '18 د', unread: true },
  { title: 'تم قبول الصداقة', body: 'سارة قبلت طلب الصداقة.', time: '1 س', unread: false },
  { title: 'شحن الرصيد', body: 'تمت إضافة 25.000 د.ل إلى رصيدك.', time: '2 س', unread: false },
  { title: 'هدية', body: 'استلمت هدية داخل سهرة طرابلس.', time: 'أمس', unread: false },
  { title: 'تحديث عكسة', body: 'نسخة جديدة ستكون متاحة قريبًا.', time: 'أمس', unread: false },
];
