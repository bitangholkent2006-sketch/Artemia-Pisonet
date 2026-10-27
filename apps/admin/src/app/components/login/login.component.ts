import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminStateService } from '../../services/admin-state.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrapper">
      <div class="login-mesh-bg"></div>

      <div class="login-card">
        <!-- Brand & Security Header -->
        <div class="login-header">
          <div class="login-brand-icon">
            <span>AP</span>
            <div class="brand-glow-ring"></div>
          </div>
          <h1 class="login-title">Artemia's Pisonet</h1>
          <p class="login-sub">Staff & Operations Management Console</p>
          
          <div class="cloud-status-badge">
            <span class="status-dot"></span>
            <span>MongoDB Atlas Cloud • Real-Time Engine Active</span>
          </div>
        </div>

        <form (ngSubmit)="handleLogin()" class="login-form">
          <!-- Username -->
          <div class="form-group">
            <label class="form-label" for="admin-user">Staff / Admin Username</label>
            <div class="input-icon-wrapper">
              <svg class="input-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <input
                id="admin-user"
                type="text"
                class="form-input"
                [(ngModel)]="username"
                name="username"
                placeholder="e.g. artemia_admin"
                autocomplete="username"
                required
              />
            </div>
          </div>

          <!-- Password -->
          <div class="form-group">
            <div class="label-row">
              <label class="form-label" for="admin-pass">Security Password</label>
            </div>
            <div class="input-icon-wrapper">
              <svg class="input-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <input
                id="admin-pass"
                [type]="showPassword ? 'text' : 'password'"
                class="form-input"
                style="padding-right: 68px;"
                [(ngModel)]="password"
                name="password"
                placeholder="Enter admin password"
                autocomplete="current-password"
                required
              />
              <button
                type="button"
                class="toggle-pass-btn"
                (click)="showPassword = !showPassword"
              >
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <!-- Error Alert Banner -->
          <div *ngIf="errorMessage" class="error-banner">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            class="login-submit-btn"
            [disabled]="isLoading || !username || !password"
          >
            <span *ngIf="!isLoading">Sign In to Dashboard</span>
            <span *ngIf="isLoading" class="btn-loading-state">
              <span class="spinner"></span> Verifying Credentials...
            </span>
          </button>
        </form>

        <div class="login-footer-info">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--accent-cyan);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Root Administrator: <code>artemia_admin</code> • Encrypted Session</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      position: relative;
      z-index: 2;
    }
    .login-mesh-bg {
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 30%, rgba(6, 182, 212, 0.12) 0%, transparent 60%),
                  radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 50%);
      pointer-events: none;
    }
    .login-card {
      width: 100%;
      max-width: 460px;
      background: rgba(22, 30, 46, 0.85);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(36, 48, 68, 0.8);
      border-radius: 20px;
      padding: 40px 36px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(6, 182, 212, 0.08);
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .login-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent-cyan), #818cf8, var(--accent-emerald));
    }
    .login-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .login-brand-icon {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%);
      color: white;
      font-weight: 800;
      font-size: 1.35rem;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px auto;
      box-shadow: 0 0 25px rgba(6, 182, 212, 0.35);
      position: relative;
    }
    .login-title {
      font-size: 1.65rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.025em;
    }
    .login-sub {
      font-size: 0.88rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .cloud-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      margin-top: 14px;
      padding: 4px 12px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 100px;
      font-size: 0.72rem;
      font-weight: 600;
      color: #34d399;
      letter-spacing: 0.02em;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulseDot 2s infinite ease-in-out;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-label {
      display: block;
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .input-icon-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }
    .input-icon {
      position: absolute;
      left: 14px;
      color: #64748b;
      pointer-events: none;
    }
    .form-input {
      width: 100%;
      padding: 13px 14px 13px 42px;
      background: #0f172a;
      border: 1px solid #243044;
      border-radius: 10px;
      color: #f8fafc;
      font-size: 0.92rem;
      font-family: inherit;
      transition: all 0.2s ease;
    }
    .form-input:focus {
      outline: none;
      border-color: #06b6d4;
      box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15);
      background: #131c31;
    }
    .toggle-pass-btn {
      position: absolute;
      right: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 4px 8px;
      color: #94a3b8;
      font-size: 0.74rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s;
    }
    .toggle-pass-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .error-banner {
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.35);
      border-radius: 8px;
      padding: 11px 14px;
      color: #fb7185;
      font-size: 0.84rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .login-submit-btn {
      width: 100%;
      padding: 15px 20px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 12px;
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
      color: white;
      font-size: 0.98rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 22px rgba(6, 182, 212, 0.4);
      user-select: none;
    }
    .login-submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 10px 32px rgba(6, 182, 212, 0.65);
      filter: brightness(1.1);
    }
    .login-submit-btn:active:not(:disabled) {
      transform: translateY(1px) scale(0.99);
    }
    .login-submit-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      filter: grayscale(0.5);
      transform: none;
      box-shadow: none;
    }
    .btn-loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .login-footer-info {
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 0.76rem;
      color: #64748b;
    }
    .login-footer-info code {
      color: #22d3ee;
      background: rgba(34, 211, 238, 0.1);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-weight: 600;
    }
  `]
})
export class LoginComponent {
  @Output() loggedIn = new EventEmitter<void>();

  username = '';
  password = '';
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  constructor(private adminState: AdminStateService) {}

  async handleLogin() {
    this.errorMessage = '';
    this.isLoading = true;

    try {
      const res = await this.adminState.loginStaff(this.username, this.password);
      this.isLoading = false;
      if (res.success) {
        this.loggedIn.emit();
      } else {
        this.errorMessage = res.error || 'Invalid username or password.';
      }
    } catch (err: any) {
      this.isLoading = false;
      this.errorMessage = err.message || 'Connection error. Ensure backend is running.';
    }
  }
}
