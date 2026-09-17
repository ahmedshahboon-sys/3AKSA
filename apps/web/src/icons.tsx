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
  | 'chevron';

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
};

export function Icon({ name, size = 22, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
