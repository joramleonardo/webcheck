<?php

namespace Tests\Feature;

use App\Models\Website;
use App\Models\WebsiteCheck;
use App\Services\WebsiteMonitorService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AntiFlappingTest extends TestCase
{
    public function test_smart_retry_recovers_transient_failure_and_prevents_false_alarm(): void
    {
        $site = Website::create([
            'name' => 'Transient Flapper',
            'url' => 'https://flappy.test',
            'keyword' => 'Healthy',
            'timeout' => 5,
            'is_active' => true,
        ]);

        // First attempt fails (HTTP 500), second attempt (retry) succeeds with keyword (HTTP 200)
        Http::fake([
            'https://flappy.test*' => Http::sequence()
                ->push('Internal Server Error', 500)
                ->push('Healthy Application OK', 200),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        // Must be marked UP because smart retry verified it is healthy
        $this->assertTrue((bool) $site->last_is_up);
        $this->assertEquals(200, $site->last_http_code);
        $this->assertEquals(0, $site->consecutive_failures);

        // Check record must reflect 2 attempts and was_retried = true
        $latestCheck = WebsiteCheck::where('website_id', $site->id)->latest('id')->first();
        $this->assertNotNull($latestCheck);
        $this->assertTrue((bool) $latestCheck->is_up);
        $this->assertEquals(2, $latestCheck->attempts);
        $this->assertTrue((bool) $latestCheck->was_retried);

        // Clean up
        $site->checks()->delete();
        $site->delete();
    }

    public function test_confirmed_outage_when_retry_also_fails(): void
    {
        $site = Website::create([
            'name' => 'Hard Down Site',
            'url' => 'https://hard-down.test',
            'timeout' => 5,
            'is_active' => true,
        ]);

        // Both attempts fail (503 Service Unavailable)
        Http::fake([
            'https://hard-down.test*' => Http::sequence()
                ->push('Service Unavailable', 503)
                ->push('Service Unavailable', 503),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        // Must be marked DOWN because both attempts failed
        $this->assertFalse((bool) $site->last_is_up);
        $this->assertEquals(503, $site->last_http_code);
        $this->assertEquals(1, $site->consecutive_failures);

        $latestCheck = WebsiteCheck::where('website_id', $site->id)->latest('id')->first();
        $this->assertNotNull($latestCheck);
        $this->assertFalse((bool) $latestCheck->is_up);
        $this->assertEquals(2, $latestCheck->attempts);
        $this->assertTrue((bool) $latestCheck->was_retried);

        // Clean up
        $site->checks()->delete();
        $site->delete();
    }

    public function test_single_attempt_when_initial_request_succeeds(): void
    {
        $site = Website::create([
            'name' => 'Stable Site',
            'url' => 'https://stable.test',
            'keyword' => 'Ready',
            'timeout' => 5,
            'is_active' => true,
        ]);

        Http::fake([
            'https://stable.test*' => Http::response('Ready and running', 200),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        $this->assertTrue((bool) $site->last_is_up);
        $this->assertEquals(200, $site->last_http_code);
        $this->assertEquals(0, $site->consecutive_failures);

        $latestCheck = WebsiteCheck::where('website_id', $site->id)->latest('id')->first();
        $this->assertNotNull($latestCheck);
        $this->assertTrue((bool) $latestCheck->is_up);
        $this->assertEquals(1, $latestCheck->attempts);
        $this->assertFalse((bool) $latestCheck->was_retried);

        // Clean up
        $site->checks()->delete();
        $site->delete();
    }
}

