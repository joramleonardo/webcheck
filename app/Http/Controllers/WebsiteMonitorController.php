<?php

namespace App\Http\Controllers;

use App\Models\Website;
use App\Models\WebsiteCheck;
use App\Services\WebsiteMonitorService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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

        $websiteIds = $websites->pluck('id');

        // Fetch checks grouped by website
        $allRecentChecks = WebsiteCheck::whereIn('website_id', $websiteIds)
            ->orderBy('id', 'desc')
            ->get()
            ->groupBy('website_id');

        $enrichedWebsites = $websites->map(function (Website $site) use ($allRecentChecks, $oneDayAgo, $sevenDaysAgo, $now) {
            $siteChecks = $allRecentChecks->get($site->id, collect());

            // Last 40 checks in chronological order (oldest to newest)
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

            // Incident History Calculation (detect outages from checks)
            $chronologicalChecks = $siteChecks->reverse()->values();
            $incidents = [];
            $currentIncident = null;

            foreach ($chronologicalChecks as $check) {
                if (!$check->is_up) {
                    if (!$currentIncident) {
                        $currentIncident = [
                            'started_at'       => $check->created_at ? $check->created_at->toIso8601String() : null,
                            'ended_at'         => null,
                            'duration_minutes' => 1,
                            'error'            => $check->error ?: 'Unresponsive or Keyword Error',
                            'http_code'        => $check->http_code,
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
                        $currentIncident = null;
                    }
                }
            }

            if ($currentIncident) {
                $startedAt = Carbon::parse($currentIncident['started_at']);
                $currentIncident['duration_minutes'] = max(1, $now->diffInMinutes($startedAt));
                $incidents[] = $currentIncident;
            }

            // Reverse incidents so most recent incident appears on top
            $incidents = array_reverse($incidents);

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
                    'created_at'    => $c->created_at ? $c->created_at->toIso8601String() : null,
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
