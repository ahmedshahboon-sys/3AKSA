import type { SVGProps } from 'react';

type IconName =
  | 'home'
  | 'rooms'
  | 'nearby'
  | 'private'
  | 'account'
  | 'bell'
  | 'tv'
  | 'users'
  | 'message'
  | 'wallet'
  | 'heart'
  | 'search'
  | 'plus'
  | 'chevron'
  | 'back'
  | 'share'
  | 'more'
  | 'volume'
  | 'fullscreen'
  | 'smile'
  | 'mic'
  | 'send'
  | 'history'
  | 'store';

const paths: Record<IconName, string> = {
  home: 'M3 10.7 12 3l9 7.7v9.1a1.2 1.2 0 0 1-1.2 1.2h-5.1v-6.2H9.3V21H4.2A1.2 1.2 0 0 1 3 19.8z',
  rooms: 'M4 5.3A2.3 2.3 0 0 1 6.3 3h11.4A2.3 2.3 0 0 1 20 5.3v8.4a2.3 2.3 0 0 1-2.3 2.3H10l-4.9 4v-4.2A2.3 2.3 0 0 1 4 13.7z',
  nearby: 'M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z',
  private: 'M4 5h16v11H8l-4 3z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  tv: 'M4 6h16v11H4zM9 21h6M9 3l3 3 3-3',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6.5-.6a3 3 0 1 0 0-5.8M3 20a6 6 0 0 1 12 0m1-5a5 5 0 0 1 5 5',
  message: 'M4 5h16v11H9l-5 4z',
  wallet: 'M4 6h16v13H4zM4 9h16m-5 4h5',
  heart: 'M20.8 7.4c0 5-8.8 10.5-8.8 10.5S3.2 12.4 3.2 7.4A4.4 4.4 0 0 1 12 6a4.4 4.4 0 0 1 8.8 1.4Z',
  search: 'm20 20-4.4-4.4m2-5.1a7.1 7.1 0 1 1-14.2 0 7.1 7.1 0 0 1 14.2 0Z',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 18 6-6-6-6',
  back: 'm15 18-6-6 6-6',
  share: 'M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  volume: 'M4 10v4h4l5 4V6L8 10H4Zm12-1c1.3 1.6 1.3 4.4 0 6m2.5-9c3 3.3 3 8.7 0 12',
  fullscreen: 'M8 3H3v5m13-5h5v5M8 21H3v-5m13 5h5v-5',
  smile: 'M8 10h.01M16 10h.01M8 15c1 1.3 2.3 2 4 2s3-.7 4-2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0m-7 7v3m-4 0h8',
  send: 'm3 4 18 8-18 8 4-8-4-8Zm4 8h14',
  history: 'M4 12a8 8 0 1 0 2.3-5.7L4 8m0-4v4h4m4-1v5l3 2',
  store: 'M5 8h14l-1 13H6L5 8Zm2 0V6a5 5 0 0 1 10 0v2',
};

export function Icon({ name, size = 22, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
