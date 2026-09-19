export type AppLanguage='ar'|'en';
const KEY='3aksa:language';
const dict={
  ar:{
    home:'الرئيسية',rooms:'الغرف',nearby:'القريبون',private:'الخاص',account:'حسابي',
    opening:'جاري فتح عكسة...',download:'تنزيل عكسة',privacy:'سياسة الخصوصية',terms:'شروط الاستخدام',
    about:'عن عكسة',support:'الدعم',language:'اللغة',arabic:'العربية',english:'English',
    deleteAccount:'حذف الحساب',profileVisibility:'ظهور الملف',everyone:'الجميع',friends:'الأصدقاء فقط'
  },
  en:{
    home:'Home',rooms:'Rooms',nearby:'Nearby',private:'Private',account:'Account',
    opening:'Opening 3AKSA...',download:'Download 3AKSA',privacy:'Privacy Policy',terms:'Terms of Service',
    about:'About 3AKSA',support:'Support',language:'Language',arabic:'العربية',english:'English',
    deleteAccount:'Delete account',profileVisibility:'Profile visibility',everyone:'Everyone',friends:'Friends only'
  }
} as const;
export function getLanguage():AppLanguage{
  try{return localStorage.getItem(KEY)==='en'?'en':'ar';}catch{return 'ar';}
}
export function setLanguage(value:AppLanguage){
  try{localStorage.setItem(KEY,value);}catch{/* best effort */}
  document.documentElement.lang=value;
  document.documentElement.dir=value==='ar'?'rtl':'ltr';
}
export function t(key:keyof typeof dict.ar,language=getLanguage()){return dict[language][key];}
