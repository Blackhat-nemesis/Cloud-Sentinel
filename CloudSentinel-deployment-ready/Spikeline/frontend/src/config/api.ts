const configuredApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const socketUrl = configuredApiUrl.replace(/\/$/, '');

export const apiUrl = (path: string) => `${socketUrl}${path.startsWith('/') ? path : `/${path}`}`;
