<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Website extends Model
{
    protected $fillable = [
        'name',
        'url',
        'keyword',
        'category',
        'timeout',
        'latency_threshold',
        'is_active',
        'is_public',
        'is_pinned',
        'last_is_up',
        'last_http_code',
        'last_response_time',
        'last_keyword_found',
        'last_error',
        'consecutive_failures',
        'last_checked_at',
        'ssl_valid',
        'ssl_issuer',
        'ssl_expires_at',
        'ssl_days_remaining',
        'ssl_checked_at',
    ];

    protected $casts = [
        'latency_threshold' => 'integer',
        'is_active' => 'boolean',
        'is_public' => 'boolean',
        'is_pinned' => 'boolean',
        'last_is_up' => 'boolean',
        'last_http_code' => 'integer',
        'last_response_time' => 'integer',
        'last_keyword_found' => 'boolean',
        'consecutive_failures' => 'integer',
        'last_checked_at' => 'datetime',
        'ssl_valid' => 'boolean',
        'ssl_expires_at' => 'datetime',
        'ssl_days_remaining' => 'integer',
        'ssl_checked_at' => 'datetime',
    ];

    public function checks(): HasMany
    {
        return $this->hasMany(WebsiteCheck::class)->orderBy('id', 'asc');
    }
}
