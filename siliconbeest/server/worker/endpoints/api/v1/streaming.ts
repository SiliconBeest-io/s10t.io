/**
 * GET /api/v1/streaming — WebSocket upgrade endpoint for Mastodon Streaming API
 *
 * Authenticates the user via Bearer token, auth cookie, or query param, then
 * forwards the WebSocket upgrade to the user's StreamingDO instance.
 *
 * Query params:
 *   stream — user | user:notification | public | public:local | hashtag | list | direct
 *   tag    — hashtag name (when stream=hashtag)
 *   list   — list id (when stream=list)
 *   access_token — alternative to Authorization header (common for WS clients)
 */

import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import type { AppVariables } from '../../../types';
import { resolveToken } from '../../../services/auth';
import { sha256 } from '../../../utils/crypto';
import { getAuthTokenFromCookie } from '../../../utils/authCookie';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const app = new Hono<{ Variables: AppVariables }>();

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1] ?? null;
}

async function resolveFirstValidToken(tokens: Array<string | null | undefined>) {
  for (const token of tokens) {
    if (!token) continue;
    const tokenHash = await sha256(token);
    const payload = await resolveToken(tokenHash, token);
    if (payload) return payload;
  }
  return null;
}

app.get('/', async (c) => {
  // 1. Require WebSocket upgrade
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Expected WebSocket upgrade' }, 426);
  }

  // 2. Resolve token to user. Browser WebSocket clients cannot set an
  // Authorization header, so same-origin cookie auth must work here too.
  const payload = await resolveFirstValidToken([
    extractBearerToken(c.req.header('Authorization')),
    getAuthTokenFromCookie(c.req.header('Cookie')),
    c.req.query('access_token'),
  ]);
  if (!payload) {
    return c.json({ error: 'The access token is invalid' }, 401);
  }

  const userId = payload.user.id;
  const stream = c.req.query('stream') || 'user';

  // 4. Forward upgrade to the appropriate StreamingDO instance
  //    Public streams use a shared DO, user streams use per-user DOs
  const doName = (stream === 'public' || stream === 'public:local')
    ? '__public__'
    : userId;
  const doId = env.STREAMING_DO.idFromName(doName);
  const doStub = env.STREAMING_DO.get(doId);

  const doUrl = new URL(c.req.url);
  doUrl.pathname = '/';
  doUrl.searchParams.set('stream', stream);

  // Carry tag / list params through so DO can use them later
  const tag = c.req.query('tag');
  if (tag) doUrl.searchParams.set('tag', tag);

  const list = c.req.query('list');
  if (list) doUrl.searchParams.set('list', list);

  return doStub.fetch(new Request(doUrl.toString(), c.req.raw));
});

export default app;
