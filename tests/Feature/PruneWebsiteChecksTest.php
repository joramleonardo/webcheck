<?php

namespace Tests\Feature;

use App\Models\Website;
use App\Models\WebsiteCheck;
use Tests\TestCase;

class PruneWebsiteChecksTest extends TestCase
{
    public function test_prunes_checks_older_than_cutoff(): void
    {
        $site = Website::create([
            'name'      => 'Prune Test Site',
            'url'       => 'https://prune.test',
            'category'  => 'Public Portals',
            'timeout'   => 5,
            'is_active' => true,
        ]);

        // Old check (100 days ago)
        WebsiteCheck::create([
            'website_id'    => $site->id,
            'is_up'         => true,
            'http_code'     => 200,
            'response_time' => 100,
            'created_at'    => now()->subDays(100),
        ]);

        // Recent check (5 days ago)
        WebsiteCheck::create([
            'website_id'    => $site->id,
            'is_up'         => true,
            'http_code'     => 200,
            'response_time' => 120,
            'created_at'    => now()->subDays(5),
        ]);

        $this->artisan('websites:prune', ['--days' => 90])
            ->assertSuccessful();

        $this->assertEquals(1, WebsiteCheck::where('website_id', $site->id)->count());

        $site->delete();
    }
}
