import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminStateService } from '../../services/admin-state.service';
import { SystemConnectionStatus } from '@pisonet/shared';

@Component({
  selector: 'app-connection-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-backdrop">
      <div class="modal-dialog" style="max-width:580px;">
        <div class="modal-header">
          <div>
            <h3 class="modal-title-text">Network Health & Connection Diagnostics</h3>
            <span style="font-size:0.75rem; color:var(--accent-emerald); font-weight:700;">
              MONGODB ATLAS & REAL-TIME WEBSOCKETS
            </span>
          </div>
          <button class="btn btn-sm btn-secondary" (click)="close.emit()">✕</button>
        </div>

        <div class="modal-body">
          <div class="callout-info" style="margin-bottom:18px;">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="flex-shrink:0;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <strong>Shop Server Continuity Requirement</strong>
              <div>In a physical pisonet/cybercafe, a local shop server runs 24/7 on the local LAN. If connection drops, clients enter a 60-second grace buffer before desktop locking to prevent data loss.</div>
            </div>
          </div>

          <!-- Current Telemetry Status -->
          <div style="background:var(--bg-surface); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle); margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:0.85rem; color:var(--text-dim);">Current Status:</span>
              <span class="status-indicator" [ngClass]="currentStatusClass">
                <span class="dot" [ngClass]="{'pulse': state.connection.status === 'reconnecting'}"></span>
                <span style="font-weight:800;">{{ state.connection.status | uppercase }}</span>
              </span>
            </div>

            <div *ngIf="state.connection.status === 'disconnected'" style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:0.85rem;">
              <span style="color:var(--text-dim);">Grace Period Countdown:</span>
              <span style="font-family:var(--font-mono); font-weight:800; color:var(--accent-rose); font-size:1.15rem;">
                {{ state.connection.gracePeriodRemainingSeconds }}s remaining
              </span>
            </div>
          </div>

          <!-- Simulation Trigger Buttons -->
          <div class="form-label" style="margin-bottom:10px;">Select Outage / Recovery State to Trigger:</div>
          <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px;">
            <button
              class="btn"
              [ngClass]="state.connection.status === 'connected' ? 'btn-primary' : 'btn-secondary'"
              (click)="triggerState('connected')"
            >
              🟢 Backend Connected (Normal)
            </button>

            <button
              class="btn"
              [ngClass]="state.connection.status === 'disconnected' ? 'btn-primary' : 'btn-secondary'"
              (click)="triggerState('disconnected')"
            >
              🔴 Backend Disconnected (Grace 60s)
            </button>

            <button
              class="btn"
              [ngClass]="state.connection.status === 'database_unavailable' ? 'btn-primary' : 'btn-secondary'"
              (click)="triggerState('database_unavailable')"
            >
              ⚠️ Database Unavailable
            </button>

            <button
              class="btn"
              [ngClass]="state.connection.status === 'reconnecting' ? 'btn-primary' : 'btn-secondary'"
              (click)="triggerState('reconnecting')"
            >
              🔄 Reconnecting Handshake
            </button>

            <button
              class="btn"
              style="grid-column:span 2;"
              [ngClass]="state.connection.status === 'recovered' ? 'btn-primary' : 'btn-secondary'"
              (click)="triggerState('recovered')"
            >
              ✅ Recovery Complete & Reconcile
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="close.emit()">Close Simulator</button>
        </div>
      </div>
    </div>
  `
})
export class ConnectionModalComponent {
  @Output() close = new EventEmitter<void>();

  constructor(public adminState: AdminStateService) {}

  get state() {
    return this.adminState.state;
  }

  get currentStatusClass(): string {
    const s = this.state.connection.status;
    if (s === 'connected' || s === 'recovered') return 'connected';
    if (s === 'reconnecting') return 'reconnecting';
    return 'disconnected';
  }

  triggerState(status: SystemConnectionStatus) {
    this.adminState.simulateConnection(status);
  }
}
