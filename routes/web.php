<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CronMonitorController;
use App\Http\Controllers\StatusPageController;
use App\Http\Controllers\WebsiteMonitorController;
use Illuminate\Support\Facades\Route;

// Public status page (Default landing page)
Route::get('/', [StatusPageController::class, 'index'])->name('status.public');
Route::get('/status', [StatusPageController::class, 'index']);
Route::get('/api/status', [StatusPageController::class, 'api'])->name('status.api');

// Webhook / Web-Cron 24/7 trigger for external services or cPanel curl
Route::match(['get', 'post'], '/api/cron/check', [CronMonitorController::class, 'handle'])->name('api.cron.check');

// Authentication Routes
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'create'])->name('login');
    Route::post('/login', [AuthController::class, 'store'])->name('login.store');
});

Route::post('/logout', [AuthController::class, 'destroy'])->name('logout')->middleware('auth');

// Private Admin / NOC Dashboard (Requires Authentication)
Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [WebsiteMonitorController::class, 'index'])->name('dashboard');
    Route::post('/check-all', [WebsiteMonitorController::class, 'checkAll'])->name('websites.check-all');
    Route::post('/websites/{website}/check', [WebsiteMonitorController::class, 'checkSingle'])->name('websites.check');
    Route::post('/websites', [WebsiteMonitorController::class, 'store'])->name('websites.store');
    Route::put('/websites/{website}', [WebsiteMonitorController::class, 'update'])->name('websites.update');
    Route::patch('/websites/{website}/toggle-pin', [WebsiteMonitorController::class, 'togglePin'])->name('websites.toggle-pin');
    Route::delete('/websites/{website}', [WebsiteMonitorController::class, 'destroy'])->name('websites.destroy');
});
