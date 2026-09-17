export const brand = {
  arabicName: 'عكسة',
  englishName: '3AKSA',
  fontFamily: 'Readex Pro',
} as const;

export const colors = {
  primaryLime: '#B8F000',
  interactionGreen: '#8FCB00',
  secondaryBlue: '#32B8FF',
  gold: '#F5C451',
  dark: {
    background: '#111315',
    card: '#1A1D21',
    elevated: '#22262B',
    textPrimary: '#F5F7FA',
    textSecondary: '#A7AFB8',
  },
  light: {
    background: '#F7F8FA',
    card: '#FFFFFF',
    textPrimary: '#171A1F',
    textSecondary: '#6F7782',
  },
} as const;

export const bottomNavigation = [
  'الرئيسية',
  'الغرف',
  'القريبون',
  'الخاص',
  'حسابي',
] as const;

export const chatV1 = {
  allowed: [
    'Text',
    'Voice Notes',
    'Stickers',
    'Free Reactions',
    'Premium Reactions',
    'Paid Gifts',
  ],
  forbidden: [
    'Images',
    'Video messages',
    'Voice calls',
    'Video calls',
    'Voice rooms',
    'Arbitrary file sharing',
  ],
} as const;

export type BottomNavigationLabel = (typeof bottomNavigation)[number];
export type ChatV1AllowedFeature = (typeof chatV1.allowed)[number];
export type ChatV1ForbiddenFeature = (typeof chatV1.forbidden)[number];
