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
            $table->boolean('ssl_valid')->nullable()->after('last_error');
            $table->string('ssl_issuer')->nullable()->after('ssl_valid');
            $table->timestamp('ssl_expires_at')->nullable()->after('ssl_issuer');
            $table->integer('ssl_days_remaining')->nullable()->after('ssl_expires_at');
            $table->timestamp('ssl_checked_at')->nullable()->after('ssl_days_remaining');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('websites', function (Blueprint $table) {
            $table->dropColumn([
                'ssl_valid',
                'ssl_issuer',
                'ssl_expires_at',
                'ssl_days_remaining',
                'ssl_checked_at',
            ]);
        });
    }
};
