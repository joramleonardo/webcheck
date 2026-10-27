<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/**
 * 24/7 Automated Server-Side Website Monitor
 * Runs every minute in the background via Laravel scheduler, logging status & heartbeats.
 */
Schedule::command('websites:check')
    ->everyMinute()
    ->withoutOverlapping(5) // Prevents duplicate scans if a previous run is still finishing
    ->appendOutputTo(storage_path('logs/monitor.log'));
