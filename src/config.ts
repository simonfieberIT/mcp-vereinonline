import { readFileSync } from 'node:fs';

export const ALL_TOOLSETS: readonly string[] = [
  'members',
  'contacts',
  'events',
  'newsletter',
  'lists',
  'places',
  'fees',
  'news',
  'accounting',
  'groups',
  'pictures',
  'shop',
  'auth',
];

const DEFAULT_TOOLSETS = ALL_TOOLSETS.filter((name) => name !== 'auth');

export type ToolClass = 'read' | 'write' | 'delete' | 'send';

export interface Profile {
  name: string;
  baseUrl: string;
  user: string;
  password: string;
}

export interface Config {
  profiles: Profile[];
  toolsets: Set<string>;
  allow: { write: boolean; delete: boolean; send: boolean };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const PLAIN_HTTP_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** https only; plain http solely for loopback hosts (the MD5 token must never cross the network in cleartext). */
export function isAllowedBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && PLAIN_HTTP_HOSTS.includes(url.hostname);
}

function requireAllowedUrl(profileName: string, url: string): void {
  if (!isAllowedBaseUrl(url)) {
    // The URL itself is not echoed (it could contain credentials).
    throw new ConfigError(
      `Profil "${profileName}": "url" muss eine https://-Adresse sein (http nur für localhost, 127.0.0.1 oder [::1]).`,
    );
  }
}

function readAllowFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

function parseToolsets(raw: string | undefined): Set<string> {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') {
    return new Set(DEFAULT_TOOLSETS);
  }
  if (trimmed === 'all') {
    return new Set(ALL_TOOLSETS);
  }
  const names = trimmed.split(/[\s,]+/).filter((n) => n !== '');
  const unknown = names.filter((n) => !ALL_TOOLSETS.includes(n));
  if (unknown.length > 0) {
    throw new ConfigError(
      `Unbekannte Toolsets in VEREINONLINE_TOOLSETS: ${unknown.join(', ')}. ` +
        `Gültige Namen: ${ALL_TOOLSETS.join(', ')} (oder "all").`,
    );
  }
  return new Set(names);
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new ConfigError(`Umgebungsvariable ${name} fehlt.`);
  }
  return value;
}

function loadSingleProfile(env: NodeJS.ProcessEnv): Profile[] {
  const baseUrl = requireEnv(env, 'VEREINONLINE_URL');
  requireAllowedUrl('default', baseUrl);
  return [
    {
      name: 'default',
      baseUrl,
      user: requireEnv(env, 'VEREINONLINE_USER'),
      password: requireEnv(env, 'VEREINONLINE_PASSWORD'),
    },
  ];
}

interface RawProfile {
  url?: unknown;
  user?: unknown;
  password?: unknown;
  passwordEnv?: unknown;
}

function loadProfilesFile(
  path: string,
  env: NodeJS.ProcessEnv,
  readFile: (path: string) => string,
): Profile[] {
  let text: string;
  try {
    text = readFile(path);
  } catch {
    throw new ConfigError(`Profildatei aus VEREINONLINE_PROFILES konnte nicht gelesen werden: ${path}`);
  }

  // JSON.parse-Fehler können Dateiinhalt (also Passwörter) zitieren, daher
  // bewusst ohne die Originalmeldung weitergeben.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigError(`Profildatei ${path} ist kein gültiges JSON.`);
  }

  const profilesRaw =
    typeof parsed === 'object' && parsed !== null && 'profiles' in parsed
      ? (parsed as { profiles: unknown }).profiles
      : undefined;
  if (typeof profilesRaw !== 'object' || profilesRaw === null || Array.isArray(profilesRaw)) {
    throw new ConfigError(`Profildatei ${path} braucht ein Objekt "profiles".`);
  }

  const entries = Object.entries(profilesRaw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new ConfigError(`Profildatei ${path} enthält kein Profil.`);
  }

  return entries.map(([name, value]) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ConfigError(`Profil "${name}" ist kein Objekt.`);
    }
    const raw = value as RawProfile;
    if (typeof raw.url !== 'string' || raw.url === '') {
      throw new ConfigError(`Profil "${name}": "url" fehlt oder ist kein Text.`);
    }
    requireAllowedUrl(name, raw.url);
    if (typeof raw.user !== 'string' || raw.user === '') {
      throw new ConfigError(`Profil "${name}": "user" fehlt oder ist kein Text.`);
    }

    let password: string;
    if (raw.passwordEnv !== undefined) {
      if (typeof raw.passwordEnv !== 'string' || raw.passwordEnv === '') {
        throw new ConfigError(`Profil "${name}": "passwordEnv" ist kein gültiger Variablenname.`);
      }
      const fromEnv = env[raw.passwordEnv];
      if (fromEnv === undefined || fromEnv === '') {
        throw new ConfigError(
          `Profil "${name}": Umgebungsvariable ${raw.passwordEnv} (passwordEnv) fehlt.`,
        );
      }
      password = fromEnv;
    } else if (typeof raw.password === 'string' && raw.password !== '') {
      password = raw.password;
    } else {
      throw new ConfigError(
        `Profil "${name}": "passwordEnv" oder "password" fehlt.`,
      );
    }

    return { name, baseUrl: raw.url, user: raw.user, password };
  });
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Config {
  const hasUrl = env.VEREINONLINE_URL !== undefined && env.VEREINONLINE_URL !== '';
  const profilesPath = env.VEREINONLINE_PROFILES;
  const hasProfiles = profilesPath !== undefined && profilesPath !== '';

  if (hasUrl && hasProfiles) {
    throw new ConfigError(
      'VEREINONLINE_URL und VEREINONLINE_PROFILES dürfen nicht gleichzeitig gesetzt sein.',
    );
  }
  if (!hasUrl && !hasProfiles) {
    throw new ConfigError(
      'Keine Konfiguration: VEREINONLINE_URL (mit _USER und _PASSWORD) oder VEREINONLINE_PROFILES setzen.',
    );
  }

  const profiles = hasProfiles
    ? loadProfilesFile(profilesPath as string, env, readFile)
    : loadSingleProfile(env);

  return {
    profiles,
    toolsets: parseToolsets(env.VEREINONLINE_TOOLSETS),
    allow: {
      write: readAllowFlag(env.VEREINONLINE_ALLOW_WRITE),
      delete: readAllowFlag(env.VEREINONLINE_ALLOW_DELETE),
      send: readAllowFlag(env.VEREINONLINE_ALLOW_SEND),
    },
  };
}
