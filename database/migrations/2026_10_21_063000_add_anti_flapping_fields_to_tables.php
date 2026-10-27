<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->unsignedInteger('consecutive_failures')->default(0)->after('last_error');
        });

        Schema::table('website_checks', function (Blueprint $table) {
            $table->unsignedTinyInteger('attempts')->default(1)->after('response_time');
            $table->boolean('was_retried')->default(false)->after('attempts');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('website_checks', function (Blueprint $table) {
            $table->dropColumn(['attempts', 'was_retried']);
        });

        Schema::table('websites', function (Blueprint $table) {
            $table->dropColumn(['consecutive_failures']);
        });
    }
};

