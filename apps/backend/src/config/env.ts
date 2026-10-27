import dotenv from 'dotenv';
import path from 'path';

// Load .env from root or apps/backend
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'apps/backend/.env') });
dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  nodeEnv: string;
  isProduction: boolean;
  mongoUri: string;
  mongoDbName: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  adminOrigin: string[];
  electronOrigin: string[];
  sessionLeaseDurationSeconds: number;
  disconnectGracePeriodSeconds: number;
}

const rawAdminOrigin = process.env.ADMIN_ORIGIN || 'http://localhost:4200,https://pisonet-admin.onrender.com';
const rawElectronOrigin = process.env.ELECTRON_ORIGIN || 'http://localhost:5173,app://-,file://-';

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/artemias_pisonet',
  mongoDbName: process.env.MONGODB_DB_NAME || 'artemias_pisonet',
  jwtSecret: process.env.JWT_SECRET || 'artemias-pisonet-super-secure-production-jwt-key-32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  adminOrigin: rawAdminOrigin.split(',').map((o) => o.trim()),
  electronOrigin: rawElectronOrigin.split(',').map((o) => o.trim()),
  sessionLeaseDurationSeconds: parseInt(process.env.SESSION_LEASE_SECONDS || '90', 10),
  disconnectGracePeriodSeconds: parseInt(process.env.DISCONNECT_GRACE_SECONDS || '60', 10)
};
