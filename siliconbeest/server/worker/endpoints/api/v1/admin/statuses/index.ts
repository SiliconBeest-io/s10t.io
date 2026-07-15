import { Hono } from 'hono';
import type { AppVariables } from '../../../../../types';
import { authRequired, adminRequired } from '../../../../../middleware/auth';
import { requireScopeForMethod } from '../../../../../middleware/scopeCheck';

import deleteStatus from './delete';

const app = new Hono<{ Variables: AppVariables }>();

app.use('*', authRequired, adminRequired);
app.use('*', requireScopeForMethod('admin:read', 'admin:write'));

// DELETE /:id — soft-delete a status
app.route('/', deleteStatus);

export default app;
