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
            $table->boolean('is_public')->default(true)->after('is_active');
        });

        // Set internal/intranet websites as private by default
        DB::table('websites')
            ->where('url', 'like', '%.local%')
            ->orWhere('url', 'like', '%10.%')
            ->orWhere('url', 'like', '%192.168.%')
            ->orWhere('url', 'like', '%127.0.0.1%')
            ->orWhere('url', 'like', '%localhost%')
            ->update(['is_public' => false]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->dropColumn('is_public');
        });
    }
};

