<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Website;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PublicStatusPageTest extends TestCase
{
    public function test_public_status_page_loads_successfully_with_all_services_and_drawer_telemetry(): void
    {
        // Create 1 public site and 1 internal site
        $publicSite = Website::create([
            'name'               => 'Public Portal Test',
            'url'                => 'https://public-portal.test',
            'keyword'            => 'DOST-STII',
            'last_keyword_found' => true,
            'category'           => 'Public Portals',
            'is_active'          => true,
            'is_public'          => true,
        ]);

        $privateSite = Website::create([
            'name'      => 'Internal Intranet Test',
            'url'       => 'http://internal.local',
            'category'  => 'Internal Systems',
            'is_active' => true,
            'is_public' => false,
        ]);

        $response = $this->get('/status');

        $response->assertStatus(200);

        // Verify Inertia props contain both public and internal sites with their categories and check history
        $response->assertInertia(fn (Assert $page) => $page
            ->component('StatusPage')
            ->has('systemStatus')
            ->has('stats')
            ->has('websites')
            ->where('websites', function ($websites) use ($publicSite, $privateSite) {
                $names = collect($websites)->pluck('name');
                $matched = collect($websites)->firstWhere('name', $publicSite->name);
                return $names->contains($publicSite->name)
                    && $names->contains($privateSite->name)
                    && $matched['keyword'] === 'DOST-STII'
                    && $matched['last_keyword_found'] === true;
            })
        );

        // Clean up
        $publicSite->delete();
        $privateSite->delete();
    }

    public function test_public_api_endpoint_returns_json(): void
    {
        $response = $this->getJson('/api/status');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'systemStatus' => ['state', 'title', 'description'],
                'websites',
                'stats' => ['total', 'up', 'down', 'overall_uptime', 'avg_response_time'],
                'recentIncidents',
                'serverTime',
            ]);
    }

    public function test_can_toggle_website_public_visibility(): void
    {
        $user = User::factory()->create();

        $site = Website::create([
            'name'      => 'Toggle Site',
            'url'       => 'https://toggle.test',
            'is_active' => true,
            'is_public' => true,
        ]);

        $this->actingAs($user)->put("/websites/{$site->id}", [
            'name'      => 'Toggle Site',
            'url'       => 'https://toggle.test',
            'is_active' => true,
            'is_public' => false,
        ]);

        $site->refresh();
        $this->assertFalse((bool) $site->is_public);

        // Clean up
        $site->delete();
    }
}

