import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminStateService } from './services/admin-state.service';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { CustomersComponent } from './components/customers/customers.component';
import { TimeCreditsComponent } from './components/time-credits/time-credits.component';
import { SessionsComponent } from './components/sessions/sessions.component';
import { PcsComponent } from './components/pcs/pcs.component';
import { ReportsComponent } from './components/reports/reports.component';
import { CustomerPreviewComponent } from './components/customer-preview/customer-preview.component';
import { PisonetAppState } from '@pisonet/shared';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    LoginComponent,
    DashboardComponent,
    CustomersComponent,
    TimeCreditsComponent,
    SessionsComponent,
    PcsComponent,
    ReportsComponent,
    CustomerPreviewComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  state!: PisonetAppState;
  private sub!: Subscription;

  activeNav: 'dashboard' | 'customers' | 'time-credits' | 'sessions' | 'pcs' | 'reports' | 'customer-preview' = 'dashboard';
  mobileSidebarOpen = false;
  showConnectionModal = false;
  showResetConfirmModal = false;

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

  setActiveNav(nav: 'dashboard' | 'customers' | 'time-credits' | 'sessions' | 'pcs' | 'reports' | 'customer-preview') {
    this.activeNav = nav;
    this.mobileSidebarOpen = false;
  }

  toggleMobileSidebar() {
    this.mobileSidebarOpen = !this.mobileSidebarOpen;
  }

  handleLogout() {
    this.adminState.logoutStaff();
  }



  get activeSessionsCount(): number {
    return this.state?.sessions?.filter((s) => s.status === 'active').length || 0;
  }
}
