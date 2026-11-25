<?php

namespace App\Http\Controllers;

use App\Models\Website;
use App\Models\WebsiteCheck;
use App\Services\WebsiteMonitorService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class WebsiteMonitorController extends Controller
{
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
     * Display the monitoring dashboard.
     */
    public function index(): Response
    {
        $this->ensureRecentCheck();

        $now = now();
        $oneDayAgo = $now->copy()->subHours(24);
        $sevenDaysAgo = $now->copy()->subDays(7);

        // Fetch active websites (Public Portals prioritized first, then pinned items first)
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

                        // Start new incident
                        $currentIncident = [
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

            $siteArray = $site->toArray();
            $siteArray['recent_checks'] = $recentChecks->map(function ($c) {
                return [
                    'id'            => $c->id,
                    'is_up'         => (bool) $c->is_up,
                    'http_code'     => $c->http_code,
                    'response_time' => $c->response_time,
                    'attempts'      => $c->attempts ?? 1,
                    'was_retried'   => (bool) ($c->was_retried ?? false),
                    'error'         => $c->error,
                    'created_at'    => $c->created_at ? (is_string($c->created_at) ? Carbon::parse($c->created_at)->toIso8601String() : $c->created_at->toIso8601String()) : null,
                ];
            })->all();

            $siteArray['uptime_24h'] = $uptime24h;
            $siteArray['uptime_7d'] = $uptime7d;
            $siteArray['avg_latency_24h'] = $avgLatency24h;
            $siteArray['min_latency_24h'] = $minLatency24h;
            $siteArray['max_latency_24h'] = $maxLatency24h;
            $siteArray['incidents'] = $incidents;

            return $siteArray;
        });

        $total = $enrichedWebsites->count();
        $upCount = $enrichedWebsites->where('last_is_up', true)->count();
        $downCount = $enrichedWebsites->where('last_is_up', false)->count();
        $pendingCount = $enrichedWebsites->whereNull('last_is_up')->count();

        $overallUptime = $total > 0
            ? round($enrichedWebsites->avg('uptime_24h'), 1)
            : 100.0;

        $measured = $enrichedWebsites->filter(fn ($s) => !is_null($s['last_response_time']) && $s['last_response_time'] > 0);
        $avgResponseTime = $measured->isNotEmpty()
            ? (int) round($measured->avg('last_response_time'))
            : 0;

        $sslExpiringSoon = $enrichedWebsites->filter(fn ($s) => !is_null($s['ssl_days_remaining']) && $s['ssl_days_remaining'] <= 30 && $s['ssl_days_remaining'] >= 0)->count();
        $sslExpired = $enrichedWebsites->filter(fn ($s) => !is_null($s['ssl_days_remaining']) && $s['ssl_days_remaining'] < 0)->count();

        $latestCheck = WebsiteCheck::latest('id')->first();
        $lastCheckedAt = $latestCheck?->created_at;
        $minutesAgo = $lastCheckedAt ? (int) $lastCheckedAt->diffInMinutes($now) : null;
        $isSchedulerHealthy = $lastCheckedAt && $lastCheckedAt->gte($now->copy()->subMinutes(6));

        return Inertia::render('Dashboard', [
            'websites' => $enrichedWebsites,
            'stats'    => [
                'total'               => $total,
                'up'                  => $upCount,
                'down'                => $downCount,
                'pending'             => $pendingCount,
                'overall_uptime'      => $overallUptime,
                'avg_response_time'   => $avgResponseTime,
                'any_down'            => $downCount > 0,
                'ssl_expiring_soon'   => $sslExpiringSoon,
                'ssl_expired'         => $sslExpired,
            ],
            'serverTime'      => $now->toIso8601String(),
            'schedulerStatus' => [
                'last_checked_at' => $lastCheckedAt?->toIso8601String(),
                'is_healthy'      => $isSchedulerHealthy,
                'minutes_ago'     => $minutesAgo,
            ],
        ]);
    }

    /**
     * Run check across all active websites concurrently.
     */
    public function checkAll(WebsiteMonitorService $service): RedirectResponse
    {
        $service->checkAll();

        return back();
    }

    /**
     * Check a specific website.
     */
    public function checkSingle(Website $website, WebsiteMonitorService $service): RedirectResponse
    {
        $service->checkSingle($website);

        return back();
    }

    /**
     * Store a newly created website to monitor.
     */
    public function store(Request $request, WebsiteMonitorService $service): RedirectResponse
    {
        $validated = $request->validate([
            'name'              => 'required|string|max:255',
            'url'               => 'required|url|max:255',
            'category'          => 'nullable|string|max:100',
            'keyword'           => 'nullable|string|max:255',
            'timeout'           => 'nullable|integer|min:5|max:60',
            'latency_threshold' => 'nullable|integer|min:500|max:60000',
            'is_active'         => 'boolean',
            'is_public'         => 'boolean',
            'is_pinned'         => 'boolean',
        ]);

        $validated['category'] = (!empty($validated['category'])) ? $validated['category'] : 'Public Portals';
        $validated['timeout'] = $validated['timeout'] ?? 20;
        $validated['latency_threshold'] = $validated['latency_threshold'] ?? 5000;
        $validated['is_active'] = $validated['is_active'] ?? true;
        $validated['is_public'] = $validated['is_public'] ?? true;
        $validated['is_pinned'] = $validated['is_pinned'] ?? false;

        $website = Website::create($validated);
        $service->checkSingle($website);

        return back()->with('success', "Website {$website->name} added successfully.");
    }

    /**
     * Update an existing monitored website.
     */
    public function update(Request $request, Website $website): RedirectResponse
    {
        $validated = $request->validate([
            'name'              => 'required|string|max:255',
            'url'               => 'required|url|max:255',
            'category'          => 'nullable|string|max:100',
            'keyword'           => 'nullable|string|max:255',
            'timeout'           => 'nullable|integer|min:5|max:60',
            'latency_threshold' => 'nullable|integer|min:500|max:60000',
            'is_active'         => 'boolean',
            'is_public'         => 'boolean',
            'is_pinned'         => 'boolean',
        ]);

        $validated['category'] = (!empty($validated['category'])) ? $validated['category'] : ($website->category ?: 'Public Portals');
        if (isset($validated['latency_threshold'])) {
            $validated['latency_threshold'] = (int) $validated['latency_threshold'];
        }

        $website->update($validated);

        return back()->with('success', "Website {$website->name} updated.");
    }

    /**
     * Toggle the pinned status of a website.
     */
    public function togglePin(Website $website): RedirectResponse
    {
        $website->update([
            'is_pinned' => !$website->is_pinned,
        ]);

        $status = $website->is_pinned ? 'pinned to top' : 'unpinned';
        return back()->with('success', "Website {$website->name} {$status}.");
    }

    /**
     * Remove a website from monitoring.
     */
    public function destroy(Website $website): RedirectResponse
    {
        $name = $website->name;
        $website->delete();

        return back()->with('success', "Website {$name} removed.");
    }
}
