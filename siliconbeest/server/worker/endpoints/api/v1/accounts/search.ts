import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import type { AppVariables } from '../../../../types';
import { authRequired } from '../../../../middleware/auth';
import { searchAccounts } from '../../../../services/account';
import { parseCustomEmojiTagsJson } from '../../../../../../../packages/shared/utils/customEmoji';

type HonoEnv = { Variables: AppVariables };

const app = new Hono<HonoEnv>();

app.get('/search', authRequired, async (c) => {
  const query = c.req.query();
  const q = (query.q || '').trim();
  const limit = Math.min(parseInt(query.limit || '40', 10) || 40, 80);
  const following = query.following === 'true';
  const domain = env.INSTANCE_DOMAIN;
  const currentAccountId = c.get('currentUser')!.account_id;

  if (!q) return c.json([]);

  const results = await searchAccounts(q, limit, 0, following ? { followedBy: currentAccountId } : undefined);

  const accounts = results.map((row) => {
    const acct = row.domain ? `${row.username}@${row.domain}` : (row.username as string);

    const emojis = parseCustomEmojiTagsJson(row.emoji_tags as string | null, domain);

    return {
      id: row.id as string,
      username: row.username as string,
      acct,
      display_name: (row.display_name as string) || '',
      locked: !!(row.locked),
      bot: !!(row.bot),
      discoverable: !!(row.discoverable),
      group: false,
      created_at: row.created_at as string,
      note: (row.note as string) || '',
      url: (row.url as string) || `https://${domain}/@${row.username}`,
      uri: row.uri as string,
      avatar: (row.avatar_url as string) || null,
      avatar_static: (row.avatar_static_url as string) || null,
      header: (row.header_url as string) || null,
      header_static: (row.header_static_url as string) || null,
      followers_count: (row.followers_count as number) || 0,
      following_count: (row.following_count as number) || 0,
      statuses_count: (row.statuses_count as number) || 0,
      last_status_at: (row.last_status_at as string) || null,
      emojis,
      fields: [],
    };
  });

  return c.json(accounts);
});

export default app;
