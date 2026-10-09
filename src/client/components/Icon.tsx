const PATHS: Record<string, string> = {
  grip: 'M9 5h2v2H9zM13 5h2v2h-2zM9 11h2v2H9zM13 11h2v2h-2zM9 17h2v2H9zM13 17h2v2h-2z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z',
  link: 'M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM8.5 17.6a3 3 0 0 1-4.2-4.2l2.5-2.5 1.4 1.4-2.5 2.5a1 1 0 0 0 1.4 1.4l2.5-2.5 1.4 1.4zm7-4.4-1.4-1.4 2.5-2.5a1 1 0 0 0-1.4-1.4l-2.5 2.5-1.4-1.4 2.5-2.5a3 3 0 0 1 4.2 4.2z',
  warning: 'M12 3 2 21h20zm-1 6h2v6h-2zm0 8h2v2h-2z',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  clock: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v5l4 2-1 1.7-5-2.7V7z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  copy: 'M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z',
  trash: 'M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7zm3 2v8h2v-8zm4 0v8h2v-8z',
  print: 'M7 3h10v5H7zM5 9h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2zm4 7v3h6v-3z',
  columns: 'M3 5h18v14H3zm2 2v10h4V7zm6 0v10h2V7zm4 0v10h4V7z',
  skip: 'M6 6l8 6-8 6zM16 6h2v12h-2z',
  eye: 'M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  eyeOff: 'M3.3 2 22 20.7 20.7 22l-3.4-3.4A11 11 0 0 1 12 20c-5 0-9-4.5-10-7a14 14 0 0 1 4-5.2L2 3.3zM12 4c5 0 9 4.5 10 7a14 14 0 0 1-2.6 3.9L8.1 4.6A10 10 0 0 1 12 4z',
  help: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 14a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM12 6a4 4 0 0 0-4 4h2a2 2 0 1 1 3 1.7c-1.2.7-2 1.6-2 3.3h2c0-.9.4-1.3 1-1.7A4 4 0 0 0 12 6z',
  chevronUp: 'M12 8l6 6-1.4 1.4L12 10.8l-4.6 4.6L6 14z',
  chevronDown: 'M12 16l-6-6 1.4-1.4 4.6 4.6 4.6-4.6L18 10z',
  upload: 'M11 16V7.8L8 10.8 6.6 9.4 12 4l5.4 5.4-1.4 1.4-3-3V16zM5 18h14v2H5z',
  download: 'M11 4h2v8.2l3-3 1.4 1.4L12 16l-5.4-5.4L8 9.2l3 3zM5 18h14v2H5z',
  sidebar: 'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h10V6zm12 0v12h4V6z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  logout: 'M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9zm-.5 5.5L11 10l-1 1h6v2h-6l1 1-1.5 1.5L6 12z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
