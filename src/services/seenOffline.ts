import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { escapeSeenHtml } from '../utils/seenMenu';
import { orderedChapters, seenId, seenMediaSource } from '../utils/seenPresentation';
import { resolveMediaUrl } from './api';
import type { Seen } from '../types';

/** Owner-only export: does not change the public download permission or call the gated PDF endpoint. */
export async function saveOwnSeenOffline(item: Seen) {
  const chapters = (await Promise.all(orderedChapters(item).map(async (chapter) => `<section><h2>${escapeSeenHtml(chapter.title || 'Chapter')}</h2>${(await Promise.all((chapter.blocks || []).map(async (block) => {
    if (block.type === 'IMAGE') {
      const url = resolveMediaUrl(seenMediaSource(block.media));
      if (!/^https?:\/\//i.test(url)) return '';
      const image = await File.downloadFileAsync(url, new File(Paths.cache, `seen-image-${Date.now()}-${Math.random().toString(36).slice(2)}`));
      try { return `<img src="data:${image.type || 'image/jpeg'};base64,${await image.base64()}" />`; }
      finally { image.delete(); }
    }
    const list = block.metadata?.listItems;
    if (Array.isArray(list)) return `<ul>${list.map((point) => `<li>${escapeSeenHtml(String(point))}</li>`).join('')}</ul>`;
    if (block.type === 'POLL') return `<p>${escapeSeenHtml(String(block.metadata?.question || block.text || ''))}</p>`;
    return block.text || block.label ? `<p>${escapeSeenHtml(block.text || block.label)}</p>` : '';
  }))).join('')}</section>`))).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Helvetica,Arial;padding:30px;color:#17202b}h1{font-size:28px}h2{font-size:21px}p,li{line-height:1.6;white-space:pre-wrap}section{page-break-inside:auto;margin-top:28px}img{max-width:100%;max-height:600px}footer{font-size:10px;color:#666}</style></head><body><h1>${escapeSeenHtml(item.title || 'Seen')}</h1><p>${escapeSeenHtml(item.summary || item.description)}</p>${chapters}<footer>© ${escapeSeenHtml(item.creator?.name || item.creator?.username || '')} · @seen · Personal offline copy. Video, audio and interactive polls require the app.</footer></body></html>`;
  const result = await Print.printToFileAsync({ html });
  const folder = new Directory(Paths.document, 'seen-offline');
  folder.create({ idempotent: true, intermediates: true });
  const file = new File(folder, `${seenId(item)}-${Date.now()}.pdf`);
  new File(result.uri).move(file);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save offline copy' });
  return file.uri;
}
