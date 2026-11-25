<?php

namespace App\Http\Controllers;

use App\Models\Website;
use App\Models\WebsiteCheck;
use App\Services\WebsiteMonitorService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
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

        $websiteIds = $websites->pluck('id')->all();
        $thirtyDaysAgo = $now->copy()->subDays(30);

        // 1. Fetch only the last 40 checks per website for the heartbeat strip (bounded to 40 per site)
        $recentChecksByWebsite = [];
        foreach ($websiteIds as $wid) {
            $recentChecksByWebsite[$wid] = WebsiteCheck::where('website_id', $wid)
                ->select(['id', 'website_id', 'is_up', 'http_code', 'response_time', 'attempts', 'was_retried', 'keyword_found', 'error', 'created_at'])
                ->orderByDesc('id')
                ->limit(40)
                ->get()
                ->reverse()
                ->values();
        }

        // 2. Aggregate 24h & 7d statistics directly in the database to prevent loading hundreds of thousands of rows
        $stats24h = !empty($websiteIds) ? DB::table('website_checks')
            ->whereIn('website_id', $websiteIds)
            ->where('created_at', '>=', $oneDayAgo)
            ->selectRaw('
                website_id,
                COUNT(*) as total_count,
                SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) as up_count,
                AVG(CASE WHEN is_up = 1 AND response_time > 0 THEN response_time ELSE NULL END) as avg_latency,
                MIN(CASE WHEN is_up = 1 AND response_time > 0 THEN response_time ELSE NULL END) as min_latency,
                MAX(CASE WHEN is_up = 1 AND response_time > 0 THEN response_time ELSE NULL END) as max_latency
            ')
            ->groupBy('website_id')
            ->get()
            ->keyBy('website_id') : collect();

        $stats7d = !empty($websiteIds) ? DB::table('website_checks')
            ->whereIn('website_id', $websiteIds)
            ->where('created_at', '>=', $sevenDaysAgo)
            ->selectRaw('
                website_id,
                COUNT(*) as total_count,
                SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) as up_count
            ')
            ->groupBy('website_id')
            ->get()
            ->keyBy('website_id') : collect();

        // 3. Query ONLY actual downtime checks (is_up = false) in the last 30 days to build incidents
        $downtimeChecks = !empty($websiteIds) ? DB::table('website_checks')
            ->whereIn('website_id', $websiteIds)
            ->where('is_up', false)
            ->where('created_at', '>=', $thirtyDaysAgo)
            ->select(['id', 'website_id', 'http_code', 'error', 'created_at'])
            ->orderBy('created_at', 'asc')
            ->get()
            ->groupBy('website_id') : collect();

        $allPublicIncidents = [];
        $incidentsByWebsite = [];

        foreach ($websites as $site) {
            $siteDownChecks = $downtimeChecks->get($site->id, collect());
            $incidents = [];
            $currentIncident = null;

            foreach ($siteDownChecks as $check) {
                $checkTime = Carbon::parse($check->created_at);

                if (!$currentIncident) {
                    $currentIncident = [
                        'website_id'       => $site->id,
                        'website_name'     => $site->name,
                        'started_at'       => $checkTime->toIso8601String(),
                        'ended_at'         => null,
                        'duration_minutes' => 1,
                        'error'            => $check->error ?: 'Unresponsive or Keyword Error',
                        'http_code'        => $check->http_code,
                        'is_ongoing'       => false,
                        '_last_check_time' => $checkTime,
                    ];
                } else {
                    $lastTime = $currentIncident['_last_check_time'];
                    // If checks are within 5 minutes, consider it the same continuous incident
                    if ($checkTime->diffInMinutes($lastTime) <= 5) {
                        $startedAt = Carbon::parse($currentIncident['started_at']);
                        $currentIncident['duration_minutes'] = max(1, $checkTime->diffInMinutes($startedAt));
                        $currentIncident['_last_check_time'] = $checkTime;
                    } else {
                        // Conclude previous incident
                        $startedAt = Carbon::parse($currentIncident['started_at']);
                        $currentIncident['ended_at'] = $lastTime->copy()->addMinutes(1)->toIso8601String();
                        $currentIncident['duration_minutes'] = max(1, $lastTime->diffInMinutes($startedAt) + 1);
                        unset($currentIncident['_last_check_time']);
                        $incidents[] = $currentIncident;
                        $allPublicIncidents[] = $currentIncident;

                        // Start new incident
                        $currentIncident = [
                            'website_id'       => $site->id,
                            'website_name'     => $site->name,
                            'started_at'       => $checkTime->toIso8601String(),
                            'ended_at'         => null,
                            'duration_minutes' => 1,
                            'error'            => $check->error ?: 'Unresponsive or Keyword Error',
                            'http_code'        => $check->http_code,
                            'is_ongoing'       => false,
                            '_last_check_time' => $checkTime,
                        ];
                    }
                }
            }

            if ($currentIncident) {
                $lastTime = $currentIncident['_last_check_time'];
                $startedAt = Carbon::parse($currentIncident['started_at']);
                if ($site->last_is_up === false && $now->diffInMinutes($lastTime) <= 10) {
                    $currentIncident['is_ongoing'] = true;
                    $currentIncident['duration_minutes'] = max(1, $now->diffInMinutes($startedAt));
                } else {
                    $currentIncident['ended_at'] = $lastTime->copy()->addMinutes(1)->toIso8601String();
                    $currentIncident['duration_minutes'] = max(1, $lastTime->diffInMinutes($startedAt) + 1);
                }
                unset($currentIncident['_last_check_time']);
                $incidents[] = $currentIncident;
                $allPublicIncidents[] = $currentIncident;
            }

            $incidentsByWebsite[$site->id] = array_reverse($incidents);
        }

        $enrichedWebsites = $websites->map(function (Website $site) use ($recentChecksByWebsite, $stats24h, $stats7d, $incidentsByWebsite) {
            $recentChecks = $recentChecksByWebsite[$site->id] ?? collect();
            $s24 = $stats24h->get($site->id);
            $s7 = $stats7d->get($site->id);

            // 24-hour calculations
            $total24h = $s24 ? (int) $s24->total_count : 0;
            $up24h = $s24 ? (int) $s24->up_count : 0;
            $uptime24h = $total24h > 0
                ? round(($up24h / $total24h) * 100, 1)
                : ($site->last_is_up ? 100.0 : 0.0);

            $avgLatency24h = $s24 && !is_null($s24->avg_latency) ? (int) round($s24->avg_latency) : ($site->last_response_time ?: 0);
            $minLatency24h = $s24 && !is_null($s24->min_latency) ? (int) $s24->min_latency : ($site->last_response_time ?: 0);
            $maxLatency24h = $s24 && !is_null($s24->max_latency) ? (int) $s24->max_latency : ($site->last_response_time ?: 0);

            // 7-day uptime calculation
            $total7d = $s7 ? (int) $s7->total_count : 0;
            $up7d = $s7 ? (int) $s7->up_count : 0;
            $uptime7d = $total7d > 0
                ? round(($up7d / $total7d) * 100, 1)
                : $uptime24h;

            $incidents = $incidentsByWebsite[$site->id] ?? [];

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
                'ssl_valid'            => $site->ssl_valid !== null ? (bool) $site->ssl_valid : null,
                'ssl_issuer'           => $site->ssl_issuer,
                'ssl_expires_at'       => $site->ssl_expires_at ? $site->ssl_expires_at->toIso8601String() : null,
                'ssl_days_remaining'   => $site->ssl_days_remaining,
                'ssl_checked_at'       => $site->ssl_checked_at ? $site->ssl_checked_at->toIso8601String() : null,
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
                        'created_at'    => $c->created_at ? (is_string($c->created_at) ? Carbon::parse($c->created_at)->toIso8601String() : $c->created_at->toIso8601String()) : null,
                    ];
                })->all(),
                'incidents'            => $incidents,
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

