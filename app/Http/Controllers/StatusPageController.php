<?php

namespace App\Http\Controllers;

use App\Models\Website;
use App\Models\WebsiteCheck;
use App\Services\WebsiteMonitorService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class StatusPageController extends Controller
{
    /**
     * Render the public-facing status page (/status).
     */
    public function index(): Response
    {
        $data = $this->getStatusData();

        return Inertia::render('StatusPage', $data);
    }

    /**
     * Optional JSON endpoint for external widgets or status badges.
     */
    public function api(): JsonResponse
    {
        $data = $this->getStatusData();

        return response()->json($data);
    }

    /**
     * Opportunistic Auto-Catchup Check:
     * If the server cron was missed or site was closed, execute an on-the-fly scan
     * if the last recorded check in the database is older than 3 minutes.
     */
    protected function ensureRecentCheck(): void
    {
        if (app()->runningUnitTests()) {
            return;
        }

        $latestCheck = WebsiteCheck::latest('id')->first();
        if (!$latestCheck || ($latestCheck->created_at && $latestCheck->created_at->lt(now()->subMinutes(3)))) {
            if (!Cache::has('webcheck_running_scan')) {
                Cache::put('webcheck_running_scan', true, now()->addSeconds(30));
                try {
                    app(WebsiteMonitorService::class)->checkAll();
                } catch (Throwable $e) {
                    report($e);
                } finally {
                    Cache::forget('webcheck_running_scan');
                }
            }
        }
    }

    /**
     * Build public status data for active, public-facing services.
     */
    private function getStatusData(): array
    {
        $this->ensureRecentCheck();

        $now = now();
        $oneDayAgo = $now->copy()->subHours(24);
        $sevenDaysAgo = $now->copy()->subDays(7);

        // Fetch all active monitored websites (Public Portals prioritized first, then pinned items first)
        $websites = Website::where('is_active', true)
            ->orderByRaw("CASE WHEN category = 'Public Portals' THEN 1 WHEN category = 'Internal Systems' THEN 3 ELSE 2 END")
            ->orderBy('category')
            ->orderByDesc('is_pinned')
            ->orderBy('name')
            ->get();

        $websiteIds = $websites->pluck('id');

        $allRecentChecks = WebsiteCheck::whereIn('website_id', $websiteIds)
            ->orderBy('id', 'desc')
            ->get()
            ->groupBy('website_id');

        $allPublicIncidents = [];

        $enrichedWebsites = $websites->map(function (Website $site) use ($allRecentChecks, $oneDayAgo, $sevenDaysAgo, $now, &$allPublicIncidents) {
            $siteChecks = $allRecentChecks->get($site->id, collect());

            // Last 40 checks in chronological order
            $recentChecks = $siteChecks->take(40)->reverse()->values();

            // 24-hour calculations
            $checks24h = $siteChecks->filter(fn ($c) => $c->created_at >= $oneDayAgo);
            $total24h = $checks24h->count();
            $up24h = $checks24h->where('is_up', true)->count();
            $uptime24h = $total24h > 0
                ? round(($up24h / $total24h) * 100, 1)
                : ($site->last_is_up ? 100.0 : 0.0);

            $successful24h = $checks24h->where('is_up', true)->where('response_time', '>', 0);
            $avgLatency24h = $successful24h->isNotEmpty() ? (int) round($successful24h->avg('response_time')) : ($site->last_response_time ?: 0);
            $minLatency24h = $successful24h->isNotEmpty() ? (int) $successful24h->min('response_time') : ($site->last_response_time ?: 0);
            $maxLatency24h = $successful24h->isNotEmpty() ? (int) $successful24h->max('response_time') : ($site->last_response_time ?: 0);

            // 7-day uptime calculation
            $checks7d = $siteChecks->filter(fn ($c) => $c->created_at >= $sevenDaysAgo);
            $total7d = $checks7d->count();
            $up7d = $checks7d->where('is_up', true)->count();
            $uptime7d = $total7d > 0
                ? round(($up7d / $total7d) * 100, 1)
                : $uptime24h;

            // Incident History Calculation
            $chronologicalChecks = $siteChecks->reverse()->values();
            $incidents = [];
            $currentIncident = null;

            foreach ($chronologicalChecks as $check) {
                if (!$check->is_up) {
                    if (!$currentIncident) {
                        $currentIncident = [
                            'website_id'       => $site->id,
                            'website_name'     => $site->name,
                            'started_at'       => $check->created_at ? $check->created_at->toIso8601String() : null,
                            'ended_at'         => null,
                            'duration_minutes' => 1,
                            'error'            => $check->error ?: 'Unresponsive',
                            'is_ongoing'       => true,
                        ];
                    }
                } else {
                    if ($currentIncident) {
                        $endedAt = $check->created_at ?: $now;
                        $startedAt = Carbon::parse($currentIncident['started_at']);
                        $currentIncident['ended_at'] = $endedAt->toIso8601String();
                        $currentIncident['duration_minutes'] = max(1, $endedAt->diffInMinutes($startedAt));
                        $currentIncident['is_ongoing'] = false;
                        $incidents[] = $currentIncident;
                        $allPublicIncidents[] = $currentIncident;
                        $currentIncident = null;
                    }
                }
            }

            if ($currentIncident) {
                $startedAt = Carbon::parse($currentIncident['started_at']);
                $currentIncident['duration_minutes'] = max(1, $now->diffInMinutes($startedAt));
                $incidents[] = $currentIncident;
                $allPublicIncidents[] = $currentIncident;
            }

            $siteArray = [
                'id'                   => $site->id,
                'name'                 => $site->name,
                'url'                  => $site->url,
                'keyword'              => $site->keyword,
                'last_keyword_found'   => $site->last_keyword_found !== null ? (bool) $site->last_keyword_found : null,
                'last_error'           => $site->last_error,
                'category'             => $site->category ?? 'Public Portals',
                'timeout'              => $site->timeout ?? 20,
                'latency_threshold'    => $site->latency_threshold ?? 5000,
                'is_public'            => (bool) $site->is_public,
                'is_pinned'            => (bool) $site->is_pinned,
                'is_active'            => (bool) $site->is_active,
                'last_is_up'           => (bool) $site->last_is_up,
                'last_http_code'       => $site->last_http_code,
                'last_response_time'   => $site->last_response_time,
                'last_checked_at'      => $site->last_checked_at ? $site->last_checked_at->toIso8601String() : null,
                'consecutive_failures' => $site->consecutive_failures ?? 0,
                'uptime_24h'           => $uptime24h,
                'uptime_7d'            => $uptime7d,
                'avg_latency_24h'      => $avgLatency24h,
                'min_latency_24h'      => $minLatency24h,
                'max_latency_24h'      => $maxLatency24h,
                'recent_checks'        => $recentChecks->map(function ($c) {
                    return [
                        'id'            => $c->id,
                        'is_up'         => (bool) $c->is_up,
                        'http_code'     => $c->http_code,
                        'response_time' => $c->response_time,
                        'keyword_found' => $c->keyword_found !== null ? (bool) $c->keyword_found : null,
                        'attempts'      => $c->attempts ?? 1,
                        'was_retried'   => (bool) ($c->was_retried ?? false),
                        'error'         => $c->error,
                        'created_at'    => $c->created_at ? $c->created_at->toIso8601String() : null,
                    ];
                })->all(),
                'incidents'            => array_reverse($incidents),
            ];

            return $siteArray;
        });

        $total = $enrichedWebsites->count();
        $upCount = $enrichedWebsites->where('last_is_up', true)->count();
        $downCount = $enrichedWebsites->where('last_is_up', false)->count();

        $overallUptime = $total > 0
            ? round($enrichedWebsites->avg('uptime_24h'), 1)
            : 100.0;

        $measured = $enrichedWebsites->filter(fn ($s) => !is_null($s['last_response_time']) && $s['last_response_time'] > 0);
        $avgResponseTime = $measured->isNotEmpty()
            ? (int) round($measured->avg('last_response_time'))
            : 0;

        // Overall System Status Assessment
        if ($downCount === 0) {
            $systemStatus = [
                'state'       => 'operational',
                'title'       => 'All Systems Operational',
                'description' => 'All public portals and services are operating normally with optimal performance.',
            ];
        } elseif ($downCount === 1) {
            $systemStatus = [
                'state'       => 'degraded',
                'title'       => 'Partial Service Disruption',
                'description' => '1 public service is currently experiencing degraded availability or downtime.',
            ];
        } else {
            $systemStatus = [
                'state'       => 'major_outage',
                'title'       => 'Major Service Disruption',
                'description' => "{$downCount} public services are currently experiencing service interruptions.",
            ];
        }

        // Sort incidents descending by start time
        usort($allPublicIncidents, function ($a, $b) {
            return strcmp($b['started_at'] ?? '', $a['started_at'] ?? '');
        });

        $latestCheck = WebsiteCheck::latest('id')->first();
        $lastCheckedAt = $latestCheck?->created_at;
        $minutesAgo = $lastCheckedAt ? (int) $lastCheckedAt->diffInMinutes($now) : null;
        $isSchedulerHealthy = $lastCheckedAt && $lastCheckedAt->gte($now->copy()->subMinutes(6));

        return [
            'systemStatus' => $systemStatus,
            'websites'     => $enrichedWebsites->values()->all(),
            'stats'        => [
                'total'             => $total,
                'up'                => $upCount,
                'down'              => $downCount,
                'overall_uptime'    => $overallUptime,
                'avg_response_time' => $avgResponseTime,
            ],
            'recentIncidents' => array_slice($allPublicIncidents, 0, 10),
            'serverTime'      => $now->toIso8601String(),
            'schedulerStatus' => [
                'last_checked_at' => $lastCheckedAt?->toIso8601String(),
                'is_healthy'      => $isSchedulerHealthy,
                'minutes_ago'     => $minutesAgo,
            ],
        ];
    }
}

