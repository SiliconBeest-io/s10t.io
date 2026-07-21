export type NotificationMutation =
  | { type: 'statuses'; statusIds: ReadonlySet<string> }
  | { type: 'account'; accountId: string };

type NotificationMutationHandler = (mutation: NotificationMutation) => void;

let activeHandler: NotificationMutationHandler | undefined;

export function registerNotificationMutationHandler(handler: NotificationMutationHandler) {
  activeHandler = handler;
}

export function refreshNotificationsForRemovedStatuses(statusIds: ReadonlySet<string>) {
  activeHandler?.({ type: 'statuses', statusIds });
}

export function refreshNotificationsForRemovedAccount(accountId: string) {
  activeHandler?.({ type: 'account', accountId });
}
