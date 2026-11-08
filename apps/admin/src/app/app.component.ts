import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminStateService } from './services/admin-state.service';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { FileManagerComponent } from './components/file-manager/file-manager.component';
import { GameUpdaterComponent } from './components/game-updater/game-updater.component';
import { TaskManagerComponent } from './components/task-manager/task-manager.component';
import { RemoteTerminalComponent } from './components/remote-terminal/remote-terminal.component';
import { ScreenViewComponent } from './components/screen-view/screen-view.component';
import { PcsComponent } from './components/pcs/pcs.component';
import { PisonetAppState } from '@pisonet/shared';

export type NavTab = 
  | 'dashboard'
  | 'game-updater'
  | 'file-manager'
  | 'task-manager'
  | 'remote-terminal'
  | 'screen-view'
  | 'pcs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LoginComponent,
    DashboardComponent,
    FileManagerComponent,
    GameUpdaterComponent,
    TaskManagerComponent,
    RemoteTerminalComponent,
    ScreenViewComponent,
    PcsComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  activeNav: NavTab = 'dashboard';
  mobileSidebarOpen = false;
  showConnectionModal = false;
  showResetConfirmModal = false;
  targetStationId?: string;

  constructor(public adminState: AdminStateService) {}

  ngOnInit() {
    this.sub = this.adminState.state$.subscribe((s) => {
      this.state = s;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get isAuthenticated(): boolean {
    return this.state?.activeAuth?.isAuthenticated ?? false;
  }

  get currentUser() {
    return this.state?.activeAuth?.currentUser;
  }

  get userRole(): string {
    return this.state?.activeAuth?.role || 'staff';
  }

  setActiveNav(nav: NavTab, pcId?: string) {
    this.activeNav = nav;
    if (pcId) {
      this.targetStationId = pcId;
    }
    this.mobileSidebarOpen = false;
  }

  onNavigateTab(event: { tab: string; pcId?: string }) {
    this.setActiveNav(event.tab as NavTab, event.pcId);
  }

  toggleMobileSidebar() {
    this.mobileSidebarOpen = !this.mobileSidebarOpen;
  }

  handleLogout() {
    this.adminState.logoutStaff();
  }

  get onlineCount(): number {
    return this.state?.pcs?.filter((p) => p.status !== 'offline').length || 0;
  }
}
