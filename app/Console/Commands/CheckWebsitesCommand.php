<?php

namespace App\Console\Commands;

use App\Services\WebsiteMonitorService;
use Illuminate\Console\Command;

class CheckWebsitesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'websites:check';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Concurrently check the uptime, content integrity, and SSL certificates of all monitored websites';

    /**
     * Execute the console command.
     */
    public function handle(WebsiteMonitorService $service): int
    {
        $this->info('Starting concurrent website and SSL checks...');
        $sites = $service->checkAll();

        $rows = [];
        foreach ($sites as $site) {
            $sslStatus = 'N/A (HTTP)';
            if ($site->ssl_checked_at) {
                if ($site->ssl_valid) {
                    $sslStatus = "Valid ({$site->ssl_days_remaining}d) - {$site->ssl_issuer}";
                } elseif ($site->ssl_valid === false) {
                    $sslStatus = 'Invalid / Expired';
                }
            }

            $rows[] = [
                $site->name,
                $site->url,
                $site->last_is_up ? 'UP' : 'DOWN',
                $site->last_http_code ?: 'N/A',
                $site->last_response_time !== null ? "{$site->last_response_time} ms" : 'N/A',
                $sslStatus,
                $site->last_keyword_found ? 'Found' : ($site->keyword ? 'Missing' : 'N/A'),
                $site->last_error ?: '-',
            ];
        }

        $this->table(['Name', 'URL', 'Status', 'HTTP Code', 'Latency', 'SSL Certificate', 'Keyword Check', 'Error'], $rows);

        return Command::SUCCESS;
    }
}
