import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import {
  requireAnyScope,
  requireScope,
  requireScopeForMethod,
} from '../../server/worker/middleware/scopeCheck';
import type { AppVariables } from '../../server/worker/types';

function scopeApp(tokenScopes: string | null): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();
  app.get(
    '/',
    async (c, next) => {
      c.set('tokenScopes', tokenScopes);
      await next();
    },
    requireScope('read:statuses'),
    (c) => c.json({ allowed: true }),
  );
  return app;
}

describe('OAuth scope middleware', () => {
  it('leaves anonymous authOptional requests to the public endpoint', async () => {
    const response = await scopeApp(null).request('/');

    expect(response.status).toBe(200);
  });

  it('rejects authenticated tokens with an empty scope set', async () => {
    const response = await scopeApp('').request('/');

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ required_scope: 'read:statuses' });
  });

  it('accepts a token only when its grants cover the required scope', async () => {
    expect((await scopeApp('read').request('/')).status).toBe(200);
    expect((await scopeApp('read:accounts').request('/')).status).toBe(403);
  });

  it('accepts any explicitly supported endpoint scope without widening profile', async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    app.get(
      '/',
      async (c, next) => {
        c.set('tokenScopes', 'profile');
        await next();
      },
      requireAnyScope('profile', 'read:accounts'),
      (c) => c.json({ allowed: true }),
    );

    expect((await app.request('/')).status).toBe(200);
  });

  it('selects granular admin read and write scopes by request method', async () => {
    const app = new Hono<{ Variables: AppVariables }>();
    app.use('*', async (c, next) => {
      c.set('tokenScopes', c.req.header('X-Test-Scopes') ?? '');
      await next();
    });
    app.use('*', requireScopeForMethod('admin:read:accounts', 'admin:write:accounts'));
    app.get('/', (c) => c.json({ allowed: true }));
    app.post('/', (c) => c.json({ allowed: true }));

    expect((await app.request('/', { headers: { 'X-Test-Scopes': 'admin:read' } })).status)
      .toBe(200);
    expect((await app.request('/', {
      method: 'POST',
      headers: { 'X-Test-Scopes': 'admin:read' },
    })).status).toBe(403);
    expect((await app.request('/', {
      method: 'POST',
      headers: { 'X-Test-Scopes': 'admin:write:accounts' },
    })).status).toBe(200);
    expect((await app.request('/', { headers: { 'X-Test-Scopes': 'admin' } })).status)
      .toBe(403);
  });
});
