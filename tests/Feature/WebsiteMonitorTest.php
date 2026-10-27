<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Website;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebsiteMonitorTest extends TestCase
{
    public function test_dashboard_redirects_unauthenticated_guests_to_login(): void
    {
        $response = $this->get('/dashboard');

        $response->assertRedirect('/login');
    }

    public function test_dashboard_renders_successfully_for_authenticated_users(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/dashboard');

        $response->assertStatus(200);
        $response->assertInertia(fn ($page) => $page->component('Dashboard'));
    }

    public function test_can_add_website(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/websites', [
            'name' => 'Test Service',
            'url'  => 'https://example.com',
            'keyword' => 'Example Domain',
            'timeout' => 5,
        ]);

        $response->assertRedirect();
        $this->assertDatabaseHas('websites', [
            'name' => 'Test Service',
            'url'  => 'https://example.com',
        ]);
    }
}

