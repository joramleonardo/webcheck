<?php

namespace App\Http\Controllers;

use App\Services\WebsiteMonitorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class CronMonitorController extends Controller
{
    /**
     * Webhook / Web-Cron Endpoint for external cron services or cPanel curl triggers.
     * Accessible via GET or POST to /api/cron/check?token=YOUR_TOKEN
     */
    public function handle(Request $request, WebsiteMonitorService $service): JsonResponse
    {
        $configuredToken = config('services.monitor.cron_token') ?: env('MONITOR_CRON_TOKEN');

        // If a secret token is configured, enforce security
        if (!empty($configuredToken)) {
            $providedToken = $request->query('token')
                ?: $request->header('X-Cron-Token')
                ?: $request->bearerToken();

            if (!hash_equals($configuredToken, (string) $providedToken)) {
                return response()->json([
                    'success' => false,
                    'error'   => 'Unauthorized: Invalid or missing cron token.',
                ], 401);
            }
        }

        $startTime = microtime(true);

        try {
            $sites = $service->checkAll();
            $total = $sites->count();
            $upCount = $sites->where('last_is_up', true)->count();
            $downCount = $total - $upCount;
            $durationMs = (int) round((microtime(true) - $startTime) * 1000);

            return response()->json([
                'success'     => true,
                'message'     => "WebCheck scan completed: {$upCount}/{$total} UP, {$downCount} DOWN.",
                'checked_at'  => now()->toIso8601String(),
                'duration_ms' => $durationMs,
                'summary'     => [
                    'total'       => $total,
                    'operational' => $upCount,
                    'disrupted'   => $downCount,
                ],
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => 'Scan failed: ' . $e->getMessage(),
            ], 500);
        }
    }
}

