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
        Schema::create('websites', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('url');
            $table->string('keyword')->nullable();
            $table->integer('timeout')->default(10);
            $table->boolean('is_active')->default(true);
            $table->boolean('last_is_up')->nullable();
            $table->integer('last_http_code')->nullable();
            $table->integer('last_response_time')->nullable();
            $table->boolean('last_keyword_found')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('websites');
    }
};
