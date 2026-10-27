# DOST-STII WebCheck

<p align="center">
  <strong>Institutional Uptime, Latency, Incident Tracking &amp; SSL Integrity Monitoring System</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-11.x-FF2D20?style=flat-square&logo=laravel&logoColor=white" alt="Laravel 11" />
  <img src="https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Inertia.js-2.x-9553E9?style=flat-square&logo=inertia&logoColor=white" alt="Inertia.js" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/PHP-8.2+-777BB4?style=flat-square&logo=php&logoColor=white" alt="PHP 8.2+" />
  <img src="https://img.shields.io/badge/Tests-36%20Passed-brightgreen?style=flat-square" alt="Tests" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
</p>

---

## Overview

**DOST-STII WebCheck** is a dedicated availability, incident management, and SSL certificate monitoring platform built for the **Department of Science and Technology - Science and Technology Information Institute (DOST-STII)**.

It continuously tracks the uptime, latency, SSL expiration, and content integrity of critical government portals (such as *STARBOOKS*, *Science.ph*, *S&T Post*, and *DOSTv*) as well as internal agency systems, ensuring high availability and transparency.

---

## Key Features

### 1. Public Institutional Status Page (`/` or `/status`)
* **Real-Time Health Status**: Live status banner showing whether all systems are operational or experiencing disruptions.
* **Category Health Strip**: Instant summary cards displaying operational ratios, disruptions, and latency metrics across categories.
* **Pinned & Categorized View**: Organizes critical portals into customizable sections (*Pinned Portals*, *Public Portals*, *Internal Systems*).
* **Classified Incident History**: Past outages and disruptions grouped by month with duration, error classification tags, and incident timeline.
* **Interactive Telemetry Drawer**: Slide-over panel with 24-hour response time charts, uptime percentages, and check records.
* **Executive Availability Briefing**: One-click clipboard copy of availability summaries formatted for executive reporting.
* **Official Print/PDF Filing (Ctrl+P)**: Clean, print-optimized layout for agency documentation and COA audit compliance.
* **Audio Alerts & Auto-Refresh**: Sound alarm toggles on incident detection and customizable countdown timers (1m, 5m, 10m).

### 2. Administrator & NOC Dashboard (`/dashboard`)
* **Protected Access**: Role-based protection via Laravel authentication (`/login`).
* **Monitor Management**: Full CRUD for adding, updating, and removing monitored endpoints.
* **Internal/Public Visibility Toggle**: Restrict sensitive intranet tools (HRIS, ERMS) to admin-only view while keeping public portals visible.
* **Content Integrity Verification**: Validates expected page keywords to catch blank pages or unauthorized defacements even if HTTP status is 200.
* **SSL Certificate Watchdog**: Tracks issuer, expiration dates, and remaining days with early warnings.
* **Custom Latency Thresholds**: Configure response time expectations per service (e.g., 5,000ms standard vs 8,000ms for media-heavy portals).
* **Smart Anti-Flapping Retry**: Automatically retries failed checks before registering an outage, avoiding false alarms caused by transient network hiccups.
* **Immediate Scans**: Concurrently check all sites with one click.

### 3. 24/7 Automated Background Engine
* **Cron / Scheduler**: Native execution every minute via `php artisan schedule:run`.
* **Daemon Worker**: Built-in background watcher via `php artisan websites:watch`.
* **Tokenized Web-Cron Endpoint**: `/api/cron/check?token=...` for external monitoring services or cPanel curl triggers.
* **Opportunistic Catch-up**: Performs an automatic background check on visit if scheduled scans were interrupted.

---

## Tech Stack

* **Backend**: Laravel 11 (PHP 8.2+)
* **Frontend**: React 19, Inertia.js v2, TypeScript
* **Styling**: Tailwind CSS v4, Lucide Icons, Custom Anakiwa Light Palette (`#0F6D95`, `#1188B8`, `#1FA9D8`, `#BFE8F8`, `#0D3144`)
* **Database**: MySQL / MariaDB (production) / SQLite (testing)
* **Testing**: PHPUnit (36 Feature & Unit Tests)

---

## Getting Started

### Prerequisites
* PHP 8.2 or higher (with `curl`, `pdo_mysql`, `openssl`, `mbstring`, `zip`)
* Composer
* Node.js (v18+) and npm
* MySQL / MariaDB

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/joramleonardo/webcheck.git
   cd webcheck
   ```

2. **Install PHP and Node dependencies:**
   ```bash
   composer install
   npm install
   ```

3. **Configure the environment file:**
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```

4. **Set up database credentials in `.env`:**
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=webcheck
   DB_USERNAME=root
   DB_PASSWORD=your_password
   ```

5. **Run migrations and seeders:**
   ```bash
   php artisan migrate --seed
   ```
   *(This creates the database tables, default monitored portals, and provisions the initial `admin` account).*

6. **Build frontend assets:**
   ```bash
   npm run build
   # or for active development:
   npm run dev
   ```

7. **Start local development server:**
   ```bash
   php artisan serve
   ```
   Visit `http://localhost:8000` to view the Public Status Page.

---

## Default Administrator Credentials

To access the NOC Dashboard (`/dashboard`), log in at `/login`:

* **Username:** `admin` (or `admin@webcheck.local`)
* **Password:** `admin`

*(We recommend changing the default password upon initial deployment).*

---

## 24/7 Background Monitoring Setup

### Option 1: Linux Crontab (Recommended for VPS / Dedicated Server)
Open the crontab editor:
```bash
crontab -e
```
Add the following line (runs every minute):
```bash
* * * * * cd /path/to/your/webcheck && php artisan schedule:run >> /dev/null 2>&1
```

### Option 2: Shared Hosting / cPanel / Hostinger Cron
In your hosting control panel (hPanel / cPanel), set up a 1-minute Cron Job:
```bash
curl -s "https://yourdomain.com/api/cron/check?token=webcheck_hostinger_secure_token_2026" > /dev/null 2>&1
```

### Option 3: Continuous Daemon Process
To run as a persistent systemd service or background daemon:
```bash
php artisan websites:watch
```

---

## Testing

Run the full automated test suite:
```bash
php artisan test
```

### Test Coverage includes:
* **Anti-Flapping Logic**: Verifies transient failure recovery and confirms persistent outages.
* **Authentication & Redirection**: Tests guest restrictions, login flows, and session invalidation.
* **Category & Pinning**: Validates sectioning, custom thresholds, and ordering.
* **SSL & Keyword Integrity**: Confirms certificate validation and keyword-match detection.
* **Cron & Scheduler**: Ensures API endpoints and background triggers execute reliably.

---

## Deployment on Shared Hosting (Hostinger / cPanel)

1. Ensure root `.htaccess` is present to route traffic to `/public`:
   ```apache
   <IfModule mod_rewrite.c>
       RewriteEngine On
       RewriteRule ^\.env - [F,L,NC]
       RewriteRule ^(app|bootstrap|config|database|resources|routes|storage|tests|vendor)/ - [F,L,NC]
       RewriteCond %{REQUEST_URI} !^/public/
       RewriteRule ^(.*)$ public/$1 [L]
   </IfModule>
   ```
2. Import `database/hostinger_webcheck.sql` in phpMyAdmin.
3. Configure database credentials in `.env`.
4. Ensure `storage/` and `bootstrap/cache/` directories are writable (`775` or `755`).

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
