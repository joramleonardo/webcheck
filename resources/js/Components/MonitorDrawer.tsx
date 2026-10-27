import React, { useState, useMemo, memo } from 'react';
import {
    X,
    ArrowUpRight,
    RefreshCw,
    Activity,
    ShieldCheck,
    Clock,
    Zap,
    CheckCircle2,
    XCircle,
    Globe,
    Lock,
    ShieldAlert,
    AlertTriangle
} from 'lucide-react';
import { Website, WebsiteCheck, WebsiteIncident } from '../types';

interface MonitorDrawerProps {
    site: Website | null;
    isOpen: boolean;
    onClose: () => void;
    onRecheck?: (siteId: number) => void;
    isChecking?: boolean;
    readOnly?: boolean;
}

// Memoized Incident Item for maximum scrolling performance
const IncidentRow = memo(function IncidentRow({ incident }: { incident: WebsiteIncident }) {
    const startDate = incident.started_at
        ? new Date(incident.started_at).toLocaleString()
        : 'Unknown';
    const endDate = incident.ended_at
        ? new Date(incident.ended_at).toLocaleString()
        : 'Ongoing';

    return (
        <div
            className={`border rounded-xl p-3 sm:p-3.5 text-xs transition-colors shadow-sm ${
                incident.is_ongoing
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-white border-[#BFE8F8] text-[#0D3144]'
            }`}
        >
            <div className="flex items-center justify-between font-semibold flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                    {incident.is_ongoing ? (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    ) : (
                        <XCircle className="w-4 h-4 text-rose-500" />
                    )}
                    <span className={incident.is_ongoing ? 'text-rose-950 font-bold' : 'text-[#0D3144] font-bold'}>
                        {incident.is_ongoing ? 'Ongoing Outage' : 'Service Interruption'}
                    </span>
                </div>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#E2F3FC] border border-[#BFE8F8] text-[#0F6D95] font-bold">
                    {incident.duration_minutes} min{incident.duration_minutes !== 1 ? 's' : ''} downtime
                </span>
            </div>

            <div className="mt-2 text-[11px] text-[#144C66]/80">
                {incident.is_ongoing ? (
                    <span>Started: <strong className="text-[#0D3144]">{startDate}</strong> • Ongoing</span>
                ) : (
                    <span>{startDate} &rarr; {endDate}</span>
                )}
            </div>

            {incident.error && (
                <div className="mt-1.5 text-rose-700 font-mono text-[11px] bg-rose-50 p-2 rounded border border-rose-200 truncate">
                    {incident.error}
                </div>
            )}
        </div>
    );
});

// Memoized Telemetry Log Row
const TelemetryLogRow = memo(function TelemetryLogRow({ check }: { check: WebsiteCheck }) {
    const timeFormatted = useMemo(() => {
        return check.created_at ? new Date(check.created_at).toLocaleString() : 'N/A';
    }, [check.created_at]);

    return (
        <div className="p-3 flex items-center justify-between hover:bg-[#F1FAFE] transition-colors">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 pr-2">
                {check.is_up ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                    <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <div className="min-w-0">
                    <div className="font-medium text-[#0D3144] flex items-center space-x-1.5 flex-wrap">
                        <span className="truncate">{check.is_up ? 'Keyword Verified' : 'Check Failed'}</span>
                        {check.was_retried && (
                            <span
                                className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                                    check.is_up
                                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                                }`}
                                title="Smart retry after 1.5s backoff intercepted transient issue"
                            >
                                {check.is_up ? 'Recovered on Retry (2/2)' : 'Confirmed Outage (2/2)'}
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] text-[#144C66]/70 truncate">
                        {timeFormatted}
                        {check.attempts && check.attempts > 1 && ' • 2 attempts'}
                    </div>
                </div>
            </div>

            <div className="text-right shrink-0">
                <div className="font-mono font-bold text-[#0D3144] text-xs">
                    {check.response_time} ms
                </div>
                {check.error && (
                    <div className="text-[10px] text-rose-600 max-w-[120px] sm:max-w-xs truncate" title={check.error}>
                        {check.error}
                    </div>
                )}
            </div>
        </div>
    );
});

// Interactive SVG Telemetry Chart - separated and memoized so hover doesn't re-render parent
const TelemetryChart = memo(function TelemetryChart({
    checks,
    latencyThreshold = 5000
}: {
    checks: WebsiteCheck[];
    latencyThreshold?: number;
}) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    // Chart dimensions
    const svgWidth = 540;
    const svgHeight = 160;
    const paddingX = 24;
    const paddingY = 24;

    const chartWidth = svgWidth - paddingX * 2;
    const chartHeight = svgHeight - paddingY * 2;

    const { points, linePath, areaPath } = useMemo(() => {
        if (!checks || checks.length === 0) {
            return { points: [], linePath: '', areaPath: '' };
        }

        const validLatencies = checks.map((c) => c.response_time || 0);
        const minLatency = Math.min(...validLatencies);
        const rawMaxLatency = Math.max(...validLatencies);
        const maxLatency = Math.max(rawMaxLatency, minLatency + 50);

        const pts = checks.map((check, i) => {
            const x = paddingX + (i / Math.max(1, checks.length - 1)) * chartWidth;
            const normalizedY = (check.response_time - minLatency) / (maxLatency - minLatency);
            const y = svgHeight - paddingY - normalizedY * chartHeight;
            return { x, y, check };
        });

        const lPath = pts.length > 1
            ? pts.reduce((acc, curr, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`, '')
            : '';

        const aPath = pts.length > 1
            ? `${lPath} L ${pts[pts.length - 1].x.toFixed(1)},${svgHeight - paddingY} L ${pts[0].x.toFixed(1)},${svgHeight - paddingY} Z`
            : '';

        return { points: pts, linePath: lPath, areaPath: aPath };
    }, [checks, chartWidth, chartHeight, svgHeight, paddingX, paddingY]);

    const activePoint = hoverIndex !== null && points[hoverIndex]
        ? points[hoverIndex]
        : (points.length > 0 ? points[points.length - 1] : null);

    const activeCheck = activePoint ? activePoint.check : null;

    if (points.length <= 1) {
        return (
            <div className="h-40 flex items-center justify-center text-xs text-[#144C66]/60">
                Collecting telemetry data points...
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Active datapoint status indicator */}
            <div className="flex items-center justify-between flex-wrap gap-2 min-h-[28px]">
                <div className="text-[11px] text-[#144C66]/70 font-semibold">
                    {hoverIndex !== null ? 'Selected Datapoint' : 'Latest Check in Rotation'}
                </div>

                {activeCheck && (
                    <div className="text-xs font-mono bg-white px-2.5 py-1 rounded-lg border border-[#BFE8F8] text-[#0D3144] flex items-center space-x-2 shadow-sm">
                        <span className="text-[#144C66]/70">
                            {activeCheck.created_at ? new Date(activeCheck.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Now'}:
                        </span>
                        <span className="font-bold text-[#0D3144]">{activeCheck.response_time} ms</span>
                        <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                activeCheck.is_up
                                    ? activeCheck.response_time > latencyThreshold
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                        >
                            {activeCheck.is_up ? 'Keyword Verified' : 'Check Failed'}
                        </span>
                        {activeCheck.was_retried && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                2/2 Retried
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* SVG Chart with smoothed hit-targets */}
            <div className="relative w-full overflow-hidden bg-white rounded-xl border border-[#BFE8F8] p-2 select-none shadow-sm">
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full h-36 sm:h-40 overflow-visible"
                    onMouseLeave={() => setHoverIndex(null)}
                >
                    <defs>
                        <linearGradient id="anakiwaChartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1FA9D8" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#1FA9D8" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>

                    {/* Horizontal Guideline */}
                    <line
                        x1={paddingX}
                        y1={svgHeight / 2}
                        x2={svgWidth - paddingX}
                        y2={svgHeight / 2}
                        stroke="#BFE8F8"
                        strokeDasharray="4 4"
                    />

                    {/* Area Fill */}
                    <path d={areaPath} fill="url(#anakiwaChartGrad)" />

                    {/* Stroke Line */}
                    <path d={linePath} fill="none" stroke="#1FA9D8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Active vertical cursor line */}
                    {activePoint && (
                        <line
                            x1={activePoint.x}
                            y1={paddingY}
                            x2={activePoint.x}
                            y2={svgHeight - paddingY}
                            stroke="#1188B8"
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                            opacity="0.8"
                        />
                    )}

                    {/* Data Points */}
                    {points.map((p, idx) => {
                        const isHovered = hoverIndex === idx;
                        const isDegraded = p.check.is_up && p.check.response_time > latencyThreshold;
                        const fillColor = !p.check.is_up
                            ? '#EF4444'
                            : isDegraded
                            ? '#F59E0B'
                            : isHovered
                            ? '#0D3144'
                            : '#1188B8';

                        return (
                            <g key={p.check.id || idx}>
                                {/* Visible Dot */}
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={isHovered ? 5.5 : 3.5}
                                    fill={fillColor}
                                    stroke="#FFFFFF"
                                    strokeWidth={2}
                                />
                                {/* Large invisible hit target for smooth hover without pixel-hunting */}
                                <rect
                                    x={Math.max(0, p.x - chartWidth / (points.length * 2))}
                                    y={0}
                                    width={Math.max(16, chartWidth / points.length)}
                                    height={svgHeight}
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoverIndex(idx)}
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#144C66]/70 mt-1 px-1 font-semibold">
                <span>Earliest Recorded</span>
                <span>Recent Heartbeats ({points.length})</span>
                <span>Latest Scan</span>
            </div>
        </div>
    );
});

function MonitorDrawer({
    site,
    isOpen,
    onClose,
    onRecheck,
    isChecking = false,
    readOnly = false,
}: MonitorDrawerProps) {
    if (!isOpen || !site) return null;

    const isUp = site.last_is_up === true;
    const isDown = site.last_is_up === false;
    const checks = site.recent_checks || [];
    const incidents = site.incidents || [];

    // Memoized reversed checks for telemetry list (sliced to recent 40 for optimal DOM speed)
    const recentTelemetryLog = useMemo(() => {
        return checks.slice(-40).reverse();
    }, [checks]);

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop with performant opacity transition */}
            <div
                className="absolute inset-0 bg-[#0D3144]/50 backdrop-blur-sm transition-opacity duration-200"
                onClick={onClose}
            />

            {/* Slide-over panel container: full width on mobile, max-w-2xl on larger displays */}
            <div className="fixed inset-y-0 right-0 w-full max-w-full sm:max-w-2xl flex pl-0 sm:pl-8 z-50 pointer-events-none">
                <div className="w-full bg-white border-l border-[#BFE8F8] shadow-2xl flex flex-col text-[#0D3144] overflow-hidden pointer-events-auto transform transition-transform duration-200 ease-out translate-x-0">

                    {/* Header */}
                    <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[#BFE8F8] flex items-center justify-between bg-[#F1FAFE] gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                            <div className="pt-0.5 shrink-0">
                                {isUp ? (
                                    <span className="relative flex h-3.5 w-3.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                                    </span>
                                ) : isDown ? (
                                    <span className="relative flex h-3.5 w-3.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500"></span>
                                    </span>
                                ) : (
                                    <span className="inline-flex rounded-full h-3.5 w-3.5 bg-[#BFE8F8]"></span>
                                )}
                            </div>

                            <div className="min-w-0">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                    <h2 className="text-base sm:text-lg font-bold text-[#0D3144] truncate max-w-[200px] sm:max-w-xs">{site.name}</h2>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                        isUp
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                    }`}>
                                        {isUp ? 'OPERATIONAL' : 'OUTAGE'}
                                    </span>
                                    {site.is_public ? (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] flex items-center space-x-1" title="Visible on Public Status Page (/status)">
                                            <Globe className="w-2.5 h-2.5" />
                                            <span>Public</span>
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center space-x-1" title="Internal only - Hidden from Public Status Page">
                                            <Lock className="w-2.5 h-2.5" />
                                            <span>Private / NOC</span>
                                        </span>
                                    )}
                                </div>
                                <a
                                    href={site.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-[#1188B8] hover:text-[#0F6D95] font-medium transition-colors inline-flex items-center space-x-1 group truncate max-w-full sm:max-w-md mt-0.5"
                                >
                                    <span className="truncate">{site.url}</span>
                                    <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100 shrink-0" />
                                </a>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                            {!readOnly && onRecheck ? (
                                <button
                                    type="button"
                                    onClick={() => onRecheck(site.id)}
                                    disabled={isChecking}
                                    className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm shadow-[#1FA9D8]/20 transition-colors disabled:opacity-50"
                                    title="Run immediate health check"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                                    <span className="hidden sm:inline">{isChecking ? 'Checking...' : 'Check Now'}</span>
                                </button>
                            ) : (
                                <span className="hidden sm:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                                    <Activity className="w-3.5 h-3.5 text-[#1188B8]" />
                                    <span>Live Telemetry</span>
                                </span>
                            )}

                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-[#144C66]/60 hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors"
                                title="Close Drawer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

                        {/* 4-Stat Telemetry Summary */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                            <div className="bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl p-3 sm:p-3.5">
                                <div className="text-[10px] sm:text-[11px] font-bold text-[#144C66]/70 uppercase tracking-wider">24h Uptime</div>
                                <div className="text-lg sm:text-xl font-bold text-emerald-600 mt-1">{site.uptime_24h ?? 100}%</div>
                            </div>
                            <div className="bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl p-3 sm:p-3.5">
                                <div className="text-[10px] sm:text-[11px] font-bold text-[#144C66]/70 uppercase tracking-wider">7d Uptime</div>
                                <div className="text-lg sm:text-xl font-bold text-[#0D3144] mt-1">{site.uptime_7d ?? 100}%</div>
                            </div>
                            <div className="bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl p-3 sm:p-3.5">
                                <div className="text-[10px] sm:text-[11px] font-bold text-[#144C66]/70 uppercase tracking-wider">Avg Response Time</div>
                                <div className="text-lg sm:text-xl font-bold text-[#1188B8] mt-1 truncate">{site.avg_latency_24h ?? site.last_response_time ?? 0} ms</div>
                            </div>
                            <div className="bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl p-3 sm:p-3.5">
                                <div className="text-[10px] sm:text-[11px] font-bold text-[#144C66]/70 uppercase tracking-wider">Min / Max</div>
                                <div className="text-xs font-mono font-bold text-[#0D3144] mt-1 sm:mt-2 truncate">
                                    {site.min_latency_24h ?? 0}ms • {site.max_latency_24h ?? 0}ms
                                </div>
                            </div>
                        </div>

                        {/* Interactive Latency Response Chart */}
                        <div className="bg-[#F1FAFE]/70 border border-[#BFE8F8] rounded-2xl p-4 sm:p-5 shadow-sm">
                            <div className="flex items-center space-x-2 mb-2">
                                <Activity className="w-4 h-4 text-[#1188B8]" />
                                <h3 className="text-sm font-bold text-[#0D3144]">Response Time Telemetry</h3>
                            </div>

                            <p className="text-[11px] text-[#144C66]/70 mb-3">
                                Smooth scrubber: hover or tap across the chart area to inspect total response time before keyword match and timestamp.
                            </p>

                            <TelemetryChart
                                checks={checks}
                                latencyThreshold={site.latency_threshold ?? 5000}
                            />
                        </div>

                        {/* SSL / HTTPS Security & Certificate Integrity */}
                        {site.url.toLowerCase().startsWith('https://') && (
                            <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs shadow-sm transition-all ${
                                site.ssl_days_remaining !== undefined && site.ssl_days_remaining !== null && site.ssl_days_remaining <= 14
                                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                                    : 'bg-[#F1FAFE] border-[#BFE8F8] text-[#0D3144]'
                            }`}>
                                <div className="flex items-center space-x-3">
                                    <div className={`p-2 rounded-xl shrink-0 ${
                                        site.ssl_days_remaining !== undefined && site.ssl_days_remaining !== null && site.ssl_days_remaining <= 14
                                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                            : 'bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]'
                                    }`}>
                                        <Lock className="w-4 h-4 text-[#1188B8]" />
                                    </div>
                                    <div>
                                        <div className="font-bold flex items-center space-x-2">
                                            <span>SSL / TLS Certificate Status</span>
                                            {site.ssl_days_remaining !== undefined && site.ssl_days_remaining !== null ? (
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold ${
                                                    site.ssl_days_remaining <= 7
                                                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                                        : site.ssl_days_remaining <= 30
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                }`}>
                                                    {site.ssl_days_remaining} Days Remaining
                                                </span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    Active & Encrypted
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-[#144C66]/80 mt-0.5">
                                            {site.ssl_expires_at
                                                ? `Valid TLS expiration: ${new Date(site.ssl_expires_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`
                                                : 'Secure HTTPS transport verified during automated check'}
                                        </div>
                                    </div>
                                </div>
                                {site.ssl_days_remaining !== undefined && site.ssl_days_remaining !== null && site.ssl_days_remaining <= 14 ? (
                                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                                ) : (
                                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                                )}
                            </div>
                        )}

                        {/* Incident / Outage Timeline */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-[#0D3144] flex items-center space-x-2">
                                    <Clock className="w-4 h-4 text-[#1188B8]" />
                                    <span>Incident & Outage Timeline</span>
                                </h3>
                                <span className="text-[11px] text-[#144C66]/70 font-semibold">
                                    {incidents.length} {incidents.length === 1 ? 'Event' : 'Events'} Recorded
                                </span>
                            </div>

                            {incidents.length === 0 ? (
                                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4 flex items-center space-x-3.5">
                                    <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
                                    <div>
                                        <div className="text-sm font-bold text-emerald-950">No Incidents Reported</div>
                                        <div className="text-xs text-emerald-800/80 mt-0.5">
                                            This endpoint has experienced zero outages or downtime interruptions in the observed period.
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {incidents.map((incident, idx) => (
                                        <IncidentRow key={incident.id || idx} incident={incident} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recent Telemetry Raw Log */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-[#0D3144] flex items-center space-x-2">
                                <Zap className="w-4 h-4 text-[#1188B8]" />
                                <span>Recent Telemetry Log</span>
                            </h3>

                            <div className="bg-white border border-[#BFE8F8] rounded-xl overflow-hidden text-xs shadow-sm">
                                <div className="divide-y divide-[#E2F3FC] max-h-56 overflow-y-auto">
                                    {recentTelemetryLog.map((check, idx) => (
                                        <TelemetryLogRow key={check.id || idx} check={check} />
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-[#BFE8F8] bg-[#F1FAFE] flex items-center justify-between text-xs text-[#144C66]/70 font-semibold">
                        <span>Timeout limit: {site.timeout}s • Slow threshold: {((site.latency_threshold ?? 5000) / 1000).toFixed(0)}s</span>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-1.5 rounded-lg font-medium text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors"
                        >
                            Close
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default memo(MonitorDrawer);
