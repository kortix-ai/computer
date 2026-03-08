import { NextResponse } from 'next/server';
import { renderSharePageImage } from '@/lib/og/render-share-page-image';

// Add route segment config for caching
export const runtime = 'edge'; // Use edge runtime for better performance
export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');

  // Add error handling
  if (!title) {
    return new NextResponse('Missing title parameter', { status: 400 });
  }

  try {
    const image = await renderSharePageImage(title);

    return new NextResponse(image, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('OG Image generation error:', error);
    return new NextResponse('Error generating image', { status: 500 });
  }
}
