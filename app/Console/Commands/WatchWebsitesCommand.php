<?php

namespace App\Console\Commands;

use App\Services\WebsiteMonitorService;
use Illuminate\Console\Command;
use Throwable;

class WatchWebsitesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'websites:watch {--interval=60 : Interval between check cycles in seconds}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Run continuous 24/7 background website and SSL monitoring daemon (no cron required)';

    /**
     * Execute the console command.
     */
    public function handle(WebsiteMonitorService $service): int
    {
        $interval = max(10, (int) $this->option('interval'));

        $this->info("=================================================");
        $this->info(" WebCheck 24/7 Background Monitoring Daemon");
        $this->info(" Checking all active endpoints every {$interval} seconds");
        $this->info(" Press Ctrl+C to stop.");
        $this->info("=================================================");

        while (true) {
            $timestamp = now()->toDateTimeString();
            $start = microtime(true);
            $this->line("[{$timestamp}] Scanning monitored websites...");

            try {
                $sites = $service->checkAll();
                $total = $sites->count();
                $upCount = $sites->where('last_is_up', true)->count();
                $downCount = $total - $upCount;
                $duration = round(microtime(true) - $start, 2);

                if ($downCount > 0) {
                    $this->warn("[{$timestamp}] Completed in {$duration}s: {$upCount}/{$total} UP, {$downCount} DOWN.");
                } else {
                    $this->info("[{$timestamp}] Completed in {$duration}s: All {$total} endpoints operational.");
                }
            } catch (Throwable $e) {
                $this->error("[{$timestamp}] Scan error: " . $e->getMessage());
            }

            sleep($interval);
        }

        return Command::SUCCESS;
    }
}

