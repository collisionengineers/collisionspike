import { useMsal } from '@azure/msal-react';

/* ============================================================
   useIsSuperuser — true when the signed-in staff principal carries the
   `CollisionSpike.Superuser` Entra app role.

   Gates destructive Superuser-only UI (e.g. Remove case, work-todo-spike:
   ui-changes/delete-case). The app role lands in the `roles` claim of the token;
   MSAL surfaces it on the active account's `idTokenClaims`. Defaults to FALSE
   (hide) when there is no account/claim — the safe default for a gate, and the
   honest one in the auth-free empty-source/test paths. The SERVER is the real
   authority (the API 403s a non-Superuser remove regardless); this only avoids
   showing an action the operator can't actually perform.
   ============================================================ */

const SUPERUSER_ROLES = new Set(['CollisionSpike.Superuser', 'CollisionSpike.Admin']);

/** True when the active account holds the Superuser app role. */
export function useIsSuperuser(): boolean {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const roles = (account?.idTokenClaims as { roles?: string[] } | undefined)?.roles;
  return Array.isArray(roles) && roles.some((role) => SUPERUSER_ROLES.has(role));
}
