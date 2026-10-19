import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import {
  computeDayCloseSeal,
  evaluateDayCloseBlockers,
} from './src/services/decisionEngine';

let adminApp: App | undefined;
try {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    adminApp = initializeApp({
      credential: cert(serviceAccount),
    });
  } else {
    adminApp = initializeApp();
  }
} catch {
  adminApp = undefined;
}

const db = adminApp ? getFirestore(adminApp) : undefined;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const verifyAuth = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Yetkisiz erişim: Kimlik doğrulama jetonu eksik.' });
      return;
    }
    const token = authHeader.split('Bearer ')[1];
    try {
      if (!adminApp) {
        throw new Error('Firebase Admin başlatılamadı.');
      }
      const decodedToken = await getAuth(adminApp).verifyIdToken(token);
      (req as express.Request & { user?: DecodedIdToken }).user = decodedToken;
      next();
    } catch {
      res.status(401).json({ error: 'Yetkisiz erişim: Geçersiz kimlik doğrulama jetonu.' });
    }
  };

  app.post('/api/day-close', verifyAuth, async (req, res) => {
    try {
      const decodedUser = (req as express.Request & { user?: DecodedIdToken }).user;
      if (!decodedUser || !decodedUser.uid) {
        res.status(401).json({ error: 'Kullanıcı kimliği doğrulanamadı.' });
        return;
      }

      if (!db) {
        res.status(503).json({ error: 'Sunucu veritabanı bağlantısı hazır değil.' });
        return;
      }

      const uid = decodedUser.uid;
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists) {
        res.status(403).json({ error: 'Güvenilir kullanıcı profili bulunamadı.' });
        return;
      }

      const userData = userSnap.data()!;
      const trustedRole = String(userData.role || '');
      const trustedTenantId = String(userData.tenantId || '');
      const trustedBranchId = String(userData.branchId || '');

      if (!trustedTenantId || !trustedBranchId) {
        res.status(403).json({ error: 'Kullanıcı tenant veya şube tanımı eksik.' });
        return;
      }

      if (!['admin', 'finance'].includes(trustedRole)) {
        res.status(403).json({ error: `Bu işlem için yetkiniz yok (${trustedRole}).` });
        return;
      }

      const businessDate = new Date().toISOString().split('T')[0];
      const lockDocId = `${trustedTenantId}_${trustedBranchId}_${businessDate}`;

      const dayCloseResult = await db.runTransaction(async (t) => {
        const dayCloseRef = db.collection('day_closes').doc(lockDocId);
        const existingCloseSnap = await t.get(dayCloseRef);
        if (existingCloseSnap.exists && existingCloseSnap.data()?.status === 'closed') {
          throw new Error('Bu iş günü daha önce kapatılmış ve mühürlenmiştir.');
        }

        const custodiesSnap = await t.get(
          db.collection('custodies').where('tenantId', '==', trustedTenantId).where('branchId', '==', trustedBranchId)
        );
        const shiftsSnap = await t.get(
          db.collection('shifts').where('tenantId', '==', trustedTenantId).where('branchId', '==', trustedBranchId)
        );
        const serviceCasesSnap = await t.get(
          db.collection('service_cases').where('tenantId', '==', trustedTenantId).where('branchId', '==', trustedBranchId)
        );
        const penaltiesSnap = await t.get(
          db.collection('penalties_incidents').where('tenantId', '==', trustedTenantId).where('branchId', '==', trustedBranchId)
        );
        const plateOwnersSnap = await t.get(
          db.collection('plate_owners').where('tenantId', '==', trustedTenantId).where('branchId', '==', trustedBranchId)
        );
        const tasksSnap = await t.get(db.collection('tasks'));
        const previousClosesSnap = await t.get(
          db
            .collection('day_closes')
            .where('tenantId', '==', trustedTenantId)
            .where('branchId', '==', trustedBranchId)
        );

        const activeCustodyIds: string[] = [];
        const disputedRecordIds: string[] = [];
        custodiesSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'active') activeCustodyIds.push(docSnap.id);
          if (d.status === 'disputed') disputedRecordIds.push(docSnap.id);
        });

        const activeShiftIds: string[] = [];
        const uncollectedAccrualShiftIds: string[] = [];
        let totalAccrual = 0;
        let totalCollection = 0;

        shiftsSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status === 'active' || d.status === 'delayed') {
            activeShiftIds.push(docSnap.id);
          }
          const accrual = Number(d.accrual || 0);
          const collection = Number(d.collection || 0);
          if (accrual > collection) {
            uncollectedAccrualShiftIds.push(docSnap.id);
          }
          if (d.status === 'completed') {
            totalAccrual += accrual;
            totalCollection += collection;
          }
        });

        const openServiceCaseIds: string[] = [];
        serviceCasesSnap.forEach((docSnap) => {
          if (docSnap.data().status === 'open') {
            openServiceCaseIds.push(docSnap.id);
          }
        });

        const undocumentedDamageIds: string[] = [];
        const undocumentedFineIds: string[] = [];
        penaltiesSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.status !== 'collected') {
            if (d.type === 'accident_damage' || d.type === 'downtime_loss') {
              undocumentedDamageIds.push(docSnap.id);
            } else {
              undocumentedFineIds.push(docSnap.id);
            }
          }
        });

        const openOwnerSettlementIds: string[] = [];
        plateOwnersSnap.forEach((docSnap) => {
          if (docSnap.data().status === 'open') {
            openOwnerSettlementIds.push(docSnap.id);
          }
        });

        const cashDiffRecordIds: string[] = [];
        tasksSnap.forEach((docSnap) => {
          const d = docSnap.data();
          if (d.type === 'Finans') {
            cashDiffRecordIds.push(docSnap.id);
          }
        });

        const blockers = evaluateDayCloseBlockers({
          alreadyClosed: false,
          activeCustodyIds,
          activeShiftIds,
          uncollectedAccrualShiftIds,
          untransferredCollectionIds: [],
          cashDiffRecordIds,
          posDiffRecordIds: [],
          undocumentedDamageIds,
          undocumentedFineIds,
          unapprovedExpenseIds: [],
          openServiceCaseIds,
          unlinkedPartExitIds: [],
          disputedRecordIds,
          missingAuditEntityIds: [],
          openOwnerSettlementIds,
        });

        if (blockers.length > 0) {
          return { success: false as const, blockers };
        }

        let previousCloseHash = 'GENESIS';
        previousClosesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.hash) {
            previousCloseHash = String(data.hash);
          }
        });

        const cashDifference = totalAccrual - totalCollection;
        const signatureVersion = 'v1';
        const secret = process.env.DAY_CLOSE_SECRET || 'fleet-os-server-seal-key-2026-prod';

        const hash = computeDayCloseSeal(
          {
            tenantId: trustedTenantId,
            branchId: trustedBranchId,
            businessDate,
            closedBy: uid,
            totalAccrual,
            totalCollection,
            cashDifference,
            previousCloseHash,
            signatureVersion,
          },
          secret
        );

        const dayCloseData = {
          id: lockDocId,
          tenantId: trustedTenantId,
          branchId: trustedBranchId,
          businessDate,
          status: 'closed',
          closedBy: uid,
          closedAt: new Date().toISOString(),
          totalAccrual,
          totalCollection,
          cashDifference,
          openRecordsSummary: {
            activeCustodies: 0,
            activeShifts: 0,
            openServiceCases: 0,
          },
          previousCloseHash,
          signatureVersion,
          hash,
        };

        t.set(dayCloseRef, dayCloseData);

        const auditLogRef = db.collection('audit_logs').doc();
        t.set(auditLogRef, {
          auditId: auditLogRef.id,
          tenantId: trustedTenantId,
          branchId: trustedBranchId,
          actorUserId: uid,
          actorRole: trustedRole,
          action: 'DAY_CLOSE',
          entityType: 'day_close',
          entityId: lockDocId,
          before: null,
          after: dayCloseData,
          reason: 'Sunucu doğrulamalı gün sonu kapanışı ve mühürlemesi tamamlandı',
          createdAt: new Date().toISOString(),
          correlationId: db.collection('_ids').doc().id,
        });

        return { success: true as const, data: dayCloseData };
      });

      if (!dayCloseResult.success) {
        res.status(400).json({
          error: 'Gün kapanışı açık engeller nedeniyle reddedildi.',
          blockers: dayCloseResult.blockers,
        });
        return;
      }

      res.json(dayCloseResult.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sunucu hatası';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0');
}

void startServer();
