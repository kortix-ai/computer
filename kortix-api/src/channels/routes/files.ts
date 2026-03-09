import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../shared/db';
import { sandboxes } from '@kortix/db';
import { getSupabase } from '../../shared/supabase';

const BUCKET = 'channel-files';
const filesRouter = new Hono();

filesRouter.post('/upload', async (c) => {
  const body = await c.req.json<{
    sandboxId?: string;
    fileName?: string;
    contentBase64?: string;
    mimeType?: string;
  }>();

  if (!body.sandboxId || !body.fileName || !body.contentBase64) {
    return c.json({ error: 'Missing required fields: sandboxId, fileName, contentBase64' }, 400);
  }

  const [sandbox] = await db
    .select({ sandboxId: sandboxes.sandboxId })
    .from(sandboxes)
    .where(eq(sandboxes.sandboxId, body.sandboxId))
    .limit(1);

  if (!sandbox) {
    return c.json({ error: 'Invalid sandboxId' }, 403);
  }

  try {
    const supabase = getSupabase();
    const fileBuffer = Buffer.from(body.contentBase64, 'base64');
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = `${body.sandboxId}/${uniqueId}_${body.fileName}`;
    const mimeType = body.mimeType || guessMimeType(body.fileName);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[CHANNELS FILES] Upload to Supabase Storage failed:', uploadError);
      return c.json({ error: `Storage upload failed: ${uploadError.message}` }, 500);
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    console.log(`[CHANNELS FILES] Uploaded ${body.fileName} -> ${urlData.publicUrl}`);

    return c.json({
      success: true,
      publicUrl: urlData.publicUrl,
      fileName: body.fileName,
      storagePath,
    });
  } catch (err) {
    console.error('[CHANNELS FILES] Upload error:', err);
    return c.json({ error: 'Internal upload error' }, 500);
  }
});

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimes: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
  };
  return mimes[ext] || 'application/octet-stream';
}

export { filesRouter };
