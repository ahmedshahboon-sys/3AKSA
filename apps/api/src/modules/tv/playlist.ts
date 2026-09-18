import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
export const MAX_PLAYLIST_CHANNELS = 1000;

export type ParsedM3uEntry = {
  name: string;
  groupName: string | null;
  logoUrl: string | null;
  streamUrl: string;
};

function privateIpv4(address: string) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = parts[0]!;
  const b = parts[1]!;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function privateIpv6(address: string) {
  const normalized = address.toLowerCase().split('%')[0] ?? '';
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.')
  );
}

export function isPrivateOrLocalAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return privateIpv4(address);
  if (family === 6) return privateIpv6(address);
  return true;
}

export function validatePublicHttpUrl(raw: string, kind: 'stream' | 'logo' | 'playlist' = 'stream') {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) throw new Error(`INVALID_${kind.toUpperCase()}_URL`);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`INVALID_${kind.toUpperCase()}_URL`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`INVALID_${kind.toUpperCase()}_URL`);
  }
  if (url.username || url.password) throw new Error(`INVALID_${kind.toUpperCase()}_URL`);

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error(`INVALID_${kind.toUpperCase()}_URL`);
  }

  if (isIP(hostname) && isPrivateOrLocalAddress(hostname)) {
    throw new Error(`INVALID_${kind.toUpperCase()}_URL`);
  }

  return url;
}

export async function assertPublicDnsTarget(url: URL) {
  if (isIP(url.hostname)) {
    if (isPrivateOrLocalAddress(url.hostname)) throw new Error('PLAYLIST_URL_NOT_PUBLIC');
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('PLAYLIST_DNS_FAILED');
  }
  if (addresses.length === 0 || addresses.some((item) => isPrivateOrLocalAddress(item.address))) {
    throw new Error('PLAYLIST_URL_NOT_PUBLIC');
  }
}

function parseExtInf(line: string) {
  const comma = line.indexOf(',');
  const metadata = comma >= 0 ? line.slice(0, comma) : line;
  const displayName = comma >= 0 ? line.slice(comma + 1).trim() : '';
  const attrs = new Map<string, string>();
  const attrRe = /([A-Za-z0-9_-]+)="([^"]*)"/g;
  for (const match of metadata.matchAll(attrRe)) {
    attrs.set(match[1]!.toLowerCase(), match[2]!.trim());
  }
  const name = (attrs.get('tvg-name') || displayName).trim();
  return {
    name,
    groupName: attrs.get('group-title')?.trim() || null,
    logoUrl: attrs.get('tvg-logo')?.trim() || null
  };
}

function sanitizeLabel(value: string | null, max: number) {
  if (value === null) return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

export function parseM3uPlaylist(content: string): ParsedM3uEntry[] {
  if (Buffer.byteLength(content, 'utf8') > MAX_PLAYLIST_BYTES) throw new Error('PLAYLIST_TOO_LARGE');

  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const first = lines.find((line) => line.trim().length > 0)?.trim();
  if (!first?.startsWith('#EXTM3U')) throw new Error('INVALID_M3U_PLAYLIST');

  const entries: ParsedM3uEntry[] = [];
  let pending: ReturnType<typeof parseExtInf> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      pending = parseExtInf(line);
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!pending) continue;

    const name = sanitizeLabel(pending.name, 120);
    if (!name) {
      pending = null;
      continue;
    }

    const streamUrl = validatePublicHttpUrl(line, 'stream').toString();
    let logoUrl: string | null = null;
    if (pending.logoUrl) {
      try {
        logoUrl = validatePublicHttpUrl(pending.logoUrl, 'logo').toString();
      } catch {
        logoUrl = null;
      }
    }

    entries.push({
      name,
      groupName: sanitizeLabel(pending.groupName, 120),
      logoUrl,
      streamUrl
    });
    pending = null;

    if (entries.length > MAX_PLAYLIST_CHANNELS) throw new Error('PLAYLIST_CHANNEL_LIMIT');
  }

  if (entries.length === 0) throw new Error('PLAYLIST_HAS_NO_CHANNELS');
  return entries;
}

async function readTextLimited(response: Response) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > MAX_PLAYLIST_BYTES) throw new Error('PLAYLIST_TOO_LARGE');
  if (!response.body) throw new Error('PLAYLIST_FETCH_FAILED');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_PLAYLIST_BYTES) {
      await reader.cancel();
      throw new Error('PLAYLIST_TOO_LARGE');
    }
    chunks.push(part.value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

export async function fetchM3uPlaylist(sourceUrl: string) {
  let current = validatePublicHttpUrl(sourceUrl, 'playlist');

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicDnsTarget(current);

    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        headers: {
          accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain;q=0.9'
        },
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      throw new Error('PLAYLIST_FETCH_FAILED');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('PLAYLIST_REDIRECT_INVALID');
      current = validatePublicHttpUrl(new URL(location, current).toString(), 'playlist');
      continue;
    }

    if (!response.ok) throw new Error('PLAYLIST_FETCH_FAILED');
    const content = await readTextLimited(response);
    return {
      content,
      finalUrl: current,
      sourceHost: current.hostname,
      sourceFingerprint: createHash('sha256').update(current.toString()).digest('hex')
    };
  }

  throw new Error('PLAYLIST_FETCH_FAILED');
}
