<?php

namespace Database\Seeders;

use App\Models\Website;
use App\Models\WebsiteCheck;
use Illuminate\Database\Seeder;

class WebsiteCheckHistorySeeder extends Seeder
{
    public function run(): void
    {
        $sites = Website::all();
        if ($sites->isEmpty()) return;

        $now = now();
        $records = [];

        foreach ($sites as $site) {
            // Generate 30 historical heartbeats at 5-minute intervals
            for ($i = 29; $i >= 0; $i--) {
                $checkTime = $now->copy()->subMinutes($i * 5);

                // Keep history consistent with current status, with realistic variance
                $isUp = $site->last_is_up ?? true;
                $baseLatency = $site->last_response_time ?: 250;
                $simulatedLatency = max(20, (int) round($baseLatency + rand(-30, 45)));

                $records[] = [
                    'website_id'    => $site->id,
                    'is_up'         => $isUp,
                    'http_code'     => $isUp ? 200 : 500,
                    'response_time' => $simulatedLatency,
                    'keyword_found' => $isUp ? true : false,
                    'error'         => $isUp ? null : 'Service Unavailable',
                    'created_at'    => $checkTime,
                ];
            }
        }

        WebsiteCheck::insert($records);
    }
}

