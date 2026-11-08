import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AdminStateService } from '../../services/admin-state.service';
import { PC, FileEntry } from '@pisonet/shared';

@Component({
  selector: 'app-file-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="file-manager-container">
      <!-- Header -->
      <div class="page-header-row">
        <div>
          <h1 class="page-title">
            <span class="icon">📁</span>
            <span>Remote File Manager & Storage Cleaner</span>
          </h1>
          <p class="page-subtitle">
            Browse drives (C:, D:), inspect files, delete corrupted game data, and clean junk files remotely across client PCs.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-warning" (click)="openCleanJunkModal()">
            <span>🧹</span>
            <span>Clean Junk (%TEMP%)</span>
          </button>
        </div>
      </div>

      <!-- Station Selector Bar -->
      <div class="station-selector-card">
        <div class="selector-label">Target Station:</div>
        <div class="station-pills">
          <button
            *ngFor="let pc of state.pcs"
            type="button"
            class="station-pill"
            [ngClass]="{'active': selectedPcId === pc.id, 'offline': pc.status === 'offline'}"
            (click)="selectStation(pc.id)"
          >
            <span class="dot" [ngClass]="pc.status"></span>
            <span class="name">{{ pc.name }}</span>
            <span class="ip">{{ pc.ipAddress }}</span>
          </button>
        </div>
      </div>

      <!-- Quick Drives & Path Navigation -->
      <div class="explorer-card" *ngIf="selectedPc">
        <div class="explorer-toolbar">
          <div class="drive-shortcuts">
            <button class="drive-btn" [ngClass]="{'active': currentPath === 'C:\\\\' || currentPath === 'C:'}" (click)="navigateTo('C:\\\\')">C: Drive</button>
            <button class="drive-btn" [ngClass]="{'active': currentPath.startsWith('D:')}" (click)="navigateTo('D:\\\\')">D: Games</button>
            <button class="drive-btn" (click)="navigateTo('C:\\\\Users')">Users</button>
            <button class="drive-btn" (click)="navigateTo('C:\\\\Windows\\\\Temp')">Windows Temp</button>
            <button class="drive-btn" (click)="navigateTo('D:\\\\Games')">D:\\Games</button>
          </div>

          <div class="path-bar">
            <button class="btn-icon" (click)="navigateUp()" [disabled]="isRootPath" title="Up one folder">⬆</button>
            <input type="text" class="path-input" [(ngModel)]="currentPath" (keyup.enter)="loadDirectory()" placeholder="e.g. C:\\ or D:\\Games" />
            <button class="btn-refresh" (click)="loadDirectory()" [disabled]="isLoading">
              {{ isLoading ? 'Loading...' : '🔄 Go' }}
            </button>
          </div>
        </div>

        <!-- Feedback alert -->
        <div *ngIf="feedbackMessage" class="feedback-banner" [ngClass]="feedbackType">
          <span>{{ feedbackMessage }}</span>
          <button class="close-btn" (click)="feedbackMessage = null">✕</button>
        </div>

        <!-- Files & Folders Table -->
        <div class="table-container">
          <table class="file-table">
            <thead>
              <tr>
                <th style="width: 44px;"></th>
                <th>Name</th>
                <th style="width: 140px;">Size</th>
                <th style="width: 180px;">Date Modified</th>
                <th style="width: 100px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="isLoading">
                <td colspan="5" class="loading-state">
                  <span class="spinner"></span>
                  <span>Fetching files from {{ selectedPc.name }}...</span>
                </td>
              </tr>

              <tr *ngIf="!isLoading && entries.length === 0">
                <td colspan="5" class="empty-state">
                  <span>📂</span>
                  <div>No files or folder is empty in {{ currentPath }}</div>
                </td>
              </tr>

              <tr *ngFor="let item of entries" class="file-row">
                <td class="icon-col">
                  <span *ngIf="item.isDirectory" class="folder-icon">📁</span>
                  <span *ngIf="!item.isDirectory" class="file-icon">📄</span>
                </td>
                <td class="name-col">
                  <a *ngIf="item.isDirectory" href="javascript:void(0)" class="folder-link" (click)="openFolder(item)">
                    {{ item.name }}
                  </a>
                  <span *ngIf="!item.isDirectory" class="file-name">
                    {{ item.name }}
                  </span>
                </td>
                <td class="size-col">
                  {{ item.isDirectory ? '--' : formatFileSize(item.sizeBytes) }}
                </td>
                <td class="date-col">
                  {{ item.modifiedAt | date:'short' }}
                </td>
                <td class="action-col">
                  <button
                    class="btn-delete"
                    (click)="confirmDelete(item)"
                    title="Delete permanently from client machine"
                  >
                    🗑️ Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div *ngIf="deleteTarget" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">Confirm Delete</h3>
            <button class="btn-close" (click)="deleteTarget = null">✕</button>
          </div>
          <div class="modal-body">
            <p>Sigurado ka nga gusto nimo papason kining {{ deleteTarget.isDirectory ? 'folder' : 'file' }} sa <strong>{{ selectedPc?.name }}</strong>?</p>
            <div class="delete-target-path">{{ deleteTarget.path }}</div>
            <p class="warning-text">⚠️ <strong>Pahinumdom:</strong> Permanente kining mawala sa storage sa maong PC unit.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="deleteTarget = null">Cancel</button>
            <button class="btn btn-danger" [disabled]="isDeleting" (click)="executeDelete()">
              {{ isDeleting ? 'Deleting...' : 'Yes, Delete Permanently' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Clean Junk Modal -->
      <div *ngIf="showCleanJunkModal" class="modal-backdrop">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3 class="modal-title">🧹 Clean Junk & Temp Files</h3>
            <button class="btn-close" (click)="showCleanJunkModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p>Pilion kung asa nga PC i-execute ang paglimpyo sa temporary files, browser cache, dump files, ug prefetch:</p>
            
            <div class="form-group" style="margin-top: 14px;">
              <label class="form-label">Target Station</label>
              <select class="form-select" [(ngModel)]="cleanTargetScope">
                <option value="all">⚡ Tanan PC (Entire Fleet)</option>
                <option *ngFor="let p of state.pcs" [value]="p.id">🖥️ {{ p.name }} ({{ p.ipAddress }})</option>
              </select>
            </div>

            <div class="cleanup-preview-box">
              <div class="preview-item">✓ %TEMP% and C:\\Windows\\Temp junk files</div>
              <div class="preview-item">✓ Empty Windows Recycle Bin</div>
              <div class="preview-item">✓ Chromium / Chrome browser cache</div>
              <div class="preview-item">✓ Crash dump logs and obsolete installers</div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCleanJunkModal = false">Cancel</button>
            <button class="btn btn-warning" [disabled]="isCleaning" (click)="executeCleanJunk()">
              {{ isCleaning ? 'Cleaning...' : 'Start Deep Clean Now' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .file-manager-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .page-title {
      font-size: 1.75rem;
      font-weight: 800;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 6px 0;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      font-size: 0.88rem;
      color: #94a3b8;
      margin: 0;
      max-width: 800px;
    }
    .station-selector-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .selector-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .station-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .station-pill {
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 8px 14px;
      color: #e5e7eb;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .station-pill:hover {
      background: #374151;
      border-color: #4b5563;
    }
    .station-pill.active {
      background: rgba(6, 182, 212, 0.15);
      border-color: #06b6d4;
      color: #22d3ee;
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.25);
    }
    .station-pill .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
    }
    .station-pill .dot.offline {
      background: #f43f5e;
    }
    .station-pill .ip {
      color: #64748b;
      font-size: 0.75rem;
      font-family: monospace;
    }
    .explorer-card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      overflow: hidden;
    }
    .explorer-toolbar {
      padding: 16px 20px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .drive-shortcuts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .drive-btn {
      background: #0f172a;
      border: 1px solid #334155;
      color: #cbd5e1;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .drive-btn:hover, .drive-btn.active {
      background: #0284c7;
      border-color: #38bdf8;
      color: #fff;
    }
    .path-bar {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .btn-icon {
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .path-input {
      flex: 1;
      background: #0f172a;
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 8px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.88rem;
    }
    .path-input:focus {
      outline: none;
      border-color: #06b6d4;
    }
    .btn-refresh {
      background: #06b6d4;
      color: #0f172a;
      font-weight: 700;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
    }
    .table-container {
      overflow-x: auto;
    }
    .file-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      color: #cbd5e1;
    }
    .file-table th {
      background: #0f172a;
      padding: 12px 16px;
      text-align: left;
      font-weight: 700;
      color: #94a3b8;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #1e293b;
    }
    .file-table td {
      padding: 12px 16px;
      border-bottom: 1px solid #1f2937;
    }
    .file-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .folder-link {
      color: #38bdf8;
      font-weight: 600;
      text-decoration: none;
    }
    .folder-link:hover {
      text-decoration: underline;
    }
    .btn-delete {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.3);
      color: #fb7185;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-delete:hover {
      background: #f43f5e;
      color: #fff;
    }
    .loading-state, .empty-state {
      text-align: center;
      padding: 48px;
      color: #64748b;
    }
    .feedback-banner {
      padding: 12px 16px;
      margin: 12px 20px 0 20px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .feedback-banner.success {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #34d399;
    }
    .feedback-banner.error {
      background: rgba(244, 63, 94, 0.15);
      border: 1px solid rgba(244, 63, 94, 0.35);
      color: #fb7185;
    }
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    }
    .modal-dialog {
      background: #111827;
      border: 1px solid #374151;
      border-radius: 12px;
      width: 100%;
      max-width: 520px;
      padding: 24px;
      color: #fff;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .modal-title {
      font-size: 1.25rem;
      font-weight: 700;
      margin: 0;
    }
    .btn-close {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.2rem;
      cursor: pointer;
    }
    .delete-target-path {
      background: #030712;
      border: 1px solid #1f2937;
      padding: 10px 14px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.82rem;
      color: #38bdf8;
      word-break: break-all;
      margin: 12px 0;
    }
    .warning-text {
      color: #fb7185;
      font-size: 0.84rem;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .btn-warning {
      background: #f59e0b;
      color: #0f172a;
    }
    .btn-danger {
      background: #e11d48;
      color: #fff;
    }
    .btn-secondary {
      background: #374151;
      color: #e5e7eb;
    }
    .cleanup-preview-box {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 14px;
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 0.82rem;
      color: #10b981;
    }
    .form-select {
      width: 100%;
      background: #030712;
      border: 1px solid #374151;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
    }
  `]
})
export class FileManagerComponent implements OnInit, OnDestroy {
  state: any = { pcs: [] };
  private sub!: Subscription;

  selectedPcId: string = 'pc-01';
  currentPath: string = 'C:\\\\';
  entries: FileEntry[] = [];
  isLoading = false;

  feedbackMessage: string | null = null;
  feedbackType: 'success' | 'error' = 'success';

  deleteTarget: FileEntry | null = null;
  isDeleting = false;

  showCleanJunkModal = false;
  cleanTargetScope = 'all';
  isCleaning = false;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
      if (!this.selectedPc && this.state.pcs?.length > 0) {
        this.selectedPcId = this.state.pcs[0].id;
      }
    });
    this.loadDirectory();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get selectedPc(): PC | undefined {
    return this.state.pcs?.find((p: PC) => p.id === this.selectedPcId);
  }

  get isRootPath(): boolean {
    return this.currentPath === 'C:\\\\' || this.currentPath === 'D:\\\\' || this.currentPath === 'C:' || this.currentPath === 'D:';
  }

  selectStation(pcId: string) {
    this.selectedPcId = pcId;
    this.loadDirectory();
  }

  navigateTo(path: string) {
    this.currentPath = path;
    this.loadDirectory();
  }

  navigateUp() {
    const parts = this.currentPath.replace(/\\\\$/, '').split(/\\\\|\//);
    if (parts.length <= 1) {
      this.currentPath = 'C:\\\\';
    } else {
      parts.pop();
      this.currentPath = parts.join('\\\\') || 'C:\\\\';
      if (!this.currentPath.endsWith('\\\\') && this.currentPath.length === 2) {
        this.currentPath += '\\\\';
      }
    }
    this.loadDirectory();
  }

  openFolder(item: FileEntry) {
    this.currentPath = item.path;
    this.loadDirectory();
  }

  async loadDirectory() {
    if (!this.selectedPcId) return;
    this.isLoading = true;
    try {
      this.entries = await this.adminState.browseDirectory(this.selectedPcId, this.currentPath);
    } finally {
      this.isLoading = false;
    }
  }

  confirmDelete(item: FileEntry) {
    this.deleteTarget = item;
  }

  async executeDelete() {
    if (!this.deleteTarget || !this.selectedPcId) return;
    this.isDeleting = true;
    try {
      const res = await this.adminState.deleteRemoteFile(this.selectedPcId, this.deleteTarget.path);
      if (res.success) {
        this.feedbackMessage = `Successfully deleted: ${this.deleteTarget.name}`;
        this.feedbackType = 'success';
        this.deleteTarget = null;
        await this.loadDirectory();
      } else {
        this.feedbackMessage = res.message || 'Failed to delete file.';
        this.feedbackType = 'error';
      }
    } finally {
      this.isDeleting = false;
    }
  }

  openCleanJunkModal() {
    this.cleanTargetScope = this.selectedPcId || 'all';
    this.showCleanJunkModal = true;
  }

  async executeCleanJunk() {
    this.isCleaning = true;
    try {
      const res = await this.adminState.cleanTempFiles(this.cleanTargetScope);
      this.showCleanJunkModal = false;
      this.feedbackMessage = res.message || 'Junk files cleaned successfully.';
      this.feedbackType = 'success';
      if (this.currentPath.toLowerCase().includes('temp')) {
        await this.loadDirectory();
      }
    } finally {
      this.isCleaning = false;
    }
  }

  formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
