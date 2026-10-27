<?php

namespace Database\Seeders;

use App\Models\Website;
use Illuminate\Database\Seeder;

class WebsiteSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $legacyWebsitesFile = base_path('websites.php');
        $websites = file_exists($legacyWebsitesFile) ? require $legacyWebsitesFile : [];

        foreach ($websites as $site) {
            Website::updateOrCreate(
                ['url' => $site['url']],
                [
                    'name'    => $site['name'],
                    'keyword' => $site['keyword'] ?? null,
                    'timeout' => 10,
                    'is_active' => true,
                ]
            );
        }
    }
}
