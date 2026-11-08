import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PisonetAppState, PC, PCStatus } from '@pisonet/shared';

@Component({
  selector: 'app-pcs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="pcs-view">
      <!-- Header -->
      <div class="section-header-row">
        <div>
          <h2 class="section-title">
            <span>Terminal Inventory & Hardware Fleet</span>
            <span class="nav-badge">{{ state.pcs.length }} Configured</span>
          </h2>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-top:2px;">
            Hardware identifiers, connection status telemetry, and simulated Wake-on-LAN controls.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openRegisterPcModal()">
          + Register New PC
        </button>
      </div>

      <!-- Plug and Play Auto-Discovery Banner -->
      <div class="callout-info" style="margin-bottom:20px; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08);">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:#34d399; flex-shrink:0;">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div>
          <strong style="color:#34d399;">Plug & Play Auto-Discovery Active</strong>
          <div style="color:#cbd5e1; font-size:0.82rem; margin-top:2px;">
            Dili na kinahanglan mag-manomano og add o register! Inig install o abli sa Artemia Fleet Agent sa bisan asang PC sa shop, automatic kining mo-rehistro ug mo-gawas dayon dinhi sa imong dashboard.
          </div>
        </div>
      </div>

      <!-- PC Inventory Table -->
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Station Name</th>
              <th>Identifier</th>
              <th>IP Address</th>
              <th>MAC Address</th>
              <th>Status</th>
              <th>Connection State</th>
              <th>Hardware Specs</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngIf="!state.pcs || state.pcs.length === 0">
              <td colspan="8" style="text-align:center; padding: 48px 20px; color: #64748b;">
                <div style="font-size: 2.2rem; margin-bottom: 8px;">🖥️</div>
                <div style="font-weight: 800; color: #f1f5f9; font-size: 1.1rem;">Walay PC Stations nga Nakalista (Clean Slate)</div>
                <p style="font-size: 0.85rem; color: #94a3b8; margin-top: 6px; max-width: 480px; margin-left: auto; margin-right: auto; line-height: 1.5;">
                  Na-reset na ang database. I-abli lang ang <strong>Artemia Fleet Agent</strong> sa imong mga client PC aron awtomatiko silang motungha dinhi nga walay manomano nga setup!
                </p>
              </td>
            </tr>
            <tr *ngFor="let pc of state.pcs; trackBy: trackByPcId">
              <td>
                <div style="font-weight:800; color:#fff;">{{ pc.name }}</div>
                <div *ngIf="pc.activeCustomerName" style="font-size:0.75rem; color:var(--accent-cyan);">
                  👤 In Use: {{ pc.activeCustomerName }}
                </div>
              </td>
              <td style="font-family:var(--font-mono); font-size:0.82rem;">
                {{ pc.identifier }}
              </td>
              <td style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">
                {{ pc.ipAddress }}
              </td>
              <td style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-dim);">
                {{ pc.macAddress }}
              </td>
              <td>
                <span class="status-badge" [ngClass]="pc.status">
                  <span class="dot"></span>
                  <span>{{ pc.status | uppercase }}</span>
                </span>
              </td>
              <td>
                <span class="status-indicator" [ngClass]="pc.connectionState === 'connected' ? 'connected' : 'disconnected'">
                  <span class="dot"></span>
                  <span>{{ pc.connectionState | uppercase }}</span>
                </span>
              </td>
              <td style="font-size:0.78rem; color:var(--text-dim); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                {{ pc.specs || 'Standard' }}
              </td>
              <td style="text-align:right;">
                <div style="display:inline-flex; gap:6px;">
                  <button class="btn btn-sm btn-secondary" (click)="openEditModal(pc)">
                    Edit
                  </button>
                  <button
                    class="btn btn-sm"
                    [ngClass]="pc.status === 'offline' ? 'btn-success' : 'btn-secondary'"
                    (click)="toggleOnlineOffline(pc)"
                  >
                    {{ pc.status === 'offline' ? 'Online' : 'Offline' }}
                  </button>
                  <button
                    *ngIf="pc.status === 'offline'"
                    class="btn btn-sm btn-primary"
                    [disabled]="pc.isPendingWake"
                    (click)="handleWakeOnLan(pc)"
                  >
                    {{ pc.isPendingWake ? 'Pinging...' : '⚡ Send WOL' }}
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    style="padding:4px 8px; font-size:0.75rem;"
                    (click)="handleDeletePc(pc)"
                    title="Delete Station"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Modal: Register PC -->
      <div *ngIf="showRegisterModal" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Register New PC Terminal</h3>
            <button class="btn btn-sm btn-secondary" (click)="showRegisterModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">PC Display Name *</label>
              <input type="text" class="form-input" style="width:100%;" placeholder="e.g. PC 11" [(ngModel)]="newPcName" />
            </div>
            <div class="form-group">
              <label class="form-label">Identifier (Hostname) *</label>
              <input type="text" class="form-input" style="width:100%;" placeholder="e.g. STATION-11-VIP" [(ngModel)]="newPcIdentifier" />
            </div>
            <div class="form-group">
              <label class="form-label">Static Local IP *</label>
              <input type="text" class="form-input" style="width:100%;" placeholder="e.g. 192.168.1.111" [(ngModel)]="newPcIp" />
            </div>
            <div class="form-group">
              <label class="form-label">Ethernet MAC Address *</label>
              <input type="text" class="form-input" style="width:100%;" placeholder="e.g. 00:1B:44:11:3A:C1" [(ngModel)]="newPcMac" />
            </div>
            <div class="form-group">
              <label class="form-label">Hardware Specifications (Optional)</label>
              <input type="text" class="form-input" style="width:100%;" placeholder="e.g. Ryzen 7 5700X • RTX 3070 • 32GB RAM" [(ngModel)]="newPcSpecs" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showRegisterModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="!newPcName || !newPcIdentifier || !newPcIp || !newPcMac" (click)="confirmRegisterPc()">
              Save & Register Terminal
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Edit PC -->
      <div *ngIf="editPc" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title-text">Edit {{ editPc.name }}</h3>
            <button class="btn btn-sm btn-secondary" (click)="editPc = null">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">PC Display Name</label>
              <input type="text" class="form-input" style="width:100%;" [(ngModel)]="editName" />
            </div>
            <div class="form-group">
              <label class="form-label">Identifier</label>
              <input type="text" class="form-input" style="width:100%;" [(ngModel)]="editIdentifier" />
            </div>
            <div class="form-group">
              <label class="form-label">IP Address</label>
              <input type="text" class="form-input" style="width:100%;" [(ngModel)]="editIp" />
            </div>
            <div class="form-group">
              <label class="form-label">MAC Address</label>
              <input type="text" class="form-input" style="width:100%;" [(ngModel)]="editMac" />
            </div>
            <div class="form-group">
              <label class="form-label">Hardware Specifications</label>
              <input type="text" class="form-input" style="width:100%;" [(ngModel)]="editSpecs" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="editPc = null">Cancel</button>
            <button class="btn btn-primary" (click)="confirmEditPc()">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pcs-view {
      /* Keep container stationary */
    }
  `]
})
export class PcsComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  trackByPcId(index: number, pc: PC): string {
    return pc.id;
  }

  showRegisterModal = false;
  newPcName = '';
  newPcIdentifier = '';
  newPcIp = '';
  newPcMac = '';
  newPcSpecs = '';

  editPc: PC | null = null;
  editName = '';
  editIdentifier = '';
  editIp = '';
  editMac = '';
  editSpecs = '';

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.adminState.syncFromBackend();
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  openRegisterPcModal() {
    const nextNum = (this.state.pcs.length + 1).toString().padStart(2, '0');
    this.newPcName = `PC ${nextNum}`;
    this.newPcIdentifier = `STATION-${nextNum}-GAMING`;
    this.newPcIp = `192.168.1.${100 + this.state.pcs.length + 1}`;
    this.newPcMac = `00:1B:44:11:3A:C${this.state.pcs.length + 1}`;
    this.newPcSpecs = 'Ryzen 5 5600X • RTX 3060 12GB • 16GB RAM';
    this.showRegisterModal = true;
  }

  async confirmRegisterPc() {
    await this.adminState.registerPc(
      this.newPcName,
      this.newPcIdentifier,
      this.newPcIp,
      this.newPcMac,
      this.newPcSpecs
    );
    this.showRegisterModal = false;
  }

  async handleDeletePc(pc: PC) {
    if (confirm(`Are you sure you want to permanently delete station "${pc.name}" (${pc.identifier})?`)) {
      await this.adminState.deletePc(pc.id);
    }
  }

  openEditModal(pc: PC) {
    this.editPc = pc;
    this.editName = pc.name;
    this.editIdentifier = pc.identifier;
    this.editIp = pc.ipAddress;
    this.editMac = pc.macAddress;
    this.editSpecs = pc.specs || '';
  }

  confirmEditPc() {
    if (!this.editPc) return;
    this.adminState.updatePc(this.editPc.id, {
      name: this.editName,
      identifier: this.editIdentifier,
      ipAddress: this.editIp,
      macAddress: this.editMac,
      specs: this.editSpecs
    });
    this.editPc = null;
  }

  async toggleOnlineOffline(pc: PC) {
    const next: PCStatus = pc.status === 'offline' ? 'available' : 'offline';
    pc.status = next;
    pc.connectionState = next === 'available' ? 'connected' : 'disconnected';
    await this.adminState.togglePcStatus(pc.id, next);
  }

  async handleWakeOnLan(pc: PC) {
    (pc as any).isPendingWake = true;
    try {
      await this.adminState.simulateWakeOnLan(pc.id);
    } finally {
      setTimeout(() => {
        (pc as any).isPendingWake = false;
        pc.status = 'available';
        pc.connectionState = 'connected';
      }, 1000);
    }
  }
}
