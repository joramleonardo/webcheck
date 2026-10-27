<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->integer('latency_threshold')->default(5000)->after('timeout');
        });

        // Set higher threshold (e.g. 8000ms / 8s) for DOSTv and STARBOOKS which contain rich media/video content
        DB::table('websites')
            ->where('name', 'like', '%DOSTV%')
            ->orWhere('name', 'like', '%STARBOOKS%')
            ->update(['latency_threshold' => 8000]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->dropColumn('latency_threshold');
        });
    }
};

