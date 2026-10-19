import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth: Auth = getAuth(app);

export interface FirebaseEmulatorConfig {
  enabled: boolean;
  firestoreHost: string;
  firestorePort: number;
  authUrl: string;
}

let emulatorsConnected = false;

function readEnvValue(key: string): string | undefined {
  const viteEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      : undefined;
  const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;
  return viteEnv?.[key] ?? nodeEnv?.[key];
}

export function isEmulatorEnabled(): boolean {
  const flag = readEnvValue('VITE_USE_FIREBASE_EMULATOR');
  return flag === 'true' || flag === '1';
}

export function getEmulatorConfig(): FirebaseEmulatorConfig {
  const firestoreHost = readEnvValue('VITE_FIRESTORE_EMULATOR_HOST') || '127.0.0.1';
  const parsedPort = Number(readEnvValue('VITE_FIRESTORE_EMULATOR_PORT') || 8080);
  const firestorePort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8080;
  const authUrl = readEnvValue('VITE_AUTH_EMULATOR_URL') || 'http://127.0.0.1:9099';

  return {
    enabled: isEmulatorEnabled(),
    firestoreHost,
    firestorePort,
    authUrl,
  };
}

export function configureFirebaseEmulators(force = false): boolean {
  if (emulatorsConnected) {
    return true;
  }
  const config = getEmulatorConfig();
  if (!force && !config.enabled) {
    return false;
  }

  connectFirestoreEmulator(db, config.firestoreHost, config.firestorePort);
  connectAuthEmulator(auth, config.authUrl, { disableWarnings: true });
  emulatorsConnected = true;
  return true;
}

configureFirebaseEmulators();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      throw new Error('Firebase istemcisi çevrimdışı. Lütfen yapılandırmanızı kontrol edin.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}
