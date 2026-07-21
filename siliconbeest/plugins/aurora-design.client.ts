import { isAuroraDesignPath, toAuroraPath } from '@/utils/designVersion';

/**
 * Keep users who are browsing the Aurora design (/aurora/*) inside the
 * /aurora tree: Aurora components link to canonical paths (/home,
 * /@user/...), so in-app navigation out of /aurora is rewritten to the
 * mirrored /aurora route when one exists. Mirrors plugins/old-design.client.ts.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter();

  router.beforeEach((to, from) => {
    if (!isAuroraDesignPath(from.path)) return;
    if (isAuroraDesignPath(to.path)) return;

    const target = toAuroraPath(to.fullPath);
    const resolved = router.resolve(target);
    const name = String(resolved.name ?? '');
    if (name.startsWith('aurora-') && name !== 'aurora-not-found') {
      return target;
    }
  });
});
