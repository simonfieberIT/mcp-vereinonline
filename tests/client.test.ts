import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  VereinOnlineError,
  buildToken,
  normalizeBaseUrl,
  callApi,
} from '../src/client';
import type { Profile } from '../src/config';

const profile: Profile = {
  name: 'test',
  baseUrl: 'https://www.vereinonline.org/ABC/',
  user: 'susi',
  password: 'test1234',
};

interface Recorded {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  respond: { status?: number; body: string } | (() => never),
): { fetchImpl: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (typeof respond === 'function') {
      return respond();
    }
    return new Response(respond.body, { status: respond.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function catchError(p: Promise<unknown>): Promise<VereinOnlineError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(VereinOnlineError);
    return e as VereinOnlineError;
  }
  throw new Error('expected rejection');
}

describe('buildToken', () => {
  it('buildToken known vector', () => {
    expect(buildToken('susi', 'test1234')).toBe(
      'A/susi/16d7a4fca7442dda3ad93c9a726597e4',
    );
  });

  it('buildToken uses utf8', () => {
    const md5 = createHash('md5').update('Müller-ß!', 'utf8').digest('hex');
    expect(buildToken('u', 'Müller-ß!')).toBe(`A/u/${md5}`);
  });
});

describe('normalizeBaseUrl', () => {
  it('normalizeBaseUrl variants', () => {
    expect(normalizeBaseUrl(' https://www.vereinonline.org/ABC ')).toBe(
      'https://www.vereinonline.org/ABC/',
    );
    expect(normalizeBaseUrl('https://x.org/ABC/')).toBe('https://x.org/ABC/');
    expect(normalizeBaseUrl('https://x.org/ABC/?api=GetMembers')).toBe(
      'https://x.org/ABC/',
    );
  });
});

describe('callApi', () => {
  it('sends POST with token and json body', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: '[]' });
    await callApi(profile, 'GetMembers', { suche: 'x' }, fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://www.vereinonline.org/ABC/?api=GetMembers');
    expect(calls[0].init.method).toBe('POST');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(buildToken('susi', 'test1234'));
    expect(headers['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe(JSON.stringify({ suche: 'x' }));
  });

  it('umlauts survive in body', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: '[]' });
    await callApi(profile, 'GetMembers', { suche: 'Müller Äpfel ß' }, fetchImpl);
    const body = calls[0].init.body as string;
    expect(JSON.parse(body)).toEqual({ suche: 'Müller Äpfel ß' });
    expect(body).toContain('Müller');
  });

  it('api error becomes VereinOnlineError', async () => {
    const { fetchImpl } = fakeFetch({ body: '{"error":"Keine Berechtigung"}' });
    const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
    expect(err.kind).toBe('api');
    expect(err.message).toBe('Keine Berechtigung');
  });

  it('empty error and bare strings are success', async () => {
    const cases: Array<[string, unknown]> = [
      ['{"error":""}', { error: '' }],
      ['[]', []],
      ['""', ''],
      ['"Meier, Anton"', 'Meier, Anton'],
    ];
    for (const [body, expected] of cases) {
      const { fetchImpl } = fakeFetch({ body });
      await expect(callApi(profile, 'X', {}, fetchImpl)).resolves.toEqual(expected);
    }
  });

  it('http error', async () => {
    const { fetchImpl } = fakeFetch({ status: 503, body: 'Service down' });
    const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
    expect(err.kind).toBe('http');
    expect(err.message).toContain('503');
  });

  it('non-json body does not leak body', async () => {
    const { fetchImpl } = fakeFetch({
      body: '<html>SECRET-PAGE-CONTENT</html>',
    });
    const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
    expect(err.kind).toBe('parse');
    expect(err.message).toContain('200');
    expect(err.message).not.toContain('SECRET-PAGE-CONTENT');
    expect(err.message).not.toContain('<html>');
  });

  it('network error', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
    expect(err.kind).toBe('network');
  });

  it('errors never contain secrets', async () => {
    const token = buildToken(profile.user, profile.password);
    const md5 = token.split('/')[2];
    const secrets = [profile.password, md5, token];
    const leaky = `connect failed for ${token} pwd=${profile.password} md5=${md5}`;

    const scenarios: Array<ReturnType<typeof fakeFetch>> = [
      fakeFetch(() => {
        throw new Error(leaky);
      }),
      fakeFetch({ status: 500, body: leaky }),
      fakeFetch({ body: `<html>${leaky}</html>` }),
      fakeFetch({ body: '{"error":"Keine Berechtigung"}' }),
    ];
    for (const { fetchImpl } of scenarios) {
      const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
      const text = `${err.message} ${err.stack ?? ''} ${String(err)}`;
      for (const s of secrets) {
        expect(text).not.toContain(s);
      }
    }
  });

  it('refuses a non-https base URL without sending anything', async () => {
    for (const baseUrl of ['http://example.org/', 'ftp://example.org/', 'not a url', 'http://localhost.evil.example/']) {
      const { fetchImpl, calls } = fakeFetch({ body: '[]' });
      const err = await catchError(callApi({ ...profile, baseUrl }, 'GetMembers', {}, fetchImpl));
      expect(err.kind).toBe('network');
      expect(err.message).toBe('Ungültige Basis-URL für Profil test: nur https:// ist erlaubt (http nur für localhost).');
      expect(err.message).not.toContain(profile.password);
      expect(calls).toHaveLength(0);
    }
  });

  it('allows http only for localhost, 127.0.0.1 and [::1]', async () => {
    for (const baseUrl of ['http://localhost:8080/ABC/', 'http://127.0.0.1/ABC', 'http://[::1]:9/ABC/']) {
      const { fetchImpl, calls } = fakeFetch({ body: '[]' });
      await callApi({ ...profile, baseUrl }, 'GetMembers', {}, fetchImpl);
      expect(calls).toHaveLength(1);
    }
  });

  it('does not follow redirects (fetch is called with redirect: "error")', async () => {
    const { fetchImpl, calls } = fakeFetch({ body: '[]' });
    await callApi(profile, 'GetMembers', {}, fetchImpl);
    expect(calls[0].init.redirect).toBe('error');
  });

  it('a redirect rejection from fetch surfaces as the fixed network message', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError('fetch failed: unexpected redirect to https://evil.example/?api=GetMembers');
    });
    const err = await catchError(callApi(profile, 'GetMembers', {}, fetchImpl));
    expect(err.kind).toBe('network');
    expect(err.message).toBe('Netzwerkfehler beim Aufruf von GetMembers (Profil test)');
    expect(err.message).not.toContain('evil.example');
  });
});
