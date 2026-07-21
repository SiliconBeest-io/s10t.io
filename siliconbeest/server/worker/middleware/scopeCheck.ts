import { createMiddleware } from 'hono/factory';
import type { AppVariables } from '../types';
import {
  hasAnyOAuthScope,
  hasOAuthScope,
} from '../../../../packages/shared/permissions';

type MiddlewareEnv = { Variables: AppVariables };

/**
 * Mastodon-compatible scope hierarchy:
 * - "read" grants read:accounts, read:statuses, etc.
 * - "write" grants write:statuses, write:accounts, etc.
 * - "follow" grants read:follows, write:follows, read:blocks, write:blocks,
 *   read:mutes, write:mutes (legacy Mastodon scope)
 * - "push" grants push
 */
/**
 * Middleware factory that requires a specific OAuth scope.
 * Must be used after authRequired or authOptional.
 *
 * Usage: app.post('/statuses', authRequired, requireScope('write:statuses'), handler)
 */
export function requireScope(scope: string) {
  return createMiddleware<MiddlewareEnv>(async (c, next) => {
    const tokenScopes = c.get('tokenScopes');

    // A null value means authOptional did not resolve a token, so the public
    // endpoint's own authentication rules apply. An authenticated token with
    // an empty scope string must still fail the scope check.
    if (tokenScopes === null) {
      await next();
      return;
    }

    if (!hasOAuthScope(tokenScopes, scope)) {
      return c.json(
        {
          error: 'This action is outside the authorized scopes',
          required_scope: scope,
        },
        403,
      );
    }

    await next();
  });
}

/** Require at least one of several endpoint-specific OAuth scopes. */
export function requireAnyScope(...scopes: readonly string[]) {
  return createMiddleware<MiddlewareEnv>(async (c, next) => {
    const tokenScopes = c.get('tokenScopes');
    if (tokenScopes === null) {
      await next();
      return;
    }

    if (!hasAnyOAuthScope(tokenScopes, scopes)) {
      return c.json(
        {
          error: 'This action is outside the authorized scopes',
          required_scopes: scopes,
        },
        403,
      );
    }

    await next();
  });
}

/** Apply the read or write scope for an entire resource router. */
export function requireScopeForMethod(readScope: string, writeScope: string) {
  return createMiddleware<MiddlewareEnv>(async (c, next) => {
    const method = c.req.method;
    const requiredScope = method === 'GET' || method === 'HEAD'
      ? readScope
      : method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
        ? writeScope
        : null;
    if (requiredScope === null) {
      await next();
      return;
    }

    const tokenScopes = c.get('tokenScopes');
    if (tokenScopes === null) {
      await next();
      return;
    }
    if (!hasOAuthScope(tokenScopes, requiredScope)) {
      return c.json(
        {
          error: 'This action is outside the authorized scopes',
          required_scope: requiredScope,
        },
        403,
      );
    }
    await next();
  });
}
