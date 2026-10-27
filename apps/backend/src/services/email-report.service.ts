import nodemailer from 'nodemailer';
import { getCollections } from '../database/connection';
import { AuditService } from './audit.service';

export interface EmailReportConfig {
  enabled: boolean;
  recipientEmail: string;
  sendHour: number; // 0-23 (default 22 = 10:00 PM)
  sendMinute: number; // 0-59 (default 0)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail?: string;
  lastSentDate?: string; // YYYY-MM-DD
  updatedAt?: Date;
}

export interface DailySalesData {
  dateStr: string;
  todayGrossMinorUnits: number;
  todayGrossPhp: string;
  transactionCount: number;
  breakdown: {
    cashMinorUnits: number;
    cashPhp: string;
    coinsMinorUnits: number;
    coinsPhp: string;
    onlineMinorUnits: number;
    onlinePhp: string;
  };
  sessionsCount: number;
  totalPcs: number;
  inUsePcs: number;
  unsettledOpenTimeMinorUnits: number;
  unsettledOpenTimePhp: string;
  topCustomers: Array<{ name: string; username: string; totalPhp: string }>;
}

export class DailyReportEmailService {
  private static schedulerInterval: ReturnType<typeof setInterval> | null = null;
  private static isSending = false;

  private static getDefaultConfig(): EmailReportConfig {
    return {
      enabled: true,
      recipientEmail: process.env.REPORT_RECIPIENT_EMAIL || 'artemia.pisonet@gmail.com',
      sendHour: parseInt(process.env.REPORT_SEND_HOUR || '22', 10), // 10:00 PM
      sendMinute: parseInt(process.env.REPORT_SEND_MINUTE || '0', 10),
      smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
      fromEmail: process.env.SMTP_FROM || '"Artemia\'s Pisonet" <reports@artemiapisonet.com>',
      lastSentDate: ''
    };
  }

  public static async getConfig(): Promise<EmailReportConfig> {
    const defaults = DailyReportEmailService.getDefaultConfig();
    try {
      const collections = getCollections();
      const doc = await collections.systemSettings.findOne({ _id: 'email_report_config' });
      if (doc) {
        return {
          ...defaults,
          ...doc,
          // Mask password when sending to callers
          smtpPass: doc.smtpPass ? '********' : ''
        };
      }
    } catch (err) {
      console.warn('[EmailReport] Error fetching config from DB:', err);
    }
    return {
      ...defaults,
      smtpPass: defaults.smtpPass ? '********' : ''
    };
  }

  public static async getInternalConfig(): Promise<EmailReportConfig> {
    const defaults = DailyReportEmailService.getDefaultConfig();
    try {
      const collections = getCollections();
      const doc = await collections.systemSettings.findOne({ _id: 'email_report_config' });
      if (doc) {
        return {
          ...defaults,
          ...doc
        };
      }
    } catch {}
    return defaults;
  }

  public static async saveConfig(updates: Partial<EmailReportConfig>): Promise<EmailReportConfig> {
    const collections = getCollections();
    const current = await DailyReportEmailService.getInternalConfig();

    // If user passed masked password, keep existing password
    if (updates.smtpPass === '********') {
      delete updates.smtpPass;
    }

    const merged: EmailReportConfig = {
      ...current,
      ...updates,
      updatedAt: new Date()
    };

    await collections.systemSettings.updateOne(
      { _id: 'email_report_config' },
      { $set: merged },
      { upsert: true }
    );

    return DailyReportEmailService.getConfig();
  }

  public static async compileDailySalesData(targetDate: Date = new Date()): Promise<DailySalesData> {
    const collections = getCollections();

    // Start of the day (00:00:00.000)
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const payments = await collections.payments
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .toArray();

    let todayGrossMinorUnits = 0;
    let cashMinorUnits = 0;
    let coinsMinorUnits = 0;
    let onlineMinorUnits = 0;

    const customerSpendMap = new Map<string, { name: string; username: string; minorUnits: number }>();

    for (const p of payments) {
      todayGrossMinorUnits += p.amountMinorUnits;
      const method = (p.method || 'cash').toLowerCase();

      if (method === 'coins' || method === 'coin' || method === 'coin-slot') {
        coinsMinorUnits += p.amountMinorUnits;
      } else if (method === 'gcash' || method === 'maya' || method === 'online') {
        onlineMinorUnits += p.amountMinorUnits;
      } else {
        cashMinorUnits += p.amountMinorUnits;
      }

      if (p.customerId) {
        const existing = customerSpendMap.get(p.customerId) || {
          name: p.customerName || 'Customer',
          username: p.customerUsername || p.customerId,
          minorUnits: 0
        };
        existing.minorUnits += p.amountMinorUnits;
        customerSpendMap.set(p.customerId, existing);
      }
    }

    const topCustomers = Array.from(customerSpendMap.values())
      .sort((a, b) => b.minorUnits - a.minorUnits)
      .slice(0, 5)
      .map((c) => ({
        name: c.name,
        username: c.username,
        totalPhp: `₱${(c.minorUnits / 100).toFixed(2)}`
      }));

    // Active & today's sessions
    const sessionsToday = await collections.sessions.countDocuments({
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });

    const totalPcs = await collections.pcs.countDocuments();
    const inUsePcs = await collections.pcs.countDocuments({ status: 'in-use' });

    // Unsettled open-time tabs
    const unsettledAuths = await collections.openTimeAuths.find({ isSettled: false }).toArray();
    const unsettledOpenTimeMinorUnits = unsettledAuths.reduce(
      (sum: number, a: any) => sum + (a.currentAccruedMinorUnits || 0),
      0
    );

    const dateStr = targetDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return {
      dateStr,
      todayGrossMinorUnits,
      todayGrossPhp: `₱${(todayGrossMinorUnits / 100).toFixed(2)}`,
      transactionCount: payments.length,
      breakdown: {
        cashMinorUnits,
        cashPhp: `₱${(cashMinorUnits / 100).toFixed(2)}`,
        coinsMinorUnits,
        coinsPhp: `₱${(coinsMinorUnits / 100).toFixed(2)}`,
        onlineMinorUnits,
        onlinePhp: `₱${(onlineMinorUnits / 100).toFixed(2)}`
      },
      sessionsCount: sessionsToday,
      totalPcs,
      inUsePcs,
      unsettledOpenTimeMinorUnits,
      unsettledOpenTimePhp: `₱${(unsettledOpenTimeMinorUnits / 100).toFixed(2)}`,
      topCustomers
    };
  }

  public static generateEmailHtml(data: DailySalesData): string {
    const topCustomersHtml =
      data.topCustomers.length > 0
        ? data.topCustomers
            .map(
              (c, idx) => `
              <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #f8fafc; font-weight: 600;">
                  #${idx + 1} ${c.name} <span style="color:#06b6d4; font-size:0.85em;">(@${c.username})</span>
                </td>
                <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #10b981; font-weight: 800; text-align: right; font-family: monospace;">
                  ${c.totalPhp}
                </td>
              </tr>
            `
            )
            .join('')
        : `<tr><td colspan="2" style="padding:16px; text-align:center; color:#94a3b8;">Walay transaksyon gikan sa registered players karon.</td></tr>`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Artemia's Pisonet Daily Sales Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #07090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #07090e; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 600px; background: #0f172a; border: 1px solid #1e293b; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.7);">
          
          <!-- Cyber Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #06b6d4, #2563eb); padding: 28px 24px; text-align: center;">
              <div style="display: inline-block; background: rgba(0,0,0,0.25); border-radius: 12px; padding: 8px 16px; margin-bottom: 8px; font-weight: 900; letter-spacing: 0.1em; color: #fff; font-size: 0.85rem; text-transform: uppercase;">
                ⚡ ARTEMIA'S PISONET CYBER CAFE
              </div>
              <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 1.85rem; font-weight: 900; letter-spacing: -0.02em;">
                Adlawang Halin & Sales Report
              </h1>
              <p style="margin: 6px 0 0; color: #e2e8f0; font-size: 0.95rem;">
                ${data.dateStr}
              </p>
            </td>
          </tr>

          <!-- Hero Total Revenue -->
          <tr>
            <td style="padding: 28px 24px 20px; text-align: center;">
              <div style="background: #141f32; border: 1px solid rgba(6, 182, 212, 0.35); border-radius: 16px; padding: 24px 20px;">
                <div style="font-size: 0.82rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
                  TOTAL GROSS REVENUE TODAY
                </div>
                <div style="font-size: 3.2rem; font-weight: 900; color: #22d3ee; line-height: 1; font-family: monospace;">
                  ${data.todayGrossPhp}
                </div>
                <div style="margin-top: 10px; font-size: 0.88rem; color: #cbd5e1;">
                  Total of <strong>${data.transactionCount} transactions</strong> recorded today
                </div>
              </div>
            </td>
          </tr>

          <!-- Payment Breakdown -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <h3 style="font-size: 0.95rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 0 0 12px;">
                💰 Payment Breakdown (Mga Gipasulod nga Kwarta)
              </h3>
              
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: separate; border-spacing: 8px 0;">
                <tr>
                  <td width="33%" style="background: #1e293b; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">💵 Counter Cash</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #f8fafc; margin-top: 4px; font-family: monospace;">
                      ${data.breakdown.cashPhp}
                    </div>
                  </td>
                  <td width="33%" style="background: #1e293b; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">🪙 Coin Slots</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #fbbf24; margin-top: 4px; font-family: monospace;">
                      ${data.breakdown.coinsPhp}
                    </div>
                  </td>
                  <td width="33%" style="background: #1e293b; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; text-transform: uppercase; font-weight: 700;">📱 GCash / Maya</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #06b6d4; margin-top: 4px; font-family: monospace;">
                      ${data.breakdown.onlinePhp}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Operational Fleet Stats -->
          <tr>
            <td style="padding: 0 24px 24px;">
              <div style="background: #141f32; border: 1px solid #1e293b; border-radius: 14px; padding: 16px 20px;">
                <h4 style="margin: 0 0 10px; font-size: 0.85rem; text-transform: uppercase; color: #94a3b8; font-weight: 800; letter-spacing: 0.05em;">
                  🖥️ Operational Fleet Activity
                </h4>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="4" style="font-size: 0.88rem;">
                  <tr>
                    <td style="color: #94a3b8;">Total Sessions Started Today:</td>
                    <td style="color: #f8fafc; font-weight: 700; text-align: right;">${data.sessionsCount} sessions</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8;">Terminal Fleet Utilization:</td>
                    <td style="color: #f8fafc; font-weight: 700; text-align: right;">${data.inUsePcs} / ${data.totalPcs} PCs active</td>
                  </tr>
                  <tr>
                    <td style="color: #94a3b8;">Unsettled Open-Time Accruals:</td>
                    <td style="color: #f43f5e; font-weight: 800; text-align: right; font-family: monospace;">${data.unsettledOpenTimePhp}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Top Spenders Today -->
          <tr>
            <td style="padding: 0 24px 28px;">
              <h3 style="font-size: 0.95rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin: 0 0 12px;">
                🏆 Top Customer Spenders Karon
              </h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #141f32; border-radius: 14px; overflow: hidden; border: 1px solid #1e293b;">
                ${topCustomersHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #090e18; padding: 20px 24px; text-align: center; border-top: 1px solid #1e293b; font-size: 0.78rem; color: #64748b;">
              <p style="margin: 0;">
                Kini nga report awtomatikong gi-compile ug gi-send sa <strong>Artemia's Pisonet Cloud Management System</strong>.
              </p>
              <p style="margin: 6px 0 0; color: #475569;">
                Timestamp: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })} (PHT)
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  public static async sendDailySalesReport(options: {
    recipientEmail?: string;
    manualTriggerBy?: string;
  } = {}): Promise<{ success: boolean; message: string; previewOnly?: boolean }> {
    if (DailyReportEmailService.isSending) {
      return { success: false, message: 'Email sending currently in progress. Please wait.' };
    }

    DailyReportEmailService.isSending = true;

    try {
      const config = await DailyReportEmailService.getInternalConfig();
      const recipient = options.recipientEmail || config.recipientEmail;

      if (!recipient) {
        return { success: false, message: 'No recipient email configured. Please enter an email address in settings.' };
      }

      const salesData = await DailyReportEmailService.compileDailySalesData();
      const htmlBody = DailyReportEmailService.generateEmailHtml(salesData);
      const subject = `[Artemia's Pisonet] Daily Sales Report — ${salesData.dateStr} (${salesData.todayGrossPhp})`;

      // Check if SMTP is configured
      if (!config.smtpUser || !config.smtpPass) {
        console.log(`[EmailReport] SMTP credentials not set. Compiled report for ${recipient}: Gross ${salesData.todayGrossPhp}, ${salesData.transactionCount} transactions.`);
        
        // Log audit
        await AuditService.log(
          'DAILY_SALES_REPORT_COMPILED',
          `Daily sales report compiled for ${recipient} (Gross: ${salesData.todayGrossPhp}). SMTP not configured yet.`,
          options.manualTriggerBy || 'system',
          'Staff',
          'staff'
        );

        return {
          success: true,
          previewOnly: true,
          message: `Report compiled successfully for ${recipient} (Gross: ${salesData.todayGrossPhp}). To receive live emails directly in your inbox, please provide your Gmail / SMTP App Password in the Admin Reports Settings.`
        };
      }

      // Configure nodemailer transporter
      const transporter = nodemailer.createTransport({
        host: config.smtpHost || 'smtp.gmail.com',
        port: config.smtpPort || 587,
        secure: config.smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: config.fromEmail || '"Artemia\'s Pisonet" <reports@artemiapisonet.com>',
        to: recipient,
        subject,
        html: htmlBody
      });

      console.log(`[EmailReport] Live sales report successfully sent to ${recipient}. MessageId: ${info.messageId}`);

      // Update lastSentDate to avoid duplicate automated sends
      const collections = getCollections();
      const todayStr = new Date().toISOString().slice(0, 10);
      await collections.systemSettings.updateOne(
        { _id: 'email_report_config' },
        { $set: { lastSentDate: todayStr, updatedAt: new Date() } },
        { upsert: true }
      );

      await AuditService.log(
        'DAILY_SALES_EMAIL_SENT',
        `Daily sales report sent to ${recipient} (Gross: ${salesData.todayGrossPhp}).`,
        options.manualTriggerBy || 'system',
        'Staff',
        'staff'
      );

      return {
        success: true,
        message: `Success! Daily sales report email sent to ${recipient} (${salesData.todayGrossPhp}).`
      };
    } catch (err: any) {
      console.error('[EmailReport] Error sending daily email report:', err);
      return {
        success: false,
        message: `Failed to dispatch email: ${err.message || 'Unknown SMTP error'}`
      };
    } finally {
      DailyReportEmailService.isSending = false;
    }
  }

  // -------------------------------------------------------------
  // Automated Daily Scheduler (Checks every 60s for 10:00 PM)
  // -------------------------------------------------------------
  public static startDailyScheduler(): void {
    if (DailyReportEmailService.schedulerInterval) {
      clearInterval(DailyReportEmailService.schedulerInterval);
    }

    console.log('[EmailReport] Daily sales email scheduler started.');

    DailyReportEmailService.schedulerInterval = setInterval(async () => {
      try {
        const config = await DailyReportEmailService.getInternalConfig();
        if (!config.enabled) return;

        // Current time in Asia/Manila (Philippine Time)
        const now = new Date();
        const phtFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });

        const parts = phtFormatter.formatToParts(now);
        const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
        const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
        const year = parts.find((p) => p.type === 'year')?.value || '';
        const month = parts.find((p) => p.type === 'month')?.value || '';
        const day = parts.find((p) => p.type === 'day')?.value || '';
        const todayStr = `${year}-${month}-${day}`;

        // If time matches configured send hour & minute (e.g. 22:00 / 10:00 PM) and not sent today yet
        if (hour === config.sendHour && minute === config.sendMinute && config.lastSentDate !== todayStr) {
          console.log(`[EmailReport] Automated 10:00 PM trigger fired for ${todayStr}. Sending daily report...`);
          await DailyReportEmailService.sendDailySalesReport();
        }
      } catch (err) {
        console.error('[EmailReport] Scheduler check error:', err);
      }
    }, 60000); // 60 seconds
  }

  public static stopDailyScheduler(): void {
    if (DailyReportEmailService.schedulerInterval) {
      clearInterval(DailyReportEmailService.schedulerInterval);
      DailyReportEmailService.schedulerInterval = null;
      console.log('[EmailReport] Daily sales email scheduler stopped.');
    }
  }
}
