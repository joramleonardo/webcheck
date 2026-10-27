<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Website;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CategoryGroupingTest extends TestCase
{
    public function test_can_create_website_with_custom_category(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/websites', [
            'name'      => 'Internal API',
            'url'       => 'https://api.internal.test',
            'category'  => 'Internal Systems',
            'timeout'   => 5,
            'is_active' => true,
            'is_public' => false,
        ]);

        $response->assertRedirect();

        $site = Website::where('name', 'Internal API')->first();
        $this->assertNotNull($site);
        $this->assertEquals('Internal Systems', $site->category);
        $this->assertFalse((bool) $site->is_public);

        // Clean up
        $site->delete();
    }

    public function test_can_update_website_category(): void
    {
        $user = User::factory()->create();

        $site = Website::create([
            'name'      => 'Categorized Site',
            'url'       => 'https://cat.test',
            'category'  => 'Public Portals',
            'timeout'   => 5,
            'is_active' => true,
        ]);

        $this->actingAs($user)->put("/websites/{$site->id}", [
            'name'      => 'Categorized Site',
            'url'       => 'https://cat.test',
            'category'  => 'Knowledge Repositories',
            'timeout'   => 5,
            'is_active' => true,
            'is_public' => true,
        ]);

        $site->refresh();
        $this->assertEquals('Knowledge Repositories', $site->category);

        // Clean up
        $site->delete();
    }

    public function test_public_status_page_passes_category_data(): void
    {
        $site = Website::create([
            'name'      => 'Public Knowledge Base',
            'url'       => 'https://kb.public.test',
            'category'  => 'Knowledge Repositories',
            'timeout'   => 5,
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
                return $found && $found['category'] === 'Knowledge Repositories';
            })
        );

        // Clean up
        $site->delete();
    }
}

