<?php
require_once 'monitor.php';
$websites = require 'websites.php';

// Check all websites and track overall system status
$anySystemDown = false;
$monitoredResults = [];

foreach ($websites as $site) {
    $result = checkWebsiteStatus($site['url'], $site['keyword']);
    if (!$result['is_up']) {
        $anySystemDown = true;
    }
    $monitoredResults[] = [
        'site'   => $site,
        'result' => $result
    ];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Website Status Monitor</title>
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- FontAwesome 6 -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <meta http-equiv="refresh" content="60"> <!-- Auto-refresh every 60 seconds -->
</head>
<body class="bg-light">

<div class="container py-5">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h2 mb-0">System Monitoring</h1>
            <p class="text-muted small mb-0">Auto-refreshes every 60 seconds</p>
        </div>
        <div class="d-flex gap-2">
            <!-- Sound Mute/Unmute Toggle Button -->
            <button id="soundToggleBtn" onclick="toggleAudio();" class="btn btn-outline-secondary btn-sm">
                <i class="fa-solid fa-bell me-1"></i> Sound: <span id="soundStatusText">Enabled</span>
            </button>
            <button onclick="location.reload();" class="btn btn-primary btn-sm"><i class="fa-solid fa-arrows-rotate me-1"></i> Refresh Now</button>
        </div>
    </div>

    <!-- Alert Banner if something is down -->
    <?php if ($anySystemDown): ?>
        <div class="alert alert-danger shadow-sm d-flex align-items-center mb-4" role="alert">
            <div>
                <strong><i class="fa-solid fa-triangle-exclamation me-1"></i> CRITICAL ALERT:</strong> One or more monitored systems are down! Please check immediately.
            </div>
        </div>
    <?php endif; ?>

    <div class="card shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="table-dark">
                        <tr>
                            <th>Status</th>
                            <th>Website Name</th>
                            <th>URL</th>
                            <th>Expected Content</th>
                            <th>HTTP Code</th>
                            <th>Response Time</th>
                            <th>Content Check</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($monitoredResults as $item): ?>
                            <?php 
                                $site = $item['site'];
                                $result = $item['result']; 
                            ?>
                            <tr>
                                <td>
                                    <?php if ($result['is_up']): ?>
                                        <span class="badge bg-success">UP</span>
                                    <?php else: ?>
                                        <span class="badge bg-danger">DOWN</span>
                                    <?php endif; ?>
                                </td>
                                <td class="fw-bold"><?= htmlspecialchars($site['name']) ?></td>
                                <td>
                                    <a href="<?= htmlspecialchars($site['url']) ?>" target="_blank" class="text-decoration-none">
                                        <?= htmlspecialchars($site['url']) ?>
                                    </a>
                                </td>
                                <td><code><?= htmlspecialchars($site['keyword']) ?></code></td>
                                <td>
                                    <span class="badge bg-secondary">
                                        <?= $result['http_code'] > 0 ? $result['http_code'] : 'N/A' ?>
                                    </span>
                                </td>
                                <td><?= $result['response_time'] ?> ms</td>
                                <td>
                                    <?php if ($result['keyword_found']): ?>
                                        <span class="text-success"><i class="fa-solid fa-check me-1"></i> Found</span>
                                    <?php else: ?>
                                        <span class="text-danger"><i class="fa-solid fa-xmark me-1"></i> Missing / Error</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Audio Alert Scripting -->
<script>
    let soundEnabled = true;

    function toggleAudio() {
        soundEnabled = !soundEnabled;
        const statusText = document.getElementById('soundStatusText');
        const btn = document.getElementById('soundToggleBtn');
        
        if (soundEnabled) {
            statusText.textContent = "Enabled";
            btn.classList.remove('btn-outline-danger');
            btn.classList.add('btn-outline-secondary');
        } else {
            statusText.textContent = "Muted";
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-outline-danger');
        }
    }

    // Play Fire Alarm Pattern (Repeats at least 3 times)
    function playFireAlarm() {
        if (!soundEnabled) return;

        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const repeats = 5;
            const cycleDuration = 0.9; // Time for one hi-lo alarm sound burst in seconds

            for (let i = 0; i < repeats; i++) {
                let startTime = audioCtx.currentTime + (i * cycleDuration);
                
                // Rapid high/low fire alarm pulses
                triggerAlarmPulse(audioCtx, 1200, startTime, 0.25);        // High pulse
                triggerAlarmPulse(audioCtx, 880, startTime + 0.28, 0.25);  // Low pulse
                triggerAlarmPulse(audioCtx, 1200, startTime + 0.56, 0.25); // High pulse
            }
        } catch (e) {
            console.log("AudioContext playback prevented by browser autoplay policy: ", e);
        }
    }

    // Helper to generate a sharp sawtooth-wave alarm pulse
    function triggerAlarmPulse(audioCtx, frequency, startTime, duration) {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // Sawtooth wave creates a sharp piercing "fire alarm" sound
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequency, startTime);

        // Volume curve for sharp burst
        gainNode.gain.setValueAtTime(0.25, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    // Trigger fire alarm on page load if any system is down
    <?php if ($anySystemDown): ?>
        window.addEventListener('DOMContentLoaded', () => {
            playFireAlarm();
        });
    <?php endif; ?>
</script>

</body>
</html>