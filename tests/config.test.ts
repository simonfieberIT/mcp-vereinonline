import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  ALL_TOOLSETS,
  ConfigError,
} from '../src/config';

const noFile = (): string => {
  throw new Error('readFile should not be called');
};

const singleEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  VEREINONLINE_URL: 'https://verein.example/',
  VEREINONLINE_USER: 'admin',
  VEREINONLINE_PASSWORD: 'geheim123',
  ...extra,
});

describe('loadConfig', () => {
  it('single profile from env', () => {
    const cfg = loadConfig(singleEnv(), noFile);
    expect(cfg.profiles).toEqual([
      {
        name: 'default',
        baseUrl: 'https://verein.example/',
        user: 'admin',
        password: 'geheim123',
      },
    ]);
  });

  it('profiles file with passwordEnv', () => {
    const file = JSON.stringify({
      profiles: {
        alpha: { url: 'https://alpha.example/', user: 'a', passwordEnv: 'ALPHA_PW' },
        beta: { url: 'https://beta.example/', user: 'b', password: 'klartext' },
      },
    });
    const cfg = loadConfig(
      { VEREINONLINE_PROFILES: '/etc/vo/profiles.json', ALPHA_PW: 'alpha-secret' },
      (path) => {
        expect(path).toBe('/etc/vo/profiles.json');
        return file;
      },
    );
    expect(cfg.profiles).toEqual([
      { name: 'alpha', baseUrl: 'https://alpha.example/', user: 'a', password: 'alpha-secret' },
      { name: 'beta', baseUrl: 'https://beta.example/', user: 'b', password: 'klartext' },
    ]);
  });

  it('missing passwordEnv variable names profile and variable', () => {
    const file = JSON.stringify({
      profiles: {
        alpha: { url: 'https://alpha.example/', user: 'a', passwordEnv: 'ALPHA_PW' },
      },
    });
    let caught: unknown;
    try {
      loadConfig({ VEREINONLINE_PROFILES: '/p.json' }, () => file);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const msg = (caught as Error).message;
    expect(msg).toContain('alpha');
    expect(msg).toContain('ALPHA_PW');
  });

  it('both URL and PROFILES is an error', () => {
    expect(() =>
      loadConfig(
        singleEnv({ VEREINONLINE_PROFILES: '/p.json' }),
        () => '{"profiles":{}}',
      ),
    ).toThrow(ConfigError);
  });

  it('neither is an error', () => {
    expect(() => loadConfig({}, noFile)).toThrow(ConfigError);
  });

  it('default toolsets exclude auth', () => {
    const cfg = loadConfig(singleEnv(), noFile);
    expect(cfg.toolsets.size).toBe(12);
    expect(cfg.toolsets.has('auth')).toBe(false);
    expect(cfg.toolsets.has('members')).toBe(true);
  });

  it('all includes auth', () => {
    const cfg = loadConfig(singleEnv({ VEREINONLINE_TOOLSETS: 'all' }), noFile);
    expect(cfg.toolsets.size).toBe(13);
    expect(cfg.toolsets.has('auth')).toBe(true);
  });

  it('toolset list with spaces', () => {
    const cfg = loadConfig(singleEnv({ VEREINONLINE_TOOLSETS: 'members, events' }), noFile);
    expect([...cfg.toolsets].sort()).toEqual(['events', 'members']);
  });

  it('unknown toolset lists valid names', () => {
    let caught: unknown;
    try {
      loadConfig(singleEnv({ VEREINONLINE_TOOLSETS: 'members,bogus' }), noFile);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const msg = (caught as Error).message;
    expect(msg).toContain('bogus');
    for (const name of ALL_TOOLSETS) {
      expect(msg).toContain(name);
    }
  });

  it('allow flags', () => {
    const on = loadConfig(
      singleEnv({
        VEREINONLINE_ALLOW_WRITE: '1',
        VEREINONLINE_ALLOW_DELETE: 'true',
        VEREINONLINE_ALLOW_SEND: 'TRUE',
      }),
      noFile,
    );
    expect(on.allow).toEqual({ write: true, delete: true, send: true });

    const off = loadConfig(
      singleEnv({
        VEREINONLINE_ALLOW_WRITE: 'yes',
        VEREINONLINE_ALLOW_DELETE: '0',
        VEREINONLINE_ALLOW_SEND: '',
      }),
      noFile,
    );
    expect(off.allow).toEqual({ write: false, delete: false, send: false });

    const missing = loadConfig(singleEnv(), noFile);
    expect(missing.allow).toEqual({ write: false, delete: false, send: false });
  });

  it('allow flags are case-insensitive and whitespace-tolerant', () => {
    const truthy = ['1', 'true', 'True', 'tRuE', 'TRUE', ' true ', '\t1\n'];
    for (const value of truthy) {
      const cfg = loadConfig(
        singleEnv({
          VEREINONLINE_ALLOW_WRITE: value,
          VEREINONLINE_ALLOW_DELETE: value,
          VEREINONLINE_ALLOW_SEND: value,
        }),
        noFile,
      );
      expect(cfg.allow, `value ${JSON.stringify(value)}`).toEqual({
        write: true,
        delete: true,
        send: true,
      });
    }

    const falsy = ['yes', 'on', '0', 'false', '', '  ', 'truee'];
    for (const value of falsy) {
      const cfg = loadConfig(
        singleEnv({
          VEREINONLINE_ALLOW_WRITE: value,
          VEREINONLINE_ALLOW_DELETE: value,
          VEREINONLINE_ALLOW_SEND: value,
        }),
        noFile,
      );
      expect(cfg.allow, `value ${JSON.stringify(value)}`).toEqual({
        write: false,
        delete: false,
        send: false,
      });
    }
  });

  it('error messages never contain a password', () => {
    const cases: Array<() => unknown> = [
      // both URL and PROFILES set
      () => loadConfig(singleEnv({ VEREINONLINE_PROFILES: '/p.json' }), () => '{}'),
      // unknown toolset
      () => loadConfig(singleEnv({ VEREINONLINE_TOOLSETS: 'nope' }), noFile),
      // missing user in single-profile mode
      () =>
        loadConfig(
          { VEREINONLINE_URL: 'https://x.example/', VEREINONLINE_PASSWORD: 'geheim123' },
          noFile,
        ),
      // profiles file with invalid JSON that embeds the password
      () =>
        loadConfig(
          { VEREINONLINE_PROFILES: '/p.json' },
          () => '{"profiles": {"a": {"password": "geheim123" ',
        ),
      // profile without url
      () =>
        loadConfig(
          { VEREINONLINE_PROFILES: '/p.json' },
          () => '{"profiles":{"a":{"user":"u","password":"geheim123"}}}',
        ),
      // profile with passwordEnv pointing to unset variable
      () =>
        loadConfig(
          { VEREINONLINE_PROFILES: '/p.json', OTHER: 'geheim123' },
          () =>
            '{"profiles":{"a":{"url":"https://a.example/","user":"u","passwordEnv":"MISSING"}}}',
        ),
    ];

    for (const run of cases) {
      let caught: unknown;
      try {
        run();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).not.toContain('geheim123');
    }
  });
});

describe('loadConfig base URL validation', () => {
  const fileWithUrl = (url: string) => () =>
    JSON.stringify({ profiles: { verein1: { url, user: 'u', password: 'geheim123' } } });

  for (const bad of [
    'http://example.org/x/',
    'ftp://verein.example/x/',
    'not a url',
    'verein.example/ABC',
    'file:///etc/passwd',
    'http://localhost.evil.example/',
    'http://127.0.0.2/',
  ]) {
    it(`single profile env rejects ${JSON.stringify(bad)}`, () => {
      expect(() => loadConfig(singleEnv({ VEREINONLINE_URL: bad }), noFile)).toThrow(ConfigError);
      try {
        loadConfig(singleEnv({ VEREINONLINE_URL: bad }), noFile);
      } catch (e) {
        expect((e as Error).message).toContain('default');
        expect((e as Error).message).not.toContain('geheim123');
      }
    });

    it(`profiles file rejects ${JSON.stringify(bad)} and names the profile`, () => {
      let caught: unknown;
      try {
        loadConfig({ VEREINONLINE_PROFILES: '/p.json' }, fileWithUrl(bad));
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ConfigError);
      expect((caught as Error).message).toContain('verein1');
      expect((caught as Error).message).not.toContain('geheim123');
    });
  }

  it('every profile of a file is checked, not just the first', () => {
    const file = () =>
      JSON.stringify({
        profiles: {
          good: { url: 'https://www.vereinonline.org/ABC', user: 'u', password: 'p' },
          bad: { url: 'http://example.org/x/', user: 'u', password: 'p' },
        },
      });
    expect(() => loadConfig({ VEREINONLINE_PROFILES: '/p.json' }, file)).toThrow(/bad/);
  });

  for (const ok of [
    'https://www.vereinonline.org/ABC',
    'http://localhost:8080/ABC/',
    'http://127.0.0.1:8080/ABC/',
    'http://[::1]:8080/ABC/',
    ' https://www.vereinonline.org/ABC/ ',
  ]) {
    it(`accepts ${JSON.stringify(ok)} (env and file)`, () => {
      expect(loadConfig(singleEnv({ VEREINONLINE_URL: ok }), noFile).profiles).toHaveLength(1);
      expect(loadConfig({ VEREINONLINE_PROFILES: '/p.json' }, fileWithUrl(ok)).profiles).toHaveLength(1);
    });
  }
});
