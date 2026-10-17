// Photo files. Vercel Blob when BLOB_READ_WRITE_TOKEN is set, otherwise kept in memory (local testing only).
import { put, del } from '@vercel/blob';

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
export const memBlobs = new Map();

const safe = name => name.replace(/[^\w.\-() 가-힣]/g, '_');

export async function putImage(name, buf, type) {
  if (!useBlob) {
    const id = Math.random().toString(36).slice(2) + '-' + safe(name);
    memBlobs.set(id, { buf, type });
    return '/_local/blob/' + encodeURIComponent(id);
  }
  const r = await put('photos/' + safe(name), buf, { access: 'public', addRandomSuffix: true, contentType: type });
  return r.url;
}

export async function delImages(urls) {
  urls = urls.filter(Boolean);
  if (!urls.length) return;
  if (!useBlob) { for (const u of urls) memBlobs.delete(decodeURIComponent(u.split('/').pop())); return; }
  for (let i = 0; i < urls.length; i += 500) await del(urls.slice(i, i + 500));
}
