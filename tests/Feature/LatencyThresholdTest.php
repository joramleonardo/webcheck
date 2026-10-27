<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Website;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LatencyThresholdTest extends TestCase
{
    public function test_can_create_website_with_custom_latency_threshold(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/websites', [
            'name'              => 'DOSTv Stream',
            'url'               => 'https://stream.dostv.test',
            'category'          => 'Public Portals',
            'timeout'           => 10,
            'latency_threshold' => 8000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        $response->assertRedirect();

        $site = Website::where('name', 'DOSTv Stream')->first();
        $this->assertNotNull($site);
        $this->assertEquals(8000, $site->latency_threshold);

        $site->delete();
    }

    public function test_defaults_latency_threshold_to_5000_if_omitted(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/websites', [
            'name'      => 'Standard Site',
            'url'       => 'https://standard.test',
            'category'  => 'Public Portals',
            'timeout'   => 5,
            'is_active' => true,
            'is_public' => true,
        ]);

        $response->assertRedirect();

        $site = Website::where('name', 'Standard Site')->first();
        $this->assertNotNull($site);
        $this->assertEquals(5000, $site->latency_threshold);

        $site->delete();
    }

    public function test_can_update_latency_threshold(): void
    {
        $user = User::factory()->create();

        $site = Website::create([
            'name'              => 'Modifiable Site',
            'url'               => 'https://mod.test',
            'category'          => 'Public Portals',
            'timeout'           => 5,
            'latency_threshold' => 5000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        $this->actingAs($user)->put("/websites/{$site->id}", [
            'name'              => 'Modifiable Site',
            'url'               => 'https://mod.test',
            'category'          => 'Public Portals',
            'timeout'           => 10,
            'latency_threshold' => 10000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        $site->refresh();
        $this->assertEquals(10000, $site->latency_threshold);

        $site->delete();
    }

    public function test_status_page_delivers_latency_threshold(): void
    {
        $site = Website::create([
            'name'              => 'Status Page Heavy Site',
            'url'               => 'https://heavy.test',
            'category'          => 'Public Portals',
            'timeout'           => 10,
            'latency_threshold' => 8000,
            'is_active'         => true,
            'is_public'         => true,
        ]);

        $response = $this->get('/');
        $response->assertStatus(200);

        $response->assertInertia(fn (Assert $page) => $page
            ->component('StatusPage')
            ->has('websites')
            ->where('websites', function ($websites) use ($site) {
                $found = collect($websites)->firstWhere('name', $site->name);
                return $found && (int)$found['latency_threshold'] === 8000;
            })
        );

        $site->delete();
    }
}

