import { ImageResponse } from 'next/og';
import { createElement } from 'react';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> }
) {
  const { size: requested } = await context.params;
  if (requested !== '192' && requested !== '512') {
    return new Response('Icon size not found', { status: 404 });
  }
  const size = Number(requested);
  const label = createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
    createElement('span', { style: { fontSize: size * .50, lineHeight: 1 } }, '♛'),
    createElement('span', { style: { fontSize: size * .082, fontWeight: 800, letterSpacing: 1 } }, 'GOLDEN'),
    createElement('span', { style: { fontSize: size * .085, fontWeight: 800, letterSpacing: 1 } }, 'VAULT')
  );
  const icon = createElement(
    'div',
    { style: {
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%', height: '100%',
      background: 'linear-gradient(145deg, #352414, #11100e 75%)',
      color: '#eac477', borderRadius: size * .18,
      border: Math.round(size * .03) + 'px solid #926c34'
    } },
    label
  );
  return new ImageResponse(icon, { width: size, height: size });
}
