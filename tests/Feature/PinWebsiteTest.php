<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Website;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PinWebsiteTest extends TestCase
{
    public function test_can_toggle_website_pinned_status(): void
    {
        $user = User::factory()->create();

        $site = Website::create([
            'name'      => 'Test Unpinned Site',
            'url'       => 'https://unpinned.test',
            'category'  => 'Public Portals',
            'is_pinned' => false,
            'is_active' => true,
        ]);

        // Toggle PIN to true
        $response = $this->actingAs($user)->patch("/websites/{$site->id}/toggle-pin");
        $response->assertRedirect();

        $site->refresh();
        $this->assertTrue((bool) $site->is_pinned);

        // Toggle PIN back to false
        $response = $this->actingAs($user)->patch("/websites/{$site->id}/toggle-pin");
        $response->assertRedirect();

        $site->refresh();
        $this->assertFalse((bool) $site->is_pinned);

        $site->delete();
    }

    public function test_can_create_and_update_with_is_pinned(): void
    {
        $user = User::factory()->create();

        Http::fake([
            'https://pinned.test*' => Http::response('OK', 200),
        ]);

        $response = $this->actingAs($user)->post('/websites', [
            'name'      => 'Pinned Site Created',
            'url'       => 'https://pinned.test',
            'category'  => 'Internal Systems',
            'is_pinned' => true,
            'is_active' => true,
        ]);

        $response->assertRedirect();
        $site = Website::where('name', 'Pinned Site Created')->first();
        $this->assertNotNull($site);
        $this->assertTrue((bool) $site->is_pinned);

        $this->actingAs($user)->put("/websites/{$site->id}", [
            'name'      => 'Pinned Site Created',
            'url'       => 'https://pinned.test',
            'category'  => 'Internal Systems',
            'is_pinned' => false,
        ]);

        $site->refresh();
        $this->assertFalse((bool) $site->is_pinned);

        $site->delete();
    }

    public function test_status_page_delivers_is_pinned(): void
    {
        $site = Website::create([
            'name'      => 'Pinned Portal',
            'url'       => 'https://pinned-portal.test',
            'category'  => 'Public Portals',
            'is_pinned' => true,
            'is_active' => true,
            'is_public' => true,
        ]);

        $response = $this->get('/');
        $response->assertStatus(200);

        $response->assertInertia(fn (Assert $page) => $page
            ->component('StatusPage')
            ->has('websites')
            ->where('websites', function ($websites) use ($site) {
                $found = collect($websites)->firstWhere('name', $site->name);
                return $found && $found['is_pinned'] === true;
            })
        );

        $site->delete();
    }
}

