<?php

echo "Packaging WebCheck for Hostinger...\n";

$zipFile = __DIR__ . '/webcheck_hostinger.zip';
if (file_exists($zipFile)) {
    unlink($zipFile);
}

$zip = new ZipArchive();
if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    die("Failed to create ZIP archive: $zipFile\n");
}

$baseDir = __DIR__;

// Directories and files to exclude from root
$excludes = [
    '.git',
    'node_modules',
    'tests',
    '.gemini',
    '.phpunit.result.cache',
    'webcheck_hostinger.zip',
    'package_for_hostinger.ps1',
    'build_hostinger_zip.php',
    '.env',
    '.env.hostinger',
    'public/hot',
    'hot',
];

// Ensure required empty storage directories are explicitly registered in ZIP
$requiredDirs = [
    'storage/app/public',
    'storage/framework/cache/data',
    'storage/framework/sessions',
    'storage/framework/views',
    'storage/logs',
    'bootstrap/cache',
];

foreach ($requiredDirs as $dir) {
    $zip->addEmptyDir($dir);
}

// Add .env.hostinger as .env
if (file_exists($baseDir . '/.env.hostinger')) {
    $zip->addFile($baseDir . '/.env.hostinger', '.env');
    echo "Added .env (from .env.hostinger)\n";
}

// Recursive iterator
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($baseDir, RecursiveDirectoryIterator::SKIP_DOTS),
    RecursiveIteratorIterator::SELF_FIRST
);

$fileCount = 0;
foreach ($iterator as $item) {
    $relativePath = substr($item->getPathname(), strlen($baseDir) + 1);
    // CRITICAL: Normalize all path separators to Unix forward slashes '/'
    $normalizedPath = str_replace('\\', '/', $relativePath);

    // Check exclusion
    $firstSegment = explode('/', $normalizedPath)[0];
    if (in_array($firstSegment, $excludes) || in_array($normalizedPath, $excludes)) {
        continue;
    }

    if ($item->isDir()) {
        $zip->addEmptyDir($normalizedPath);
    } else {
        $zip->addFile($item->getPathname(), $normalizedPath);
        $fileCount++;
    }
}

$zip->close();

$sizeMB = round(filesize($zipFile) / (1024 * 1024), 2);
echo "SUCCESS! Created $zipFile ($sizeMB MB with $fileCount files)\n";

// Verification step: verify NO entry has a backslash
$verifyZip = new ZipArchive();
if ($verifyZip->open($zipFile) === true) {
    $backslashCount = 0;
    for ($i = 0; $i < $verifyZip->numFiles; $i++) {
        $stat = $verifyZip->statIndex($i);
        if (strpos($stat['name'], '\\') !== false) {
            $backslashCount++;
            echo "ERROR: Entry has backslash: " . $stat['name'] . "\n";
        }
    }
    $verifyZip->close();

    if ($backslashCount === 0) {
        echo "VERIFIED: All {$verifyZip->numFiles} entries strictly use Linux POSIX forward slashes ('/').\n";
    } else {
        echo "FAIL: Found $backslashCount entries with backslashes!\n";
    }
}

