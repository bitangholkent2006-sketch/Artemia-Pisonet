# Artemia's Pisonet Management System (Frontend Architecture)

A professional, high-reliability frontend suite for computer shop / cybercafe (pisonet) operations, engineered with **Angular 19** for the responsive staff admin portal and **Electron 34 + TypeScript + HTML/CSS** for the customer PC terminal client.

---

## 1. Monorepo Project Structure

```
artemias-pisonet/
├── apps/
│   ├── admin/                    # Responsive Angular 19 Staff Management Portal
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── components/   # Dashboard, Customers, Time Credits, Sessions, PCs, Reports, Kiosk Simulator
│   │   │   │   ├── services/     # Typed Admin state service wrapping shared state
│   │   │   │   ├── app.component.ts / html / css
│   │   │   └── styles.css        # Full dark cyberpunk design system
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── customer-desktop/         # Electron Windows Customer Desktop Terminal
│       ├── electron/
│       │   ├── main.ts           # Context-isolated Main process with compact overlay IPC
│       │   └── preload.ts        # Minimal safe preload bridge (window.pisonetDesktop)
│       ├── src/
│       │   ├── main.ts           # Customer terminal view logic, sound, drift-free timer
│       │   ├── styles.css        # Cyberpunk terminal styling, overlay widget, warnings
│       │   └── index.html
│       ├── package.json
│       └── vite.config.ts
├── packages/
│   └── shared/                   # Monorepo Shared Core
│       ├── src/
│       │   ├── models/           # Typed User, Customer, PC, Session, Pricing, Payment, Audit, Outage
│       │   ├── mock-data/        # Realistic seed data (active, available, offline, paused, open-time)
│       │   ├── services/         # Drift-free timestamp timer ticker, BroadcastChannel live bus
│       │   ├── utils/            # Minor currency unit (PHP ₱) and time formatting/calculation
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── .env.example
├── package.json                  # Root npm workspaces configuration
└── README.md
```

---

## 2. Technology Stack & Prerequisites

- **Node.js**: v20+ (Tested on v24.18.0)
- **NPM**: v10+ (Tested on v11.16.0)
- **Admin Website**: Angular 19, TypeScript, Vanilla CSS (BEM & Custom Design Tokens).
- **Customer Application**: Electron 34, TypeScript, HTML, CSS, Vite 6.
- **Development Environment**: Visual Studio Code on Windows.

---

## 3. Quick Start & Runnable Commands

From the workspace root directory:

### Install all dependencies across monorepo:
```bash
npm install
```

### Run Admin Portal (Angular):
```bash
npm run start:admin
```
The staff management website will be accessible at: **`http://localhost:4200`**

### Run Customer Desktop Client:

- **Browser Preview (Vite dev server)**:
  ```bash
  npm run dev:customer
  ```
  Accessible at: **`http://localhost:5173`**

- **Native Windows Electron Window**:
  ```bash
  npm run start:customer
  ```

### Production Build Verification:
```bash
# Build Admin website
npm run build:admin

# Build Customer Desktop (Renderer + Electron Main & Preload)
npm run build:customer

# Build everything
npm run build:all
```

---

## 4. Demo Accounts & Credentials

### Staff / Admin Accounts (Admin Website):
| Username | Password | Role | Permissions |
|---|---|---|---|
| `admin` | `admin123` | **Admin** | Full system access, pricing configuration, PC hardware setup, audit logs |
| `staff1` | `staff123` | **Staff** | Time credits top-up, customer registration, session controls |

> **Security Note:** Role checks in this phase are frontend UI simulations for workflow demonstration. Production deployment requires backend JWT cryptographic signature verification.

### Sample Customer Accounts:
| Username | Password | Status | Initial State |
|---|---|---|---|
| `juandc` | `juan123` | Active | **Juan dela Cruz** — Has 1h 15m remaining. Currently playing on PC 02. |
| `mariasantos`| `TempPass2026!` | Active | **Maria Santos** — Zero balance. Prompted for first-login password change! |
| `antonl` | `anton123` | Active | **Anton Lim** — Paused session with 40m preserved. PC released. Eligible to resume on any PC! |
| `carlor` | `carlo123` | Active | **Carlo Reyes** — Authorized for open-time gameplay. Accruing unbilled charges. |
| `markd` | `mark123` | **Suspended** | **Mark Dizon** — Account locked; blocked from logging into any station. |
| `elenar` | `elena123` | Active | **Elena Ramos** — 3 hours purchased credit; currently idle. |

---

## 5. System Workflow Verification Guide

Reviewers can verify all 11 core system workflows:

1. **Register a customer with zero starting balance**:
   - In Admin > Customers, click **+ Register Customer**. Enter Name and unique username. Note that new customers start with **0s balance** (registration alone does not grant time).
2. **Add a 60-minute purchase**:
   - In Admin > Time Credits, select the customer, pick **1 Hour** (₱20.00), choose Cash, and confirm.
3. **Start a session and simulate 20 minutes of play**:
   - Customer signs into any available PC (e.g. PC 01) and clicks **Start Playing**.
   - Use the **Demo Speed Multiplier (60x)** in the top bar to simulate 20 minutes in 20 seconds without browser timer drift!
4. **Pause with 40 minutes remaining**:
   - Customer clicks **Pause & Log Out**. Confirm modal. The exact remaining 40 minutes is saved to their account balance, and the PC is immediately released.
5. **Resume on another available PC without staff approval**:
   - On the customer terminal, change the station selector to **PC 04** (or any available PC).
   - Sign in as the same customer and click **Resume Playing**. The session resumes seamlessly!
6. **Reject a second active session for the same account**:
   - While a customer is active on PC 01, attempting to start another session on PC 04 is blocked with a clear validation alert: *"Only 1 active PC is allowed per account."*
7. **Add time during an active session**:
   - In Admin > Dashboard, click **+ Add Time** on an active PC. Select a package and credit it. The active customer's countdown timer instantly increases without logout.
8. **Expire a fixed-time session**:
   - Let an active session reach 0 seconds (speed up using 60x). The timer overlay displays low-time warnings at 10m, 5m, and 1m. At 0s, the session terminates, PC is released, and customer is returned to the login screen.
9. **Pause, resume, and settle an open-time session**:
   - In Admin > Sessions, click **Authorize Open-Time Play** for a customer.
   - Customer signs in and starts playing. Elapsed time and accrued charges accumulate.
   - Pausing stops accruals and releases the PC.
   - Click **Settle & Collect** in the Admin Open-Time Settle Desk. Authorization is permanently closed and cashier payment is recorded.
10. **Simulate disconnection and recovery**:
    - Click the connection status button in the top bar to open the **Connection Lab**.
    - Trigger **Backend Disconnected**. A 60-second grace period countdown starts. Active balances are protected. After 60s, access is blocked.
    - Trigger **Recovery Complete**. Reconciled balances allow eligible customers to resume immediately.
11. **Check desktop and mobile layouts**:
    - The admin portal features a responsive collapsible sidebar drawer with touch-friendly navigation, adaptive card grids, and mobile-friendly tables.

---

## 6. Demonstration Across the Two Interfaces

- **Real-Time Same-Device Synchronization**:
  Both the Admin portal and Customer application connect to a shared `BroadcastChannel` (`artemia-pisonet-sync-channel`) backed by local storage. When an action occurs in one view (e.g., adding time, starting a session, or pausing), all other open browser tabs and Electron windows re-render immediately.
- **Embedded Browser Customer Simulator**:
  The Admin portal includes a dedicated **Customer Terminal (Live)** tab allowing side-by-side verification right in the browser, while the native Electron desktop application can simultaneously run side-by-side.
- **Electron vs Browser Storage Separation**:
  In Electron, renderer processes share the same local storage partition under the application's origin schema. When testing in standard web browsers, standard same-origin `localStorage` is utilized.

---

## 7. Electron Security Boundaries

The Electron customer desktop application strictly enforces industry-standard security boundaries:
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- **Minimal Preload Bridge**:
  Exposes only restricted window controls (`minimize`, `maximize`, `close`, `toggleCompactMode`) and simulated telemetry (`getSystemInfo`) under `window.pisonetDesktop`.
- **Phase 2 Boundary**:
  Operating system-level kiosk locking, process restriction, physical PC shutdown, hardware Wake-on-LAN packets, and privileged Windows background services are designated for Phase 2 backend development.

---

## 8. Proposed Backend API & Real-Time Specifications (Phase 2 Target)

### RESTful Endpoints (Node.js + Hono):
- `POST /api/v1/auth/login`: Staff & customer authentication
- `POST /api/v1/auth/change-password`: First login password update
- `GET /api/v1/customers`: Search and list customer profiles
- `POST /api/v1/customers`: Customer registration
- `PATCH /api/v1/customers/:id/status`: Suspend or activate account
- `POST /api/v1/customers/:id/reset-password`: Issue temporary password
- `GET /api/v1/pcs`: List PC fleet status & telemetry
- `POST /api/v1/pcs/:id/wake`: Hardware Wake-on-LAN trigger
- `POST /api/v1/sessions/start`: Start fixed or open-time session
- `POST /api/v1/sessions/:id/pause`: Pause session & release PC
- `POST /api/v1/sessions/resume`: Resume session on any available PC
- `POST /api/v1/payments/purchase-time`: Record payment & credit time
- `POST /api/v1/open-time/authorize`: Grant open-time gameplay
- `POST /api/v1/open-time/:id/settle`: Settle accrued open-time charges
- `GET /api/v1/reports/daily-payments`: Aggregated daily payments
- `GET /api/v1/reports/audit-logs`: Filterable audit trails

### Socket.IO Real-Time Events:
- `client -> server`: `pc:heartbeat`, `pc:identify`, `session:tick`, `session:request-pause`, `session:request-resume`
- `server -> client`: `system:sync`, `pc:status-changed`, `pc:wake-result`, `session:started`, `session:paused`, `session:resumed`, `session:expired`, `customer:balance-updated`, `open-time:authorized`, `open-time:settled`, `account:status-changed`
