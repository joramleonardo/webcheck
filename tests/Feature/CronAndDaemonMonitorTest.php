<?php

namespace Tests\Feature;

use App\Models\Website;
use App\Models\WebsiteCheck;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CronAndDaemonMonitorTest extends TestCase
{
    use RefreshDatabase;

    public function test_web_cron_endpoint_executes_scan_and_returns_json(): void
    {
        Http::fake([
            'https://dost.gov.ph' => Http::response('DOST Portal Content', 200),
        ]);

        Website::create([
            'name'              => 'DOST Main Portal',
            'url'               => 'https://dost.gov.ph',
            'category'          => 'Public Portals',
            'keyword'           => 'DOST',
            'timeout'           => 20,
            'latency_threshold' => 5000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        $response = $this->get('/api/cron/check');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'message',
            'checked_at',
            'duration_ms',
            'summary' => [
                'total',
                'operational',
                'disrupted',
            ],
        ]);

        $this->assertDatabaseHas('website_checks', [
            'is_up' => true,
        ]);
    }

    public function test_web_cron_endpoint_validates_token_when_configured(): void
    {
        putenv('MONITOR_CRON_TOKEN=secret-cron-token-123');

        $unauthorized = $this->get('/api/cron/check');
        $unauthorized->assertStatus(401);

        $wrongToken = $this->get('/api/cron/check?token=wrong-token');
        $wrongToken->assertStatus(401);

        $authorized = $this->get('/api/cron/check?token=secret-cron-token-123');
        $authorized->assertStatus(200);

        putenv('MONITOR_CRON_TOKEN');
    }

    public function test_dashboard_and_status_page_include_scheduler_status(): void
    {
        $site = Website::create([
            'name'              => 'STARBOOKS',
            'url'               => 'https://starbooks.ph',
            'category'          => 'Public Portals',
            'keyword'           => 'STARBOOKS',
            'timeout'           => 20,
            'latency_threshold' => 5000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        WebsiteCheck::create([
            'website_id'    => $site->id,
            'is_up'         => true,
            'http_code'     => 200,
            'response_time' => 120,
            'created_at'    => now()->subMinutes(2),
        ]);

        $user = \App\Models\User::factory()->create();

        $dashResponse = $this->actingAs($user)->get('/dashboard');
        $dashResponse->assertStatus(200);
        $dashResponse->assertInertia(fn ($page) => $page
            ->component('Dashboard')
            ->has('schedulerStatus')
            ->where('schedulerStatus.is_healthy', true)
        );

        $statusResponse = $this->get('/');
        $statusResponse->assertStatus(200);
        $statusResponse->assertInertia(fn ($page) => $page
            ->component('StatusPage')
            ->has('schedulerStatus')
            ->where('schedulerStatus.is_healthy', true)
        );
    }
}

