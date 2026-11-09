<?php

namespace App\Console\Commands;

use App\Models\WebsiteCheck;
use Illuminate\Console\Command;

class PruneWebsiteChecksCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'websites:prune {--days=90 : Number of days of checks to retain}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Prune old website check records to prevent database bloat and memory exhaustion';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $days = (int) $this->option('days');
        if ($days < 7) {
            $days = 7;
        }

        $cutoff = now()->subDays($days);

        $this->info("Pruning website check records older than {$days} days ({$cutoff->toDateTimeString()})...");

        $totalDeleted = 0;
        // Delete in chunks of 5,000 to avoid locking the table or exceeding transaction log limits
        do {
            $deleted = WebsiteCheck::where('created_at', '<', $cutoff)
                ->limit(5000)
                ->delete();

            $totalDeleted += $deleted;
            if ($deleted > 0) {
                $this->line("Deleted {$deleted} records (Total so far: {$totalDeleted})...");
            }
        } while ($deleted > 0);

        $this->info("Successfully pruned {$totalDeleted} old website check records.");

        return Command::SUCCESS;
    }
}
