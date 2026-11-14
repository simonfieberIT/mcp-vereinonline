import { createHash } from 'node:crypto';
import { isAllowedBaseUrl, type Profile } from './config';

export class VereinOnlineError extends Error {
  constructor(
    message: string,
    readonly kind: 'api' | 'http' | 'parse' | 'network',
  ) {
    super(message);
    this.name = 'VereinOnlineError';
  }
}

/** "A/<user>/<md5hex(password)>", MD5 over the UTF-8 bytes of the password. */
export function buildToken(user: string, password: string): string {
  const md5 = createHash('md5').update(password, 'utf8').digest('hex');
  return `A/${user}/${md5}`;
}

/** Trim, drop query/fragment, ensure trailing slash. */
export function normalizeBaseUrl(url: string): string {
  let base = url.trim();
  const cut = base.search(/[?#]/);
  if (cut !== -1) {
    base = base.slice(0, cut);
  }
  return base.endsWith('/') ? base : `${base}/`;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret !== '') {
      out = out.split(secret).join('***');
    }
  }
  return out;
}

export async function callApi(
  profile: Profile,
  fn: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (!isAllowedBaseUrl(profile.baseUrl)) {
    throw new VereinOnlineError(
      `Ungültige Basis-URL für Profil ${profile.name}: nur https:// ist erlaubt (http nur für localhost).`,
      'network',
    );
  }
  const token = buildToken(profile.user, profile.password);
  const md5 = token.slice(token.lastIndexOf('/') + 1);
  const secrets = [token, md5, profile.password];
  const url = `${normalizeBaseUrl(profile.baseUrl)}?api=${encodeURIComponent(fn)}`;

  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error', // a redirect would turn the POST into a GET carrying the api query
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify(params),
    });
    text = await response.text();
  } catch {
    // The original error message is deliberately dropped: it could echo the URL or headers.
    throw new VereinOnlineError(
      `Netzwerkfehler beim Aufruf von ${fn} (Profil ${profile.name})`,
      'network',
    );
  }

  if (response.status >= 400) {
    throw new VereinOnlineError(
      `HTTP-Fehler ${response.status} beim Aufruf von ${fn}`,
      'http',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VereinOnlineError(
      `Antwort von ${fn} ist kein gültiges JSON (HTTP ${response.status})`,
      'parse',
    );
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const error = (parsed as Record<string, unknown>).error;
    if (typeof error === 'string' && error !== '') {
      throw new VereinOnlineError(redact(error, secrets), 'api');
    }
  }
  return parsed;
}
