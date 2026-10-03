import { ImageResponse } from 'next/og';
import { AppIcon } from '@/components/AppIcon';

// Íconos PNG del manifest generados en el build (sin binarios en el repo)
const SIZES = [192, 512];

export const dynamic = 'force-static';
export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const requested = Number((await params).size);
  const px = SIZES.includes(requested) ? requested : 512;
  return new ImageResponse(<AppIcon size={px} />, { width: px, height: px });
}
