import { Hono } from 'hono';
import type { AppVariables } from '../../../../types';
import { env } from 'cloudflare:workers';
import { authOptional } from '../../../../middleware/auth';
import { requireScope } from '../../../../middleware/scopeCheck';
import { serializeStatus } from './fetch';
import { enrichStatuses } from '../../../../utils/statusEnrichment';
import { getContext } from '../../../../services/status';

type HonoEnv = { Variables: AppVariables };

const app = new Hono<HonoEnv>();

app.get('/:id/context', authOptional, requireScope('read:statuses'), async (c) => {
  const statusId = c.req.param('id');
  const domain = env.INSTANCE_DOMAIN;

  const currentAccountId = c.get('currentUser')?.account_id ?? null;
  const preferredLanguages = c.get('preferredLanguages');

  const { ancestors, descendants } = await getContext(statusId, currentAccountId);

  // Collect all status IDs for batch enrichment
  const allRows = [...ancestors, ...descendants];
  const allIds = allRows.map((r) => r.id as string);
  const enrichments = await enrichStatuses(domain, allIds, currentAccountId, env.CACHE);

  function enrichAndSerialize(r: Record<string, unknown>) {
    const e = enrichments.get(r.id as string);
    const s = serializeStatus(r, domain, undefined, e?.accountEmojis, preferredLanguages);
    if (e) {
      s.media_attachments = e.mediaAttachments ?? [];
      s.favourited = e.favourited ?? false;
      s.reblogged = e.reblogged ?? false;
      s.bookmarked = e.bookmarked ?? false;
      s.card = e.card ?? null;
      s.poll = e.poll ?? null;
      s.quote = e.quote ?? null;
      s.emojis = e.emojis ?? [];
      s.quote_policy_allows = e.quotePolicyAllows;
      s.quote_policy_reason = e.quotePolicyReason;
    }
    return s;
  }

  return c.json({
    ancestors: ancestors.map(enrichAndSerialize),
    descendants: descendants.map(enrichAndSerialize),
  });
});

export default app;
