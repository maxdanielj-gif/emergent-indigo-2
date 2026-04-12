/**
 * Firestore error handler for indigo AI.
 * Captures auth state and operation context to make Firebase errors
 * much easier to diagnose.
 */

import { getAuth } from 'firebase/auth';
import { getApps } from 'firebase/app';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST   = 'list',
  GET    = 'get',
  WRITE  = 'write',
}

export interface FirestoreErrorInfo {
  error:         string;
  operationType: OperationType;
  path:          string | null;
  authInfo: {
    userId:        string | undefined;
    email:         string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous:   boolean | undefined;
    tenantId:      string | null | undefined;
    providerInfo: {
      providerId:  string;
      displayName: string | null;
      email:       string | null;
      photoUrl:    string | null;
    }[];
  };
}

/**
 * Call this inside any Firestore catch block.
 *
 * Example:
 *   } catch (error) {
 *     handleFirestoreError(error, OperationType.GET, 'users/abc123');
 *   }
 *
 * It logs a structured error to the console (visible in MobileDebugger)
 * and re-throws so the caller can still show a toast or fallback UI.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  // Grab auth from whichever Firebase app is currently initialised.
  // Indigo may reinitialise Firebase at runtime, so we look up the
  // live instance rather than holding a stale reference.
  const apps    = getApps();
  const auth    = apps.length > 0 ? getAuth(apps[0]) : null;
  const current = auth?.currentUser;

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId:        current?.uid,
      email:         current?.email,
      emailVerified: current?.emailVerified,
      isAnonymous:   current?.isAnonymous,
      tenantId:      current?.tenantId,
      providerInfo:  current?.providerData.map(p => ({
        providerId:  p.providerId,
        displayName: p.displayName,
        email:       p.email,
        photoUrl:    p.photoURL,
      })) ?? [],
    },
  };

  console.error('[indigo] Firestore error:', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}
