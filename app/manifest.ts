import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Golden Vault | بازی تیم فروش',
    short_name: 'Golden Vault',
    description: 'بازی استراتژیک تیم فروش',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#10100e',
    theme_color: '#17120c',
    lang: 'fa',
    dir: 'rtl',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
