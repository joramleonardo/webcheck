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
            $table->string('category')->default('Public Portals')->after('keyword');
        });

        // Categorize existing websites
        DB::table('websites')
            ->where('is_public', false)
            ->orWhere('url', 'like', '%.local%')
            ->orWhere('url', 'like', '%10.%')
            ->orWhere('url', 'like', '%192.168.%')
            ->update(['category' => 'Internal Systems']);

        DB::table('websites')
            ->where('is_public', true)
            ->where('url', 'not like', '%.local%')
            ->where('url', 'not like', '%10.%')
            ->where('url', 'not like', '%192.168.%')
            ->update(['category' => 'Public Portals']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }
};

