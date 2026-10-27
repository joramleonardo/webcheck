<?php

/**
 * Check site availability and search for mandatory content.
 *
 * @param string $url
 * @param string $keyword
 * @param int $timeout Timeout in seconds
 * @return array
 */
function checkWebsiteStatus(string $url, string $keyword = '', int $timeout = 10): array {
    $startTime = microtime(true);

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Follow 301/302 redirects
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_USERAGENT, 'PHP-Website-Monitor/1.0');
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Bypass SSL errors if necessary

    $content = curl_exec($ch);
    $responseTime = round((microtime(true) - $startTime) * 1000); // in ms
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE); // Get HTTP response code
    $curlError = curl_error($ch);
    curl_close($ch);

    // Initial check: cURL succeeded and HTTP status is 200 OK
    $isUp = ($httpCode >= 200 && $httpCode < 300);
    $keywordFound = false;

    // Content check: verify if the expected string is present in HTML
    if ($isUp && !empty($keyword)) {
        if (mb_stripos($content, $keyword) !== false) {
            $keywordFound = true;
        } else {
            $isUp = false; // Mark as DOWN if content check fails
        }
    }

    return [
        'is_up'         => $isUp,
        'http_code'     => $httpCode,
        'response_time' => $responseTime,
        'keyword_found' => $keywordFound,
        'error'         => $curlError
    ];
}