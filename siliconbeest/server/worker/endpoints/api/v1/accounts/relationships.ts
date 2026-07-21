import { Hono } from 'hono';
import type { AppVariables } from '../../../../types';
import { authRequired } from '../../../../middleware/auth';
import { requireScope } from '../../../../middleware/scopeCheck';
import { getRelationships } from '../../../../services/account';

type HonoEnv = { Variables: AppVariables };

const app = new Hono<HonoEnv>();

app.get('/relationships', authRequired, requireScope('read:follows'), async (c) => {
  const currentAccountId = c.get('currentUser')!.account_id;

  // Mastodon sends id[]=... or id=...
  const url = new URL(c.req.url);
  const ids = url.searchParams.getAll('id[]');
  if (ids.length === 0) {
    const singleId = url.searchParams.get('id');
    if (singleId) ids.push(singleId);
  }

  if (ids.length === 0) {
    return c.json([]);
  }

  const withSuspended = url.searchParams.get('with_suspended') === 'true';
  return c.json(await getRelationships(currentAccountId, ids, { withSuspended }));
});

export default app;
