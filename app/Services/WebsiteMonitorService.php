<?php

namespace App\Services;

use App\Models\Website;
use App\Models\WebsiteCheck;
use Carbon\Carbon;
use GuzzleHttp\TransferStats;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response as HttpResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Throwable;

class WebsiteMonitorService
{
    /**
     * Check multiple websites concurrently using an asynchronous HTTP pool with smart anti-flapping retry.
     *
     * @param Collection<int, Website>|null $websites
     * @return Collection<int, Website>
     */
    public function checkAll(?Collection $websites = null): Collection
    {
        $websites = $websites ?? Website::where('is_active', true)->get();

        if ($websites->isEmpty()) {
            return collect();
        }

        $now = now();
        $durations = [];

        // Phase 1: Fire all requests concurrently
        $responses = Http::pool(function (Pool $pool) use ($websites, &$durations) {
            foreach ($websites as $site) {
                $timeout = ($site->timeout && $site->timeout >= 5) ? $site->timeout : 20;
                $connectTimeout = max(10, min(20, $timeout));
                $pool->as((string) $site->id)
                    ->withoutVerifying()
                    ->connectTimeout($connectTimeout)
                    ->timeout($timeout)
                    ->withOptions([
                        'allow_redirects' => [
                            'max'             => 5,
                            'strict'          => false,
                            'referer'         => true,
                            'protocols'       => ['http', 'https'],
                            'track_redirects' => true,
                        ],
                        'on_stats' => function (TransferStats $stats) use (&$durations, $site) {
                            $durations[$site->id] = (int) round($stats->getTransferTime() * 1000);
                        },
                    ])
                    ->withHeaders(['User-Agent' => 'PHP-Website-Monitor/1.0'])
                    ->get($site->url);
            }
        });

        // Evaluate Phase 1 results
        $results = [];
        $failedSites = collect();

        foreach ($websites as $site) {
            $key = (string) $site->id;
            $response = $responses[$key] ?? null;
            $durationMs = $durations[$site->id] ?? 0;

            $eval = $this->evaluateResponse($response, $durationMs, $site->keyword);
            $eval['attempts'] = 1;
            $eval['was_retried'] = false;

            if ($eval['is_up']) {
                $results[$site->id] = $eval;
            } else {
                $failedSites->push($site);
                $results[$site->id] = $eval; // Temporary placeholder in case retry also fails
            }
        }

        // Phase 2: Anti-Flapping Smart Retry for failed sites
        // Pause 1.5 seconds to let transient network spikes/DNS blips clear before second verification
        if ($failedSites->isNotEmpty()) {
            usleep(1500000); // 1.5s backoff delay

            $retryDurations = [];
            $retryResponses = Http::pool(function (Pool $pool) use ($failedSites, &$retryDurations) {
                foreach ($failedSites as $site) {
                    $timeout = ($site->timeout && $site->timeout >= 5) ? $site->timeout : 20;
                    $connectTimeout = max(10, min(20, $timeout));
                    $pool->as((string) $site->id)
                        ->withoutVerifying()
                        ->connectTimeout($connectTimeout)
                        ->timeout($timeout)
                        ->withOptions([
                            'allow_redirects' => [
                                'max'             => 5,
                                'strict'          => false,
                                'referer'         => true,
                                'protocols'       => ['http', 'https'],
                                'track_redirects' => true,
                            ],
                            'on_stats' => function (TransferStats $stats) use (&$retryDurations, $site) {
                                $retryDurations[$site->id] = (int) round($stats->getTransferTime() * 1000);
                            },
                        ])
                        ->withHeaders(['User-Agent' => 'PHP-Website-Monitor/1.0 (Anti-Flap Retry)'])
                        ->get($site->url);
                }
            });

            foreach ($failedSites as $site) {
                $key = (string) $site->id;
                $retryResp = $retryResponses[$key] ?? null;
                $retryDurationMs = $retryDurations[$site->id] ?? $durations[$site->id] ?? 0;

                $retryEval = $this->evaluateResponse($retryResp, $retryDurationMs, $site->keyword);
                $retryEval['attempts'] = 2;
                $retryEval['was_retried'] = true;

                // Replace the check result with the verified retry result
                $results[$site->id] = $retryEval;
            }
        }

        // Persist check records and update website statuses
        $checkRecords = [];

        foreach ($websites as $site) {
            $eval = $results[$site->id];
            $isUp = $eval['is_up'];
            $httpCode = $eval['http_code'];
            $durationMs = $eval['response_time'];
            $keywordFound = $eval['keyword_found'];
            $errorMsg = $eval['error'];
            $attempts = $eval['attempts'];
            $wasRetried = $eval['was_retried'];

            // Consecutive failures tracking
            $consecutiveFailures = $isUp ? 0 : (($site->consecutive_failures ?? 0) + 1);

            $siteUpdate = [
                'last_is_up'           => $isUp,
                'last_http_code'       => $httpCode,
                'last_response_time'   => $durationMs,
                'last_keyword_found'   => $keywordFound,
                'last_error'           => $errorMsg,
                'consecutive_failures' => $consecutiveFailures,
                'last_checked_at'      => $now,
            ];

            // Refresh SSL data if not checked yet or checked more than 6 hours ago
            if (is_null($site->ssl_checked_at) || $site->ssl_checked_at < $now->copy()->subHours(6)) {
                $sslData = $this->inspectSslCertificate($site->url);
                $siteUpdate = array_merge($siteUpdate, $sslData);
            }

            $site->update($siteUpdate);

            $checkRecords[] = [
                'website_id'    => $site->id,
                'is_up'         => $isUp,
                'http_code'     => $httpCode,
                'response_time' => $durationMs,
                'attempts'      => $attempts,
                'was_retried'   => $wasRetried,
                'keyword_found' => $keywordFound,
                'error'         => $errorMsg,
                'created_at'    => $now,
            ];
        }

        if (!empty($checkRecords)) {
            WebsiteCheck::insert($checkRecords);
        }

        // Keep last 30 days of check history to avoid unbounded DB growth
        WebsiteCheck::where('created_at', '<', now()->subDays(30))->delete();

        return $websites->fresh();
    }

    /**
     * Check a single website synchronously with anti-flapping smart retry.
     */
    public function checkSingle(Website $site): Website
    {
        $timeout = ($site->timeout && $site->timeout >= 5) ? $site->timeout : 20;
        $connectTimeout = max(10, min(20, $timeout));
        $now = now();
        $durationMs = 0;

        // Attempt 1
        try {
            $response = Http::withoutVerifying()
                ->connectTimeout($connectTimeout)
                ->timeout($timeout)
                ->withOptions([
                    'allow_redirects' => [
                        'max'             => 5,
                        'strict'          => false,
                        'referer'         => true,
                        'protocols'       => ['http', 'https'],
                        'track_redirects' => true,
                    ],
                    'on_stats' => function (TransferStats $stats) use (&$durationMs) {
                        $durationMs = (int) round($stats->getTransferTime() * 1000);
                    },
                ])
                ->withHeaders(['User-Agent' => 'PHP-Website-Monitor/1.0'])
                ->get($site->url);

            $eval = $this->evaluateResponse($response, $durationMs, $site->keyword);
            $eval['attempts'] = 1;
            $eval['was_retried'] = false;
        } catch (Throwable $e) {
            $eval = $this->evaluateResponse($e, $durationMs, $site->keyword);
            $eval['attempts'] = 1;
            $eval['was_retried'] = false;
        }

        // If attempt 1 failed, perform anti-flapping smart retry after 1.5s
        if (!$eval['is_up']) {
            usleep(1500000); // 1.5s backoff delay

            $retryDurationMs = 0;
            try {
                $retryResp = Http::withoutVerifying()
                    ->connectTimeout($connectTimeout)
                    ->timeout($timeout)
                    ->withOptions([
                        'allow_redirects' => [
                            'max'             => 5,
                            'strict'          => false,
                            'referer'         => true,
                            'protocols'       => ['http', 'https'],
                            'track_redirects' => true,
                        ],
                        'on_stats' => function (TransferStats $stats) use (&$retryDurationMs) {
                            $retryDurationMs = (int) round($stats->getTransferTime() * 1000);
                        },
                    ])
                    ->withHeaders(['User-Agent' => 'PHP-Website-Monitor/1.0 (Anti-Flap Retry)'])
                    ->get($site->url);

                $eval = $this->evaluateResponse($retryResp, $retryDurationMs, $site->keyword);
                $eval['attempts'] = 2;
                $eval['was_retried'] = true;
            } catch (Throwable $retryException) {
                $eval = $this->evaluateResponse($retryException, $retryDurationMs, $site->keyword);
                $eval['attempts'] = 2;
                $eval['was_retried'] = true;
            }
        }

        $isUp = $eval['is_up'];
        $consecutiveFailures = $isUp ? 0 : (($site->consecutive_failures ?? 0) + 1);

        $sslData = $this->inspectSslCertificate($site->url);

        $site->update(array_merge([
            'last_is_up'           => $isUp,
            'last_http_code'       => $eval['http_code'],
            'last_response_time'   => $eval['response_time'],
            'last_keyword_found'   => $eval['keyword_found'],
            'last_error'           => $eval['error'],
            'consecutive_failures' => $consecutiveFailures,
            'last_checked_at'      => $now,
        ], $sslData));

        WebsiteCheck::create([
            'website_id'    => $site->id,
            'is_up'         => $isUp,
            'http_code'     => $eval['http_code'],
            'response_time' => $eval['response_time'],
            'attempts'      => $eval['attempts'],
            'was_retried'   => $eval['was_retried'],
            'keyword_found' => $eval['keyword_found'],
            'error'         => $eval['error'],
            'created_at'    => $now,
        ]);

        return $site->fresh();
    }

    /**
     * Parse and evaluate an HTTP response or exception into a standardized check result
     * following the criteria from D:\Projects\VUE Projects\webcheck\monitor.php:
     *
     * 1. Follow 301/302 redirects (max 5).
     * 2. Initial check: HTTP status is 200 OK (200..299).
     * 3. Content check: if keyword provided, verify keyword is present in HTML body.
     *    If keyword is missing, mark as DOWN.
     */
    private function evaluateResponse(mixed $response, int $durationMs, ?string $keyword): array
    {
        if ($response instanceof HttpResponse) {
            $httpCode = $response->status();
            $body = $response->body();

            // Initial check: cURL succeeded and HTTP status is 200 OK (200..299)
            $isUp = ($httpCode >= 200 && $httpCode < 300);
            $keywordFound = false;

            // Content check: verify if the expected string is present in HTML
            if ($isUp && !empty($keyword)) {
                if (mb_stripos($body, $keyword) !== false) {
                    $keywordFound = true;
                } else {
                    $isUp = false; // Mark as DOWN if content check fails
                }
            }

            $errorMsg = null;
            if (!$isUp) {
                if ($httpCode >= 200 && $httpCode < 300 && !empty($keyword) && !$keywordFound) {
                    $errorMsg = "Content check failed: expected keyword '{$keyword}' missing";
                } else {
                    $errorMsg = "HTTP error {$httpCode}";
                }
            }

            return [
                'is_up'         => $isUp,
                'http_code'     => $httpCode,
                'response_time' => $durationMs,
                'keyword_found' => !empty($keyword) ? $keywordFound : null,
                'error'         => $errorMsg,
            ];
        }

        // Exception thrown (cURL error, connection refused, DNS resolution failed)
        if ($response instanceof Throwable) {
            $errorMsg = $response->getMessage();
        } else {
            $errorMsg = 'Connection failed or timed out';
        }

        return [
            'is_up'         => false,
            'http_code'     => 0,
            'response_time' => $durationMs,
            'keyword_found' => false,
            'error'         => $errorMsg,
        ];
    }

    /**
     * Inspect SSL/TLS certificate validity, issuer, and days until expiration.
     *
     * @param string $url
     * @return array
     */
    public function inspectSslCertificate(string $url): array
    {
        $now = now();
        $parsed = parse_url($url);
        $scheme = strtolower($parsed['scheme'] ?? 'http');

        if ($scheme !== 'https') {
            return [
                'ssl_valid'          => null,
                'ssl_issuer'         => null,
                'ssl_expires_at'     => null,
                'ssl_days_remaining' => null,
                'ssl_checked_at'     => $now,
            ];
        }

        $host = $parsed['host'] ?? null;
        $port = $parsed['port'] ?? 443;

        if (!$host) {
            return [
                'ssl_valid'          => false,
                'ssl_issuer'         => null,
                'ssl_expires_at'     => null,
                'ssl_days_remaining' => null,
                'ssl_checked_at'     => $now,
            ];
        }

        $context = stream_context_create([
            'ssl' => [
                'capture_peer_cert' => true,
                'verify_peer'       => false,
                'verify_peer_name'  => false,
            ],
        ]);

        $client = @stream_socket_client(
            "ssl://{$host}:{$port}",
            $errno,
            $errstr,
            timeout: 5,
            flags: STREAM_CLIENT_CONNECT,
            context: $context
        );

        if (!$client) {
            return [
                'ssl_valid'          => false,
                'ssl_issuer'         => null,
                'ssl_expires_at'     => null,
                'ssl_days_remaining' => null,
                'ssl_checked_at'     => $now,
            ];
        }

        $params = stream_context_get_params($client);
        $peerCert = $params['options']['ssl']['peer_certificate'] ?? null;
        fclose($client);

        if (!$peerCert) {
            return [
                'ssl_valid'          => false,
                'ssl_issuer'         => null,
                'ssl_expires_at'     => null,
                'ssl_days_remaining' => null,
                'ssl_checked_at'     => $now,
            ];
        }

        $certInfo = openssl_x509_parse($peerCert);
        if (!$certInfo) {
            return [
                'ssl_valid'          => false,
                'ssl_issuer'         => null,
                'ssl_expires_at'     => null,
                'ssl_days_remaining' => null,
                'ssl_checked_at'     => $now,
            ];
        }

        $validToTimestamp = $certInfo['validTo_time_t'] ?? null;
        $validFromTimestamp = $certInfo['validFrom_time_t'] ?? null;

        $expiresAt = $validToTimestamp ? Carbon::createFromTimestamp($validToTimestamp) : null;
        $daysRemaining = $validToTimestamp ? (int) floor(($validToTimestamp - time()) / 86400) : null;
        $isValid = ($validToTimestamp && $validToTimestamp > time()) && ($validFromTimestamp && $validFromTimestamp <= time());

        // Extract human-friendly issuer name
        $issuer = $certInfo['issuer']['O'] ?? $certInfo['issuer']['CN'] ?? $certInfo['issuer']['OU'] ?? 'Unknown Authority';
        // Clean up common long issuer strings
        if (str_contains($issuer, 'Let\'s Encrypt')) {
            $issuer = 'Let\'s Encrypt';
        } elseif (str_contains($issuer, 'Google Trust Services')) {
            $issuer = 'Google Trust Services';
        } elseif (str_contains($issuer, 'DigiCert')) {
            $issuer = 'DigiCert';
        } elseif (str_contains($issuer, 'Cloudflare')) {
            $issuer = 'Cloudflare';
        } elseif (str_contains($issuer, 'GoDaddy')) {
            $issuer = 'GoDaddy';
        } elseif (str_contains($issuer, 'Sectigo') || str_contains($issuer, 'COMODO')) {
            $issuer = 'Sectigo';
        }

        return [
            'ssl_valid'          => $isValid,
            'ssl_issuer'         => $issuer,
            'ssl_expires_at'     => $expiresAt,
            'ssl_days_remaining' => $daysRemaining,
            'ssl_checked_at'     => $now,
        ];
    }
}
