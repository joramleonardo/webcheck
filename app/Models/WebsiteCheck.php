<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebsiteCheck extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'website_id',
        'is_up',
        'http_code',
        'response_time',
        'attempts',
        'was_retried',
        'keyword_found',
        'error',
        'created_at',
    ];

    protected $casts = [
        'is_up' => 'boolean',
        'http_code' => 'integer',
        'response_time' => 'integer',
        'attempts' => 'integer',
        'was_retried' => 'boolean',
        'keyword_found' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function website(): BelongsTo
    {
        return $this->belongsTo(Website::class);
    }
}
