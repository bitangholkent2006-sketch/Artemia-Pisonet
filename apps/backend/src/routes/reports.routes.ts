import { Hono } from 'hono';
import { requireStaff, AppEnv } from '../middleware/auth.middleware';
import { getCollections } from '../database/connection';
import { DbAuditRecord } from '../database/types';

export const reportRoutes = new Hono<AppEnv>();

// Business Summary & Analytics (Staff or Admin)
reportRoutes.get('/summary', requireStaff, async (c) => {
  const collections = getCollections();
  const now = new Date();

  // Start of today (00:00:00)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Aggregate today's payments
  const todayPayments = await collections.payments
    .find({ createdAt: { $gte: startOfDay } })
    .toArray();

  let todayGrossMinorUnits = 0;
  const paymentMethodBreakdown: Record<string, number> = {
    cash: 0,
    gcash: 0,
    maya: 0,
    other: 0
  };

  for (const pay of todayPayments) {
    todayGrossMinorUnits += pay.amountMinorUnits;
    if (paymentMethodBreakdown[pay.method] !== undefined) {
      paymentMethodBreakdown[pay.method] += pay.amountMinorUnits;
    }
  }

  // Active Sessions
  const activeSessionsCount = await collections.sessions.countDocuments({ status: 'active' });

  // Unsettled Open-Time
  const unsettledAuths = await collections.openTimeAuths.find({ isSettled: false }).toArray();
  const unsettledTotalAccruedMinorUnits = unsettledAuths.reduce(
    (sum: number, a: any) => sum + (a.currentAccruedMinorUnits || 0),
    0
  );

  // PC Fleet Utilization
  const totalPcs = await collections.pcs.countDocuments();
  const inUsePcs = await collections.pcs.countDocuments({ status: 'in-use' });
  const utilizationPercentage = totalPcs > 0 ? Math.round((inUsePcs / totalPcs) * 100) : 0;

  // Total registered customers
  const totalCustomers = await collections.users.countDocuments({ role: 'customer' });

  return c.json({
    success: true,
    data: {
      todayGrossMinorUnits,
      todayGrossPhp: (todayGrossMinorUnits / 100).toFixed(2),
      transactionCount: todayPayments.length,
      paymentMethodBreakdown,
      activeSessionsCount,
      unsettledOpenTimeCount: unsettledAuths.length,
      unsettledTotalAccruedMinorUnits,
      totalPcs,
      inUsePcs,
      utilizationPercentage,
      totalCustomers
    }
  });
});

// Audit Logs (Staff or Admin)
reportRoutes.get('/audits', requireStaff, async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);
  const collections = getCollections();

  const records = await collections.auditRecords
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  const safeRecords = records.map((record: DbAuditRecord) => {
    const { _id, ...rest } = record;
    return rest;
  });
  return c.json({ success: true, data: safeRecords });
});

// -------------------------------------------------------------
// Daily Sales Email Alert & Automation Endpoints (Feature 3)
// -------------------------------------------------------------

// Get current email alert configuration
reportRoutes.get('/email-config', requireStaff, async (c) => {
  const { DailyReportEmailService } = await import('../services/email-report.service');
  const cfg = await DailyReportEmailService.getConfig();
  return c.json({ success: true, data: cfg });
});

// Update email alert configuration (recipient, scheduled time, SMTP)
reportRoutes.put('/email-config', requireStaff, async (c) => {
  const { DailyReportEmailService } = await import('../services/email-report.service');
  const body = await c.req.json();
  const updated = await DailyReportEmailService.saveConfig(body);
  return c.json({ success: true, data: updated, message: 'Email report settings updated successfully!' });
});

// Trigger immediate manual sending of today's sales report
reportRoutes.post('/send-daily-email', requireStaff, async (c) => {
  const { DailyReportEmailService } = await import('../services/email-report.service');
  const body = await c.req.json().catch(() => ({}));
  const staff = (c as any).get?.('user');
  const result = await DailyReportEmailService.sendDailySalesReport({
    recipientEmail: body.recipientEmail,
    manualTriggerBy: staff?.username || 'Staff'
  });
  return c.json(result);
});

// Preview today's compiled sales data and HTML email
reportRoutes.get('/daily-preview', requireStaff, async (c) => {
  const { DailyReportEmailService } = await import('../services/email-report.service');
  const data = await DailyReportEmailService.compileDailySalesData();
  const html = DailyReportEmailService.generateEmailHtml(data);
  return c.json({ success: true, data, html });
});

