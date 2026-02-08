
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type ImageRouteContext = {
  params: {
    path: string[];
  };
};

export async function GET(_req: NextRequest, context: ImageRouteContext) {
  const segments = context.params.path;
  const filePath = path.join(process.cwd(), 'public', 'images', ...segments);
  if (!fs.existsSync(filePath)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  const contentType = (mimeMap as Record<string, string>)[ext] ?? 'application/octet-stream';
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      'X-From': 'api-images'
    }
  });
}
