import React, { useState, useEffect, useMemo } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    ArrowUpRight,
    BarChart3,
    CheckCircle2,
    Clock,
    Globe,
    Layers,
    Lock,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    XCircle,
    AlertTriangle,
    Bell,
    BellOff,
    Volume2,
    Pause,
    Play,
    Pin,
    Calendar,
    Tag,
    ChevronDown,
    ChevronRight,
    Copy,
    Check,
    Printer,
    FileText,
    LayoutGrid,
    List,
    X,
    Filter,
    LayoutDashboard,
    LogOut
} from 'lucide-react';
import { StatusPageProps, Website, WebsiteCheck, PublicIncident } from '../types';
import MonitorDrawer from '../Components/MonitorDrawer';

export default function StatusPage({
    systemStatus,
    websites,
    stats,
    recentIncidents,
    serverTime,
    schedulerStatus,
    auth,
}: StatusPageProps) {
    // Audio alarm alert states
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
        const stored = localStorage.getItem('webcheck_sound_enabled');
        return stored !== null ? JSON.parse(stored) : true;
    });

    // 5-Min Refresh Controls
    const [refreshInterval, setRefreshInterval] = useState<number>(300);
    const [secondsLeft, setSecondsLeft] = useState<number>(300);
    const [isAutoRefreshPaused, setIsAutoRefreshPaused] = useState<boolean>(false);
    const [isCheckingAll, setIsCheckingAll] = useState<boolean>(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'operational' | 'disrupted'>('all');
    const [viewMode, setViewMode] = useState<'detailed' | 'grid'>('detailed');
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const [secondsSinceCheck, setSecondsSinceCheck] = useState<number>(0);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // Slide-over Analytics Drawer
    const [selectedSiteForDrawer, setSelectedSiteForDrawer] = useState<Website | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        if (selectedSiteForDrawer) {
            const updated = websites.find((s) => s.id === selectedSiteForDrawer.id);
            if (updated) setSelectedSiteForDrawer(updated);
        }
    }, [websites]);

    const openDrawer = (site: Website) => {
        setSelectedSiteForDrawer(site);
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => {
        setIsDrawerOpen(false);
    };

    // Close drawer on Escape key, or press '/' to search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isDrawerOpen) {
                setIsDrawerOpen(false);
            }
            if (e.key === '/' && document.activeElement !== searchInputRef.current) {
                // If not typing in an input, focus search
                if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.preventDefault();
                    searchInputRef.current?.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDrawerOpen]);

    // Track seconds since last server telemetry verification
    useEffect(() => {
        setSecondsSinceCheck(0);
    }, [serverTime]);

    useEffect(() => {
        const timer = setInterval(() => {
            setSecondsSinceCheck((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatSecondsAgo = (seconds: number) => {
        if (seconds < 5) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        const mins = Math.floor(seconds / 60);
        const remSecs = seconds % 60;
        return `${mins}m ${remSecs}s ago`;
    };

    // Sound toggle handler
    const toggleSound = () => {
        setSoundEnabled((prev) => {
            const next = !prev;
            localStorage.setItem('webcheck_sound_enabled', JSON.stringify(next));
            return next;
        });
    };

    // Synthesized Alarm Pulse (Sawtooth oscillator)
    const playAlarmSound = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioCtx = new AudioContextClass();
            const repeats = 4;
            const cycleDuration = 0.85;

            for (let i = 0; i < repeats; i++) {
                const startTime = audioCtx.currentTime + i * cycleDuration;

                const triggerPulse = (freq: number, start: number, duration: number) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();

                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, start);

                    gain.gain.setValueAtTime(0.2, start);
                    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

                    osc.connect(gain);
                    gain.connect(audioCtx.destination);

                    osc.start(start);
                    osc.stop(start + duration);
                };

                triggerPulse(1200, startTime, 0.22);
                triggerPulse(880, startTime + 0.25, 0.22);
                triggerPulse(1200, startTime + 0.50, 0.22);
            }
        } catch (e) {
            console.warn('AudioContext prevented by browser autoplay policy:', e);
        }
    };

    // Auto-trigger fire alarm if any service is down and sound is enabled
    useEffect(() => {
        if (stats.down > 0 && soundEnabled) {
            playAlarmSound();
        }
    }, [stats.down, soundEnabled, serverTime]);

    // Countdown and auto-refresh loop
    useEffect(() => {
        if (isAutoRefreshPaused) return;

        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    triggerRefresh(false);
                    return refreshInterval;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isAutoRefreshPaused, refreshInterval]);

    const formatCountdown = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
    };

    const handleIntervalChange = (newInterval: number) => {
        setRefreshInterval(newInterval);
        setSecondsLeft(newInterval);
    };

    // Immediate Refresh / Reload
    const triggerRefresh = (forceActiveCheck = false) => {
        setIsCheckingAll(true);
        if (forceActiveCheck && auth?.user) {
            router.post(
                '/check-all',
                {},
                {
                    preserveScroll: true,
                    preserveState: true,
                    onFinish: () => {
                        setIsCheckingAll(false);
                        setSecondsLeft(refreshInterval);
                    },
                }
            );
        } else {
            router.reload({
                preserveScroll: true,
                onFinish: () => {
                    setIsCheckingAll(false);
                    setSecondsLeft(refreshInterval);
                },
            });
        }
    };

    // Render 30-bar heartbeat strip in Anakiwa styling
    const renderHeartbeatBars = (checks: WebsiteCheck[] = [], thresholdMs: number = 5000) => {
        const totalBars = 30;
        const missingCount = Math.max(0, totalBars - checks.length);
        const paddedChecks: (WebsiteCheck | null)[] = [
            ...Array(missingCount).fill(null),
            ...checks.slice(-totalBars),
        ];

        return (
            <div className="flex items-center space-x-[2.5px] sm:space-x-[3px] py-1">
                {paddedChecks.map((check, idx) => {
                    if (!check) {
                        return (
                            <div
                                key={`empty-${idx}`}
                                className="w-1.5 h-6 rounded-sm bg-[#BFE8F8]/60 transition-all shrink-0"
                                title="No data recorded"
                            />
                        );
                    }

                    const isUp = check.is_up;
                    const latency = check.response_time;
                    const isSlow = isUp && latency > thresholdMs;
                    const dateStr = check.created_at ? new Date(check.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const retryTag = check.was_retried ? ' [Retried]' : '';
                    const slowTag = isSlow ? ` [Slow > ${(thresholdMs / 1000).toFixed(0)}s]` : '';
                    const tooltipMsg = `${dateStr} • ${isUp ? (isSlow ? 'Slow Response' : 'Operational (Keyword Verified)') : 'Outage'} • ${latency} ms${retryTag}${slowTag}`;

                    return (
                        <div
                            key={check.id || idx}
                            className={`w-1.5 h-6 rounded-sm cursor-pointer transition-all duration-150 shrink-0 hover:scale-y-125 ${
                                isUp
                                    ? isSlow
                                        ? 'bg-amber-400 hover:bg-amber-500 shadow-sm'
                                        : 'bg-[#1FA9D8] hover:bg-[#1188B8] shadow-sm'
                                    : 'bg-rose-500 hover:bg-rose-600 shadow-sm'
                            }`}
                            title={tooltipMsg}
                        />
                    );
                })}
            </div>
        );
    };

    const isAllOperational = systemStatus.state === 'operational';
    const isDegraded = systemStatus.state === 'degraded';
    const isMajorOutage = systemStatus.state === 'major_outage';

    // Prioritize Public Portals on top, then other categories, and Internal Systems at the bottom
    const compareCategories = (a: string, b: string) => {
        const isAPublic = a.toLowerCase().includes('public');
        const isBPublic = b.toLowerCase().includes('public');
        const isAInternal = a.toLowerCase().includes('internal');
        const isBInternal = b.toLowerCase().includes('internal');

        if (isAPublic && !isBPublic) return -1;
        if (!isAPublic && isBPublic) return 1;
        if (isAInternal && !isBInternal) return 1;
        if (!isAInternal && isBInternal) return -1;
        return a.localeCompare(b);
    };

    // Categories list (Public Portals first)
    const availableCategories = useMemo(() => {
        return Array.from(
            new Set(websites.map((w) => w.category || 'Public Portals'))
        ).sort(compareCategories);
    }, [websites]);

    // 1. Category Health Metrics for the Summary Strip
    const categoryHealthStats = useMemo(() => {
        const statsMap: Record<string, { total: number; up: number; avgUptime: number; isInternal: boolean }> = {};
        for (const cat of availableCategories) {
            const catWebsites = websites.filter((w) => (w.category || 'Public Portals') === cat);
            const total = catWebsites.length;
            const up = catWebsites.filter((w) => w.last_is_up).length;
            const avgUptime = total > 0
                ? Number((catWebsites.reduce((acc, curr) => acc + (curr.uptime_24h ?? 100), 0) / total).toFixed(1))
                : 100;
            const isInternal = cat.toLowerCase().includes('internal');
            statsMap[cat] = { total, up, avgUptime, isInternal };
        }
        return statsMap;
    }, [websites, availableCategories]);

    const pinnedStats = useMemo(() => {
        const pinned = websites.filter((w) => w.is_pinned);
        const total = pinned.length;
        const up = pinned.filter((w) => w.last_is_up).length;
        const avgUptime = total > 0
            ? Number((pinned.reduce((acc, curr) => acc + (curr.uptime_24h ?? 100), 0) / total).toFixed(1))
            : 100;
        return { total, up, avgUptime };
    }, [websites]);

    // 100% Emoji-Free Executive Briefing Generator for Viber, MS Teams, Email
    const copyExecutiveBriefing = () => {
        const dateFormatted = new Date().toLocaleString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });

        const statusLabel = isAllOperational
            ? '[ALL SYSTEMS OPERATIONAL]'
            : isDegraded
            ? '[PARTIAL SYSTEM DISRUPTION]'
            : '[CRITICAL OUTAGE DETECTED]';

        const lines = [
            '========================================',
            ' DOST-STII SYSTEM AVAILABILITY BRIEFING',
            '========================================',
            `Status: ${statusLabel}`,
            `As of: ${dateFormatted}`,
            `Monitored Systems: ${stats.up} / ${stats.total} Operational (${stats.overall_uptime}% Uptime)`,
            `Average Latency: ${stats.avg_response_time} ms`,
            '',
            '--- Category Summary ---',
        ];

        if (pinnedStats.total > 0) {
            lines.push(`* Pinned Services: ${pinnedStats.up} / ${pinnedStats.total} Operational (${pinnedStats.avgUptime}% Uptime)`);
        }

        for (const cat of availableCategories) {
            const catStat = categoryHealthStats[cat];
            if (catStat) {
                lines.push(`* ${cat}: ${catStat.up} / ${catStat.total} Operational (${catStat.avgUptime}% Uptime)`);
            }
        }

        if (downServices.length > 0) {
            lines.push('');
            lines.push('--- Active Disruptions ---');
            downServices.forEach((s) => {
                lines.push(`- [ALERT] ${s.name}: ${s.url} (${s.last_error || 'Unreachable'})`);
            });
        }

        lines.push('');
        lines.push(`Live Telemetry: ${typeof window !== 'undefined' ? window.location.origin : ''}/status`);
        lines.push('========================================');

        if (navigator.clipboard) {
            navigator.clipboard.writeText(lines.join('\n')).then(() => {
                setCopyStatus('Briefing copied to clipboard!');
                setTimeout(() => setCopyStatus(null), 3000);
            });
        }
    };

    // Filter websites by search, category, and status
    const filteredWebsites = websites.filter((site) => {
        const matchesSearch =
            site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            site.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (site.category && site.category.toLowerCase().includes(searchTerm.toLowerCase()));

        if (!matchesSearch) return false;

        if (categoryFilter === '__pinned__') {
            if (!site.is_pinned) return false;
        } else if (categoryFilter !== 'all' && (site.category || 'Public Portals') !== categoryFilter) {
            return false;
        }

        if (statusFilter === 'operational' && !site.last_is_up) {
            return false;
        }
        if (statusFilter === 'disrupted' && site.last_is_up) {
            return false;
        }

        return true;
    });

    // Separate group for all services currently experiencing an outage, pinned, and unpinned
    const downServices = filteredWebsites.filter((s) => s.last_is_up === false);
    const pinnedWebsites = filteredWebsites.filter((s) => s.is_pinned === true);
    const unpinnedWebsites = filteredWebsites.filter((s) => !s.is_pinned);

    // Group unpinned services by category
    const groupedWebsites = unpinnedWebsites.reduce<Record<string, Website[]>>((acc, site) => {
        const cat = site.category || 'Public Portals';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(site);
        return acc;
    }, {});

    const handleTogglePin = (site: Website) => {
        router.patch(`/websites/${site.id}/toggle-pin`, {}, {
            preserveScroll: true,
        });
    };

    // 2. Incident Classification Helper
    const getIncidentClassification = (incident: PublicIncident) => {
        const err = (incident.error || '').toLowerCase();

        if (err.includes('keyword') || err.includes('content') || err.includes('integrity')) {
            return {
                label: 'Content / Keyword Integrity',
                tagColor: 'bg-amber-50 text-amber-800 border-amber-300',
            };
        }
        if (err.includes('timed out') || err.includes('timeout')) {
            return {
                label: 'Request Timeout',
                tagColor: 'bg-rose-50 text-rose-800 border-rose-300',
            };
        }
        if (err.includes('could not resolve') || err.includes('dns') || err.includes('name or service not known')) {
            return {
                label: 'DNS Resolution Failure',
                tagColor: 'bg-purple-50 text-purple-800 border-purple-300',
            };
        }
        if (err.includes('connection refused') || err.includes('failed to connect') || err.includes('host unreachable')) {
            return {
                label: 'Host Offline / Unreachable',
                tagColor: 'bg-rose-50 text-rose-800 border-rose-300',
            };
        }
        if (err.includes('500') || err.includes('502') || err.includes('503') || err.includes('504')) {
            return {
                label: 'HTTP 5xx Server Error',
                tagColor: 'bg-orange-50 text-orange-800 border-orange-300',
            };
        }
        if (err.includes('slow') || err.includes('threshold') || err.includes('latency')) {
            return {
                label: 'Performance Degradation',
                tagColor: 'bg-yellow-50 text-yellow-800 border-yellow-300',
            };
        }

        return {
            label: incident.is_ongoing ? 'Major Outage' : 'Service Interruption',
            tagColor: incident.is_ongoing ? 'bg-rose-50 text-rose-800 border-rose-300' : 'bg-slate-100 text-slate-700 border-slate-300',
        };
    };

    // 3. Group Incidents by Month
    const groupedIncidentsByMonth = useMemo(() => {
        const groups: Record<string, PublicIncident[]> = {};

        for (const incident of recentIncidents) {
            let monthYear = 'Recent Events';
            if (incident.started_at) {
                try {
                    const date = new Date(incident.started_at);
                    if (!isNaN(date.getTime())) {
                        monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    }
                } catch {
                    monthYear = 'Recent Events';
                }
            }

            if (!groups[monthYear]) {
                groups[monthYear] = [];
            }
            groups[monthYear].push(incident);
        }

        return groups;
    }, [recentIncidents]);

    const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

    const toggleMonthCollapse = (month: string) => {
        setCollapsedMonths((prev) => ({
            ...prev,
            [month]: !prev[month],
        }));
    };

    const renderServiceRow = (site: Website, isPriorityOutage: boolean = false) => {
        const isUp = site.last_is_up;

        return (
            <div
                key={isPriorityOutage ? `priority-${site.id}` : site.id}
                onClick={() => openDrawer(site)}
                className={`p-4 sm:p-5 cursor-pointer transition-colors group ${
                    isPriorityOutage
                        ? 'bg-rose-50/50 hover:bg-rose-50'
                        : 'hover:bg-[#F1FAFE]/70'
                }`}
                title="Click to view interactive Analytics & Incident Drawer"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                            <h4 className="text-sm font-bold text-[#0D3144] truncate group-hover:text-[#1188B8] transition-colors">
                                {site.name}
                            </h4>
                            <span
                                className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                    isUp
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                <span>{isUp ? 'OPERATIONAL (UP)' : 'OUTAGE (DOWN)'}</span>
                            </span>

                            {site.is_public ? (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] flex items-center space-x-1">
                                    <Globe className="w-2.5 h-2.5" />
                                    <span>Public</span>
                                </span>
                            ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center space-x-1">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>Internal</span>
                                </span>
                            )}
                            {site.is_pinned && (
                                auth?.user ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleTogglePin(site);
                                        }}
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center space-x-1 hover:bg-amber-100 transition-colors cursor-pointer"
                                        title="Pinned to top of category (click to unpin)"
                                    >
                                        <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                        <span>Pinned</span>
                                    </button>
                                ) : (
                                    <span
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center space-x-1"
                                        title="Pinned to top of category"
                                    >
                                        <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                        <span>Pinned</span>
                                    </span>
                                )
                            )}
                        </div>

                        <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                            <a
                                href={site.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-[#1188B8] hover:text-[#0F6D95] inline-flex items-center space-x-1 group/link font-medium"
                            >
                                <span className="truncate max-w-xs">{site.url}</span>
                                <ArrowUpRight className="w-3 h-3 opacity-60 group-hover/link:opacity-100 shrink-0" />
                            </a>

                            {site.keyword && (
                                <span className={`inline-flex items-center space-x-1 text-[11px] font-mono px-2 py-0.5 rounded-md border ${
                                    site.last_keyword_found === true
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                        : site.last_keyword_found === false
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-[#E2F3FC] text-[#144C66] border-[#BFE8F8]'
                                }`}>
                                    <span className="text-[#144C66]/70">Keyword:</span>
                                    <span className="text-[#0D3144] font-semibold">"{site.keyword}"</span>
                                    <span className="opacity-40">•</span>
                                    {site.last_keyword_found === true ? (
                                        <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                            <span>Found</span>
                                        </span>
                                    ) : site.last_keyword_found === false ? (
                                        <span className="text-rose-700 font-semibold flex items-center space-x-1">
                                            <XCircle className="w-3 h-3 text-rose-600" />
                                            <span>Not Found</span>
                                        </span>
                                    ) : (
                                        <span className="text-[#144C66]/60">Pending</span>
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Error message if down */}
                        {/* {site.last_error && !isUp && (
                            <div className="mt-1 text-xs text-rose-600 font-medium flex items-center space-x-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{site.last_error}</span>
                            </div>
                        )} */}
                    </div>

                    {/* Heartbeat Bar & Metrics */}
                    <div className="flex flex-col sm:items-end space-y-1.5 shrink-0 max-w-full overflow-x-auto pb-1">
                        <div className="flex items-center space-x-3">
                            {renderHeartbeatBars(site.recent_checks, site.latency_threshold ?? 5000)}
                            <span className="text-xs font-mono font-bold text-[#0D3144] w-12 text-right">
                                {site.uptime_24h ?? 100}%
                            </span>
                            {auth?.user && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTogglePin(site);
                                    }}
                                    title={site.is_pinned ? 'Unpin from top of group' : 'Pin to top of category group'}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                        site.is_pinned
                                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-300'
                                            : 'text-[#144C66]/60 hover:text-amber-600 hover:bg-[#E2F3FC]'
                                    }`}
                                >
                                    <Pin className={`w-3.5 h-3.5 ${site.is_pinned ? 'fill-amber-500' : ''}`} />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openDrawer(site);
                                }}
                                className="p-1.5 rounded text-[#144C66]/60 hover:text-[#1188B8] hover:bg-[#E2F3FC] transition-colors"
                                title="Open Slide-Over Analytics Drawer"
                            >
                                <BarChart3 className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center space-x-3 text-[11px] text-[#144C66]/80 font-medium">
                            <span>Response Time: <strong className="text-[#0D3144]">{site.last_response_time !== null ? `${site.last_response_time}ms` : (site.avg_latency_24h ? `${site.avg_latency_24h}ms` : '--')}</strong></span>
                            <span>•</span>
                            <span>7d Uptime: <strong className="text-[#0D3144]">{site.uptime_7d ?? 100}%</strong></span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Compact NOC Wall-Mounted Grid Card (Zero Emojis, Pure Vector Icons)
    const renderGridCard = (site: Website) => {
        const isUp = site.last_is_up;
        return (
            <div
                key={site.id}
                onClick={() => openDrawer(site)}
                className={`bg-white border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-3.5 group relative ${
                    isUp ? 'border-[#BFE8F8] hover:border-[#1FA9D8]' : 'border-rose-300 bg-rose-50/40'
                }`}
                title="Click to view full analytics drawer"
            >
                <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <h4 className="text-sm font-bold text-[#0D3144] truncate group-hover:text-[#1188B8] transition-colors">
                                {site.name}
                            </h4>
                            {site.is_pinned && (
                                <Pin className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                        </div>
                        <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] text-[#144C66]/70 hover:text-[#1188B8] truncate block mt-0.5"
                        >
                            {site.url}
                        </a>
                    </div>
                    <div className={`px-2 py-0.5 rounded-md text-[11px] font-bold border shrink-0 flex items-center space-x-1 ${
                        isUp
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse'
                    }`}>
                        {isUp ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                            <XCircle className="w-3 h-3 text-rose-600" />
                        )}
                        <span>{isUp ? 'UP' : 'DOWN'}</span>
                    </div>
                </div>

                <div className="pt-2 border-t border-[#E2F3FC] flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1 text-[#144C66]/80 font-medium">
                        <Activity className="w-3 h-3 text-[#1188B8]" />
                        <span>{site.last_response_time !== null ? `${site.last_response_time}ms` : '--'}</span>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-[#0D3144]">
                        {site.uptime_24h ?? 100}% Uptime
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F1FAFE] text-[#0D3144] flex flex-col font-sans selection:bg-[#1FA9D8] selection:text-white">
            <Head title="Public Systems Status | WebCheck" />

            {/* Print Stylesheet */}
            <style>{`
                @media print {
                    header, footer, .no-print, button, input {
                        display: none !important;
                    }
                    body, main {
                        background: #ffffff !important;
                        color: #000000 !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                    }
                    .print-only {
                        display: block !important;
                    }
                }
                @media screen {
                    .print-only {
                        display: none !important;
                    }
                }
            `}</style>

            {/* Copy Notification Toast */}
            {copyStatus && (
                <div className="fixed bottom-6 right-6 z-50 bg-[#0D3144] text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-xs font-semibold animate-fade-in no-print">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{copyStatus}</span>
                </div>
            )}

            {/* Print Header for Official Audits/Filing */}
            <div className="print-only p-6 border-b-2 border-[#0F6D95] mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-[#0F6D95]">DOST-STII</div>
                        <h1 className="text-2xl font-bold text-black">WebCheck Institutional Availability Report</h1>
                    </div>
                    <div className="text-right text-xs">
                        <div>Report Date: {new Date().toLocaleDateString()}</div>
                        <div>Generated: {new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>

            {/* Header */}
            <header className="border-b border-[#BFE8F8] bg-white/95 backdrop-blur sticky top-0 z-30 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-center space-x-3.5">
                        <div className="p-2 rounded-xl bg-gradient-to-tr from-[#0F6D95] via-[#1188B8] to-[#1FA9D8] text-white shadow-md shadow-[#1FA9D8]/25">
                            <Activity className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-[#1188B8] uppercase tracking-wider">DOST-STII</span>
                            </div>
                            <h1 className="text-lg font-bold tracking-tight text-[#0D3144]">WebCheck Monitor</h1>
                        </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
                        {/* Audio Mute/Unmute */}
                        <button
                            type="button"
                            onClick={toggleSound}
                            className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-sm ${
                                soundEnabled
                                    ? 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#E2F3FC]'
                                    : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                            }`}
                            title={soundEnabled ? 'Click to Mute Alarm' : 'Click to Enable Alarm'}
                        >
                            {soundEnabled ? <Bell className="w-3.5 h-3.5 text-[#1188B8]" /> : <BellOff className="w-3.5 h-3.5 text-rose-500" />}
                            <span className="hidden sm:inline">{soundEnabled ? 'Alarm Active' : 'Alarm Muted'}</span>
                        </button>

                        {/* 1. Test Alarm Sound */}
                        <button
                            type="button"
                            onClick={playAlarmSound}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shadow-sm"
                            title="Test fire alarm audio alert"
                        >
                            <Volume2 className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span className="hidden md:inline">Test Alarm</span>
                        </button>

                        {/* 2. 5-Min Refresh Controls */}
                        <div className="inline-flex items-center bg-white border border-[#BFE8F8] rounded-lg p-0.5 text-xs text-[#144C66] shadow-sm">
                            <button
                                type="button"
                                onClick={() => setIsAutoRefreshPaused(!isAutoRefreshPaused)}
                                className="px-2 py-1 rounded text-[#144C66] hover:text-[#0D3144] flex items-center space-x-1 transition-colors"
                                title={isAutoRefreshPaused ? 'Resume auto refresh' : 'Pause auto refresh'}
                            >
                                {isAutoRefreshPaused ? <Play className="w-3 h-3 text-[#1188B8]" /> : <Pause className="w-3 h-3 text-amber-500" />}
                                <span className="font-semibold">{isAutoRefreshPaused ? 'Paused' : formatCountdown(secondsLeft)}</span>
                            </button>
                            <div className="h-3.5 w-[1px] bg-[#BFE8F8] mx-1"></div>
                            <select
                                value={refreshInterval}
                                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                                className="bg-transparent text-xs text-[#144C66] pr-1.5 py-0.5 focus:outline-none cursor-pointer font-semibold"
                                title="Change refresh interval"
                            >
                                <option value={60} className="bg-white text-[#0D3144]">1m</option>
                                <option value={300} className="bg-white text-[#0D3144]">5m</option>
                                <option value={600} className="bg-white text-[#0D3144]">10m</option>
                            </select>
                        </div>

                        {/* 3. Immediate Refresh / Check All */}
                        <button
                            type="button"
                            onClick={() => triggerRefresh(true)}
                            disabled={isCheckingAll}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm shadow-[#1FA9D8]/20 disabled:opacity-50 transition-all cursor-pointer no-print"
                            title={auth?.user ? 'Run immediate health checks on all monitored endpoints' : 'Refresh live status and telemetry'}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">
                                {isCheckingAll
                                    ? (auth?.user ? 'Checking...' : 'Refreshing...')
                                    : (auth?.user ? 'Check All' : 'Refresh')}
                            </span>
                        </button>

                        {/* Executive Briefing Copy Button */}
                        <button
                            type="button"
                            onClick={copyExecutiveBriefing}
                            className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shadow-sm no-print"
                            title="Copy clean executive availability briefing to clipboard"
                        >
                            {copyStatus ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#1188B8]" />}
                            <span className="hidden md:inline">{copyStatus ? 'Copied!' : 'Briefing'}</span>
                        </button>

                        {/* Print / Export Report Button */}
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shadow-sm no-print"
                            title="Print or export status report (Ctrl+P)"
                        >
                            <Printer className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span className="hidden lg:inline">Print</span>
                        </button>

                        {/* Admin Session Controls (Only visible when logged in) */}
                        {auth?.user && (
                            <div className="flex items-center space-x-1.5 no-print">
                                <Link
                                    href="/dashboard"
                                    className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0F6D95] hover:bg-[#0D3144] text-white transition-colors shadow-sm"
                                    title="Go to Admin Dashboard"
                                >
                                    <LayoutDashboard className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Dashboard</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => router.post('/logout')}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#BFE8F8] text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
                                    title="Sign out of Administrator Session"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Logout</span>
                                </button>
                            </div>
                        )}

                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Hero Status Banner */}
                <div
                    className={`rounded-2xl p-6 sm:p-7 border relative overflow-hidden transition-all shadow-sm ${
                        isAllOperational
                            ? 'bg-gradient-to-r from-emerald-50 via-[#E2F3FC]/50 to-emerald-50 border-emerald-200'
                            : isDegraded
                            ? 'bg-gradient-to-r from-amber-50 via-yellow-50/60 to-amber-50 border-amber-200'
                            : 'bg-gradient-to-r from-rose-50 via-red-50/60 to-rose-50 border-rose-200'
                    }`}
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                        <div className="flex items-start sm:items-center space-x-4">
                            <div
                                className={`p-3 rounded-2xl shrink-0 ${
                                    isAllOperational
                                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        : isDegraded
                                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                        : 'bg-rose-100 text-rose-700 border border-rose-200'
                                }`}
                            >
                                {isAllOperational ? (
                                    <CheckCircle2 className="w-8 h-8" />
                                ) : isDegraded ? (
                                    <AlertTriangle className="w-8 h-8" />
                                ) : (
                                    <ShieldAlert className="w-8 h-8" />
                                )}
                            </div>
                            <div>
                                <h2 className={`text-2xl font-bold tracking-tight ${
                                    isAllOperational
                                        ? 'text-emerald-950'
                                        : isDegraded
                                        ? 'text-amber-950'
                                        : 'text-rose-950'
                                }`}>
                                    {systemStatus.title}
                                </h2>
                            </div>
                        </div>

                        <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-[#BFE8F8]/80 pt-3 sm:pt-0">
                            <span className="text-xs text-[#144C66]/70 uppercase tracking-wider font-bold flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-[#1188B8]" />
                                <span>Telemetry Freshness</span>
                            </span>
                            <span className="text-xs font-mono font-bold text-[#0D3144] mt-0.5">
                                Verified {formatSecondsAgo(secondsSinceCheck)} ({new Date(serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                            </span>
                        </div>
                    </div>
                </div>

                {/* 3-Stat KPI Overview */}
                {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                            <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Overall Uptime (24h)</div>
                            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.overall_uptime}%</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                            <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Monitored Services</div>
                            <div className="text-2xl font-bold text-[#0D3144] mt-1">
                                {stats.up} / {stats.total} <span className="text-xs font-normal text-[#144C66]/60">Operational</span>
                            </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                            <Globe className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 flex items-center justify-between shadow-sm">
                        <div>
                            <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Avg Latency</div>
                            <div className="text-2xl font-bold text-[#1188B8] mt-1">{stats.avg_response_time} ms</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#E2F3FC] text-[#1188B8] border border-[#BFE8F8]">
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                </div> */}

                {/* Feature 1: Category Health Summary Strip */}
                {/* <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#144C66]/70 uppercase tracking-wider px-0.5">
                        <span className="flex items-center space-x-1.5">
                            <Layers className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span>Category Health Summary</span>
                        </span>
                        <span className="text-[11px] font-normal text-[#144C66]/60 hidden sm:inline">
                            Click card to filter services
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {pinnedStats.total > 0 && (
                            <div
                                onClick={() => setCategoryFilter(categoryFilter === '__pinned__' ? 'all' : '__pinned__')}
                                className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                                    categoryFilter === '__pinned__'
                                        ? 'bg-[#E2F3FC] border-[#1FA9D8] ring-2 ring-[#1FA9D8]/20 shadow-md'
                                        : 'bg-white border-[#BFE8F8] hover:border-[#47C0E9] hover:bg-[#F1FAFE]/50'
                                }`}
                                title="Click to filter by Pinned Services"
                            >
                                <div className="flex items-center space-x-3 min-w-0">
                                    <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 shrink-0">
                                        <Pin className="w-4 h-4 fill-amber-500 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-bold text-[#0D3144] truncate">Pinned Services</div>
                                        <div className="text-[11px] text-[#144C66]/70 flex items-center space-x-1.5 mt-0.5">
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${pinnedStats.up === pinnedStats.total ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                            <span>{pinnedStats.up}/{pinnedStats.total} Operational</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-xs font-mono font-bold text-[#1188B8]">{pinnedStats.avgUptime}%</span>
                                    <div className="text-[10px] text-[#144C66]/60">24h Uptime</div>
                                </div>
                            </div>
                        )}

                        {availableCategories.map((cat) => {
                            const data = categoryHealthStats[cat];
                            if (!data) return null;
                            const isAllUp = data.up === data.total;
                            const isSelected = categoryFilter === cat;

                            return (
                                <div
                                    key={cat}
                                    onClick={() => setCategoryFilter(isSelected ? 'all' : cat)}
                                    className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-sm flex items-center justify-between ${
                                        isSelected
                                            ? 'bg-[#E2F3FC] border-[#1FA9D8] ring-2 ring-[#1FA9D8]/20 shadow-md'
                                            : 'bg-white border-[#BFE8F8] hover:border-[#47C0E9] hover:bg-[#F1FAFE]/50'
                                    }`}
                                    title={`Click to filter by ${cat}`}
                                >
                                    <div className="flex items-center space-x-3 min-w-0">
                                        <div className={`p-2 rounded-lg border shrink-0 ${
                                            data.isInternal
                                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                : 'bg-[#E2F3FC] text-[#0F6D95] border-[#BFE8F8]'
                                        }`}>
                                            {data.isInternal ? <Lock className="w-4 h-4 text-amber-600" /> : <Globe className="w-4 h-4 text-[#1188B8]" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-[#0D3144] truncate">{cat}</div>
                                            <div className="text-[11px] text-[#144C66]/70 flex items-center space-x-1.5 mt-0.5">
                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${isAllUp ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                <span>{data.up}/{data.total} Operational</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <span className={`text-xs font-mono font-bold ${isAllUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {data.avgUptime}%
                                        </span>
                                        <div className="text-[10px] text-[#144C66]/60">24h Uptime</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div> */}

                {/* Category Filter, Search Bar, Status Filters, & View Toggle */}
                <div className="space-y-3 no-print">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {/* Search Input with Keyboard '/' Shortcut & Instant Clear 'X' */}
                        <div className="relative flex-1 max-w-md">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#144C66]/50" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search services by name, URL, or category..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-14 py-2 bg-white border border-[#BFE8F8] rounded-xl text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8] shadow-sm transition-all"
                            />
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                                {searchTerm ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="p-1 rounded-md text-[#144C66]/60 hover:text-[#0D3144] hover:bg-[#E2F3FC]"
                                        title="Clear search"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                ) : (
                                    <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-[#144C66]/50 bg-[#F1FAFE] border border-[#BFE8F8] rounded shadow-xs" title="Press '/' anywhere to search">
                                        /
                                    </kbd>
                                )}
                            </div>
                        </div>

                        {/* Status Filter Buttons */}
                        <div className="inline-flex items-center bg-[#E2F3FC]/80 border border-[#BFE8F8] rounded-xl p-0.5 text-xs text-[#144C66]">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('all')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    statusFilter === 'all'
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                All ({websites.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('operational')}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    statusFilter === 'operational'
                                        ? 'bg-white text-emerald-700 font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-emerald-700'
                                }`}
                            >
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Operational ({stats.up})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('disrupted')}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    statusFilter === 'disrupted'
                                        ? 'bg-white text-rose-700 font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-rose-700'
                                }`}
                            >
                                <AlertTriangle className={`w-3 h-3 ${stats.down > 0 ? 'text-rose-500' : 'text-[#144C66]/60'}`} />
                                <span>Disrupted ({stats.down})</span>
                            </button>
                        </div>

                        {/* Detailed vs Compact Grid View Switcher */}
                        <div className="inline-flex items-center bg-[#E2F3FC]/80 border border-[#BFE8F8] rounded-xl p-0.5 text-xs text-[#144C66] shrink-0">
                            <button
                                type="button"
                                onClick={() => setViewMode('detailed')}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    viewMode === 'detailed'
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                                title="Detailed timeline view with 30-day heartbeat strip"
                            >
                                <List className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Detailed</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                                title="High-density grid view for NOC wall displays"
                            >
                                <LayoutGrid className="w-3.5 h-3.5" />
                                <span className="hidden md:inline">Grid</span>
                            </button>
                        </div>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="inline-flex items-center bg-[#E2F3FC]/80 border border-[#BFE8F8] rounded-xl p-0.5 text-xs text-[#144C66] flex-wrap">
                        <button
                            type="button"
                            onClick={() => setCategoryFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                categoryFilter === 'all'
                                    ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                    : 'text-[#144C66]/80 hover:text-[#0D3144]'
                            }`}
                        >
                            All Categories
                        </button>
                        {pinnedStats.total > 0 && (
                            <button
                                type="button"
                                onClick={() => setCategoryFilter('__pinned__')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    categoryFilter === '__pinned__'
                                        ? 'bg-white text-amber-700 font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                Pinned ({pinnedStats.total})
                            </button>
                        )}
                        {availableCategories.map((cat) => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setCategoryFilter(cat)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    categoryFilter === cat
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Categorized Services List with Analytics Drawer triggers */}
                <div className="space-y-6">
                    {/* Dedicated Priority Group for All Currently Down Services */}
                    {downServices.length > 0 && (
                        <div className="space-y-3 bg-rose-50/80 border-2 border-rose-200 rounded-2xl p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2.5">
                                    <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 border border-rose-200">
                                        <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />
                                    </div>
                                    <h3 className="text-base font-bold text-rose-950">Active Service Disruptions</h3>
                                    <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center space-x-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping mr-1"></span>
                                        <span>{downServices.length} {downServices.length === 1 ? 'Outage' : 'Outages'}</span>
                                    </span>
                                </div>
                                <span className="text-xs text-rose-700 font-medium hidden sm:inline">Active Investigation</span>
                            </div>

                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {downServices.map((site) => renderGridCard(site))}
                                </div>
                            ) : (
                                <div className="bg-white border border-rose-200 rounded-2xl divide-y divide-rose-100 overflow-hidden shadow-sm">
                                    {downServices.map((site) => renderServiceRow(site, true))}
                                </div>
                            )}
                        </div>
                    )}

                    {filteredWebsites.length === 0 ? (
                        <div className="bg-white border border-[#BFE8F8] rounded-xl p-10 text-center text-[#144C66]/60 shadow-sm">
                            No monitored services match your search or category filter.
                        </div>
                    ) : (
                        <>
                            {/* Dedicated Group for Pinned Services */}
                            {pinnedWebsites.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-300">
                                                <Pin className="w-4 h-4 fill-amber-500 text-amber-600" />
                                            </div>
                                            <h3 className="text-base font-bold text-[#0D3144]">Pinned Services</h3>
                                            <span className="text-xs text-[#144C66]/60 font-mono">({pinnedWebsites.length})</span>
                                        </div>
                                        <span
                                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 border ${
                                                pinnedWebsites.every((s) => s.last_is_up)
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                            }`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${pinnedWebsites.every((s) => s.last_is_up) ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                            <span>
                                                {pinnedWebsites.every((s) => s.last_is_up)
                                                    ? `${pinnedWebsites.filter((s) => s.last_is_up).length}/${pinnedWebsites.length} Operational`
                                                    : `${pinnedWebsites.filter((s) => !s.last_is_up).length} Disrupted`}
                                            </span>
                                        </span>
                                    </div>

                                    {viewMode === 'grid' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                            {pinnedWebsites.map((site) => renderGridCard(site))}
                                        </div>
                                    ) : (
                                        <div className="bg-white border border-[#BFE8F8] rounded-2xl divide-y divide-[#E2F3FC] overflow-hidden shadow-sm">
                                            {pinnedWebsites.map((site) => renderServiceRow(site, false))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Categorized Services List (Unpinned) */}
                            {Object.entries(groupedWebsites)
                                .sort(([catA], [catB]) => compareCategories(catA, catB))
                                .map(([categoryName, sites]) => {
                                const catTotal = sites.length;
                                const catUp = sites.filter((s) => s.last_is_up).length;
                                const allUp = catUp === catTotal;
                                const isInternal = categoryName.toLowerCase().includes('internal');

                                return (
                                    <div key={categoryName} className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2">
                                                {isInternal ? (
                                                    <Lock className="w-4 h-4 text-amber-600" />
                                                ) : (
                                                    <Globe className="w-4 h-4 text-[#1188B8]" />
                                                )}
                                                <h3 className="text-base font-bold text-[#0D3144]">{categoryName}</h3>
                                                <span className="text-xs text-[#144C66]/60 font-mono">({catTotal})</span>
                                            </div>
                                            <span
                                                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 border ${
                                                    allUp
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                                }`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${allUp ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                <span>{allUp ? `${catUp}/${catTotal} Operational` : `${catTotal - catUp} Disrupted`}</span>
                                            </span>
                                        </div>

                                        {viewMode === 'grid' ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                                {sites.map((site) => renderGridCard(site))}
                                            </div>
                                        ) : (
                                            <div className="bg-white border border-[#BFE8F8] rounded-2xl divide-y divide-[#E2F3FC] overflow-hidden shadow-sm">
                                                {sites.map((site) => renderServiceRow(site, false))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* Features 2 & 3: Incident History Notice Board (Monthly Grouped with Classification Tags) */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Clock className="w-4 h-4 text-[#1188B8]" />
                            <h3 className="text-base font-bold text-[#0D3144]">Incident & Outage History</h3>
                        </div>
                        <span className="text-xs text-[#144C66]/70 font-semibold">
                            {recentIncidents.length === 0 ? 'Zero Disruptions' : `${recentIncidents.length} Total Events`}
                        </span>
                    </div>

                    {recentIncidents.length === 0 ? (
                        <div className="bg-white border border-[#BFE8F8] rounded-2xl p-6 text-center shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-[#0D3144]">No Incidents Reported</h4>
                            <p className="text-xs text-[#144C66]/70 mt-1 max-w-md mx-auto">
                                All monitored public and internal services have maintained uninterrupted availability over the observed period.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {Object.entries(groupedIncidentsByMonth).map(([monthYear, incidentsInMonth], monthIdx) => {
                                const isCollapsed = collapsedMonths[monthYear] !== undefined
                                    ? collapsedMonths[monthYear]
                                    : monthIdx > 0;

                                const totalDowntime = incidentsInMonth.reduce((sum, inc) => sum + (inc.duration_minutes || 0), 0);
                                const ongoingCount = incidentsInMonth.filter((inc) => inc.is_ongoing).length;

                                return (
                                    <div key={monthYear} className="space-y-2.5">
                                        {/* Month Header Accordion */}
                                        <div
                                            onClick={() => toggleMonthCollapse(monthYear)}
                                            className="flex items-center justify-between p-3.5 bg-white hover:bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl cursor-pointer transition-colors shadow-sm select-none"
                                        >
                                            <div className="flex items-center space-x-3">
                                                <span className="text-[#144C66]/70 hover:text-[#0D3144] transition-colors">
                                                    {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </span>
                                                <div className="p-1.5 rounded-lg bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                                                    <Calendar className="w-4 h-4 text-[#1188B8]" />
                                                </div>
                                                <div className="flex items-center space-x-2 flex-wrap">
                                                    <h4 className="text-sm font-bold text-[#0D3144]">{monthYear}</h4>
                                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] font-semibold">
                                                        {incidentsInMonth.length} {incidentsInMonth.length === 1 ? 'Event' : 'Events'}
                                                    </span>
                                                    {ongoingCount > 0 && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                                            {ongoingCount} Active Outage
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-3">
                                                <span className="text-xs text-[#144C66]/70 font-mono font-medium hidden sm:inline">
                                                    {totalDowntime} mins total downtime
                                                </span>
                                                <span className="text-xs text-[#144C66]/60 font-semibold">
                                                    {isCollapsed ? 'Expand' : 'Collapse'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Incidents List in Month */}
                                        {!isCollapsed && (
                                            <div className="space-y-2.5 pl-2 sm:pl-3 border-l-2 border-[#BFE8F8] ml-2">
                                                {incidentsInMonth.map((incident, idx) => {
                                                    const startStr = incident.started_at ? new Date(incident.started_at).toLocaleString() : 'N/A';
                                                    const endStr = incident.ended_at ? new Date(incident.ended_at).toLocaleString() : (incident.is_ongoing ? 'Ongoing' : 'Resolved');
                                                    const classification = getIncidentClassification(incident);

                                                    return (
                                                        <div
                                                            key={idx}
                                                            className={`border rounded-xl p-4 text-xs transition-colors shadow-sm ${
                                                                incident.is_ongoing
                                                                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                                                                    : 'bg-white border-[#BFE8F8] text-[#0D3144]'
                                                            }`}
                                                        >
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-semibold">
                                                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                                                    {incident.is_ongoing ? (
                                                                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                                                                    ) : (
                                                                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                                                    )}
                                                                    <span className="font-bold text-sm text-[#0D3144]">
                                                                        {incident.website_name}
                                                                    </span>

                                                                    {/* Feature 2: Clear Classification Tag */}
                                                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${classification.tagColor} flex items-center space-x-1`}>
                                                                        <Tag className="w-2.5 h-2.5" />
                                                                        <span>{classification.label}</span>
                                                                    </span>

                                                                    {incident.is_ongoing ? (
                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                                                                            Active Outage
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center space-x-1">
                                                                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                                                            <span>Resolved</span>
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] font-bold shrink-0 self-start sm:self-auto">
                                                                    {incident.duration_minutes} min{incident.duration_minutes !== 1 ? 's' : ''} downtime
                                                                </span>
                                                            </div>

                                                            <div className="mt-2 text-[11px] text-[#144C66]/80 flex items-center space-x-1">
                                                                <Clock className="w-3 h-3 text-[#1188B8] shrink-0" />
                                                                {incident.is_ongoing ? (
                                                                    <span>Started: <strong className="text-[#0D3144]">{startStr}</strong> • Ongoing</span>
                                                                ) : (
                                                                    <span>{startStr} &rarr; {endStr}</span>
                                                                )}
                                                            </div>

                                                            {incident.error && (
                                                                <div className="mt-2 text-rose-700 font-mono text-[11px] bg-rose-50 p-2.5 rounded-lg border border-rose-200 truncate" title={incident.error}>
                                                                    <span className="font-bold">Diagnostics:</span> {incident.error}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

            </main>

            {/* Slide-Over Analytics Drawer (Read-Only Mode for Status Page) */}
            <MonitorDrawer
                site={selectedSiteForDrawer}
                isOpen={isDrawerOpen}
                onClose={closeDrawer}
                readOnly={true}
            />

            {/* Footer */}
            <footer className="border-t border-[#BFE8F8] bg-white py-6 text-center text-xs text-[#144C66]/70 shadow-sm mt-auto">
                <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                        <Activity className="w-4 h-4 text-[#1188B8]" />
                        <span>DOST-STII WebCheck &bull; Real-Time Institutional Availability</span>
                    </div>

                    <div className="flex items-center space-x-4">
                        <Link href="/" className="hover:text-[#1188B8] transition-colors font-medium">
                            Live Status
                        </Link>
                        <span>•</span>
                        <Link href="/dashboard" className="hover:text-[#1188B8] transition-colors font-medium">
                            Admin Portal
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
