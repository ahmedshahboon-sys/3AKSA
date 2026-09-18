import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
export const MAX_PLAYLIST_CHANNELS = 1000;

export type ParsedM3uEntry = {
  name: string;
  groupName: string | null;
  logoUrl: string | null;
  streamUrl: string;
};

type PublicTarget = {
  address: string;
  family: 4 | 6;
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

function normalizeHostname(hostname: string) {
  let value = hostname.toLowerCase().replace(/.$/, '');
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1);
  const zoneIndex = value.indexOf('%');
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);
  return value;
}

function ipv6Groups(address: string): number[] | null {
  let normalized = normalizeHostname(address);
  const dotted = normalized.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const ipv4 = dotted[2]!;
    if (privateIpv4(ipv4) && isIP(ipv4) !== 4) return null;
    const bytes = ipv4.split('.').map(Number);
    if (bytes.length !== 4 || bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const hi = ((bytes[0]! << 8) | bytes[1]!).toString(16);
    const lo = ((bytes[2]! << 8) | bytes[3]!).toString(16);
    normalized = `${dotted[1]}${hi}:${lo}`;
  }

  const pieces = normalized.split('::');
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0]!.split(':').filter(Boolean) : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1]!.split(':').filter(Boolean) : [];
  const parse = (token: string) => {
    if (!/^[0-9a-f]{1,4}$/i.test(token)) return null;
    return Number.parseInt(token, 16);
  };

  const leftValues = left.map(parse);
  const rightValues = right.map(parse);
  if (leftValues.some((value) => value === null) || rightValues.some((value) => value === null)) return null;

  if (pieces.length === 1) {
    if (leftValues.length !== 8) return null;
    return leftValues as number[];
  }

  const missing = 8 - leftValues.length - rightValues.length;
  if (missing < 1) return null;
  return [
    ...(leftValues as number[]),
    ...Array.from({ length: missing }, () => 0),
    ...(rightValues as number[])
  ];
}

function embeddedIpv4(groups: number[], startGroup: number) {
  const a = groups[startGroup]!;
  const b = groups[startGroup + 1]!;
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

function privateIpv6(address: string) {
  const groups = ipv6Groups(address);
  if (!groups || groups.length !== 8) return true;

  const allZero = groups.every((group) => group === 0);
  const loopback = groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  if (allZero || loopback) return true;

  const first = groups[0]!;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((first & 0xff00) === 0xff00) return true; // multicast

  const firstFiveZero = groups.slice(0, 5).every((group) => group === 0);
  if (firstFiveZero && groups[5] === 0xffff) {
    return privateIpv4(embeddedIpv4(groups, 6));
  }

  const firstSixZero = groups.slice(0, 6).every((group) => group === 0);
  if (firstSixZero) {
    return privateIpv4(embeddedIpv4(groups, 6));
  }

  if (groups[0] === 0x2002) {
    return privateIpv4(embeddedIpv4(groups, 1));
  }

  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true; // documentation range
  return false;
}

export function isPrivateOrLocalAddress(address: string) {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return privateIpv4(normalized);
  if (family === 6) return privateIpv6(normalized);
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

  const hostname = normalizeHostname(url.hostname);
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

export async function resolvePublicDnsTargets(url: URL): Promise<PublicTarget[]> {
  const hostname = normalizeHostname(url.hostname);
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    if (isPrivateOrLocalAddress(hostname)) throw new Error('PLAYLIST_URL_NOT_PUBLIC');
    return [{ address: hostname, family: literalFamily as 4 | 6 }];
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('PLAYLIST_DNS_FAILED');
  }

  const targets = addresses
    .filter((item): item is { address: string; family: 4 | 6 } => item.family === 4 || item.family === 6)
    .map((item) => ({ address: normalizeHostname(item.address), family: item.family }));

  if (
    targets.length === 0 ||
    targets.some((item) => isPrivateOrLocalAddress(item.address))
  ) {
    throw new Error('PLAYLIST_URL_NOT_PUBLIC');
  }

  return targets;
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

function requestPinned(url: URL, target: PublicTarget) {
  return new Promise<{
    statusCode: number;
    location: string | null;
    content: string | null;
  }>((resolve, reject) => {
    const hostname = normalizeHostname(url.hostname);
    const common = {
      hostname: target.address,
      family: target.family,
      port: url.port ? Number(url.port) : undefined,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        host: url.host,
        accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain;q=0.9',
        'accept-encoding': 'identity',
        'user-agent': '3AKSA-TV-Importer/1.0'
      }
    };

    const onResponse = (response: import('node:http').IncomingMessage) => {
      const statusCode = response.statusCode ?? 0;
      const locationHeader = response.headers.location;
      const location = Array.isArray(locationHeader) ? locationHeader[0] ?? null : locationHeader ?? null;

      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        resolve({ statusCode, location, content: null });
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        resolve({ statusCode, location: null, content: null });
        return;
      }

      const declared = Number(response.headers['content-length'] ?? 0);
      if (Number.isFinite(declared) && declared > MAX_PLAYLIST_BYTES) {
        response.destroy();
        reject(new Error('PLAYLIST_TOO_LARGE'));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      response.on('data', (chunk: Buffer | string) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MAX_PLAYLIST_BYTES) {
          response.destroy();
          fail(new Error('PLAYLIST_TOO_LARGE'));
          return;
        }
        chunks.push(buffer);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({
          statusCode,
          location: null,
          content: Buffer.concat(chunks).toString('utf8')
        });
      });
      response.on('error', (error) => fail(error instanceof Error ? error : new Error('PLAYLIST_FETCH_FAILED')));
    };

    const request = url.protocol === 'https:'
      ? httpsRequest({
          ...common,
          servername: isIP(hostname) ? '' : hostname,
          rejectUnauthorized: true
        }, onResponse)
      : httpRequest(common, onResponse);

    request.setTimeout(5000, () => request.destroy(new Error('PLAYLIST_FETCH_TIMEOUT')));
    request.on('error', (error) => reject(error instanceof Error ? error : new Error('PLAYLIST_FETCH_FAILED')));
    request.end();
  });
}

async function requestFromPublicTarget(url: URL, targets: PublicTarget[]) {
  let lastError: unknown = null;
  for (const target of targets) {
    try {
      return await requestPinned(url, target);
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAYLIST_TOO_LARGE') throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('PLAYLIST_FETCH_FAILED');
}

export async function fetchM3uPlaylist(sourceUrl: string) {
  let current = validatePublicHttpUrl(sourceUrl, 'playlist');

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const targets = await resolvePublicDnsTargets(current);

    let response: Awaited<ReturnType<typeof requestFromPublicTarget>>;
    try {
      response = await requestFromPublicTarget(current, targets);
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAYLIST_TOO_LARGE') throw error;
      throw new Error('PLAYLIST_FETCH_FAILED');
    }

    if (response.statusCode >= 300 && response.statusCode < 400) {
      if (!response.location || redirect === 3) throw new Error('PLAYLIST_REDIRECT_INVALID');
      current = validatePublicHttpUrl(new URL(response.location, current).toString(), 'playlist');
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300 || response.content === null) {
      throw new Error('PLAYLIST_FETCH_FAILED');
    }

    return {
      content: response.content,
      finalUrl: current,
      sourceHost: normalizeHostname(current.hostname),
      sourceFingerprint: createHash('sha256').update(current.toString()).digest('hex')
    };
  }

  throw new Error('PLAYLIST_FETCH_FAILED');
}
