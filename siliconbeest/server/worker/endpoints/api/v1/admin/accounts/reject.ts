import { Hono } from 'hono';
import type { AppVariables } from '../../../../../types';
import { AppError } from '../../../../../middleware/errorHandler';
import { sendRejection } from '../../../../../services/email';
import { sanitizeLocale } from '../../../../../utils/locales';
import { getAccountWithUser } from '../../../../../services/admin';
import { assertAccountModeratable } from '../../../../../services/permissions';
import { deletePendingRegistration } from '../../../../../services/registration';

type HonoEnv = { Variables: AppVariables };

const app = new Hono<HonoEnv>();

/**
 * POST /api/v1/admin/accounts/:id/reject — reject and delete a pending account.
 */
app.post('/:id/reject', async (c) => {
	const id = c.req.param('id');

	const { user } = await getAccountWithUser(id);
	const currentUser = c.get('currentUser')!;
	await assertAccountModeratable(currentUser.role, currentUser.account_id, id);

	if (user.registration_state !== 'pending_approval'
		&& user.registration_state !== 'awaiting_confirmation'
		&& user.registration_state !== 'email_verification') {
		throw new AppError(403, 'This account is not awaiting registration completion');
	}

	// Keep approval/rejection races strict. Verification states may advance
	// between their two pending phases, but activation is still guarded inside
	// deletePendingRegistration and can never be overwritten by a stale reject.
	await deletePendingRegistration(
		user.id as string,
		user.registration_state === 'pending_approval' ? 'pending_approval' : undefined,
		'rejected',
	);

	// Send the rejection only after deletion succeeds (best-effort).
	if (user.email) {
		try {
			await sendRejection(user.email as string, sanitizeLocale(user.locale as string | null));
		} catch { /* email queue failure should not block rejection */ }
	}

	return c.json({}, 200);
});

export default app;
