<?php

namespace Tests\Feature;

use App\Models\Website;
use App\Services\WebsiteMonitorService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class KeywordIntegrityCriteriaTest extends TestCase
{
    public function test_marks_up_when_keyword_found_even_with_redirect_status(): void
    {
        $site = Website::create([
            'name'      => 'HRIS Intranet Portal',
            'url'       => 'http://10.10.140.206/hris/',
            'keyword'   => 'hris',
            'timeout'   => 5,
            'is_active' => true,
        ]);

        // Simulates an internal login redirect (HTTP 302 -> 200 OK) with body containing 'hris'
        Http::fake([
            'http://10.10.140.206/hris/'      => Http::response('', 302, ['Location' => 'http://10.10.140.206/hris/login']),
            'http://10.10.140.206/hris/login' => Http::response('<html><body>HRIS Login Portal</body></html>', 200),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        // Following redirects to 200 OK and matching keyword confirms UP
        $this->assertTrue((bool) $site->last_is_up);
        $this->assertTrue((bool) $site->last_keyword_found);
        $this->assertEquals(200, $site->last_http_code);
        $this->assertNull($site->last_error);

        $site->checks()->delete();
        $site->delete();
    }

    public function test_marks_down_when_keyword_missing_even_with_http_200(): void
    {
        $site = Website::create([
            'name'      => 'Defaced or Broken App',
            'url'       => 'https://broken.test',
            'keyword'   => 'DOST-STII',
            'timeout'   => 5,
            'is_active' => true,
        ]);

        // Server answers 200 OK, but content is blank or generic error page
        Http::fake([
            'https://broken.test*' => Http::response('<html><body>Database Error</body></html>', 200),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        // Under Criteria 3, missing keyword marks application DOWN
        $this->assertFalse((bool) $site->last_is_up);
        $this->assertFalse((bool) $site->last_keyword_found);
        $this->assertStringContainsString('Content check failed', $site->last_error);

        $site->checks()->delete();
        $site->delete();
    }

    public function test_marks_up_when_keyword_found_with_http_200(): void
    {
        $site = Website::create([
            'name'      => 'Healthy Site',
            'url'       => 'https://healthy.test',
            'keyword'   => 'Philippine',
            'timeout'   => 5,
            'is_active' => true,
        ]);

        Http::fake([
            'https://healthy.test*' => Http::response('Welcome to the Philippine Journal of Science', 200),
        ]);

        $service = app(WebsiteMonitorService::class);
        $service->checkSingle($site);

        $site->refresh();

        $this->assertTrue((bool) $site->last_is_up);
        $this->assertTrue((bool) $site->last_keyword_found);
        $this->assertNull($site->last_error);

        $site->checks()->delete();
        $site->delete();
    }
}

