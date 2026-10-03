import { ImageResponse } from 'next/og';
import { AppIcon } from '@/components/AppIcon';

// apple-touch-icon para "Añadir a pantalla de inicio" en iOS
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={180} />, size);
}
