import React, { useState, useEffect } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import {
    Activity,
    ArrowUpRight,
    Bell,
    BellOff,
    Clock,
    Globe,
    Plus,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    Trash2,
    Volume2,
    Edit3,
    Check,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Pause,
    Play,
    Lock,
    BarChart3,
    Layers,
    ChevronDown,
    ChevronRight,
    Folder,
    X,
    Pin,
    PinOff,
    Copy,
    Printer,
    LogOut
} from 'lucide-react';
import { DashboardProps, Website, WebsiteCheck } from '../types';
import MonitorDrawer from '../Components/MonitorDrawer';

export default function Dashboard({ websites, stats, serverTime, schedulerStatus, auth }: DashboardProps) {
    const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
        const stored = localStorage.getItem('webcheck_sound_enabled');
        return stored !== null ? JSON.parse(stored) : true;
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'up' | 'down'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const [isGroupedView, setIsGroupedView] = useState<boolean>(true);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const [isCronModalOpen, setIsCronModalOpen] = useState(false);
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

    const copyToClipboard = (text: string, label: string) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                setCopiedSnippet(label);
                setTimeout(() => setCopiedSnippet(null), 2500);
            });
        }
    };

    const toggleCategoryCollapse = (cat: string) => {
        setCollapsedCategories((prev) => ({
            ...prev,
            [cat]: !prev[cat],
        }));
    };

    // Default refresh interval is 5 minutes (300 seconds)
    const [refreshInterval, setRefreshInterval] = useState<number>(300);
    const [secondsLeft, setSecondsLeft] = useState<number>(300);
    const [isAutoRefreshPaused, setIsAutoRefreshPaused] = useState<boolean>(false);

    const [isCheckingAll, setIsCheckingAll] = useState(false);
    const [editingSite, setEditingSite] = useState<Website | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [checkingSiteId, setCheckingSiteId] = useState<number | null>(null);

    // Slide-over Drawer for Analytics & Incident Timeline
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

    // Close modals on Escape key, or press '/' to search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isAddModalOpen) setIsAddModalOpen(false);
                if (isDrawerOpen) setIsDrawerOpen(false);
                if (isCronModalOpen) setIsCronModalOpen(false);
            }
            if (e.key === '/' && document.activeElement !== searchInputRef.current) {
                if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
                    e.preventDefault();
                    searchInputRef.current?.focus();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAddModalOpen, isDrawerOpen]);

    // Form for Adding / Editing website
    const { data, setData, post, put, processing, errors, reset } = useForm({
        name: '',
        url: '',
        category: 'Public Portals',
        keyword: '',
        timeout: 20,
        latency_threshold: 5000,
        is_public: true,
        is_pinned: false,
    });

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

    // Trigger audible alarm if any monitored site is down and sound is enabled
    useEffect(() => {
        if (stats.down > 0 && soundEnabled) {
            playAlarmSound();
        }
    }, [stats.down, soundEnabled, serverTime]);

    // Auto-refresh countdown loop
    useEffect(() => {
        if (isAutoRefreshPaused) return;

        const timer = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev <= 1) {
                    triggerCheckAll();
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

    // Check All websites
    const triggerCheckAll = () => {
        setIsCheckingAll(true);
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
    };

    // Check Single website
    const triggerCheckSingle = (siteId: number) => {
        setCheckingSiteId(siteId);
        router.post(
            `/websites/${siteId}/check`,
            {},
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setCheckingSiteId(null),
            }
        );
    };

    // Delete website confirmation
    const handleDelete = (site: Website) => {
        if (confirm(`Are you sure you want to delete "${site.name}"? This removes all historical telemetry.`)) {
            router.delete(`/websites/${site.id}`, {
                preserveScroll: true,
            });
        }
    };

    const openEditModal = (site: Website) => {
        setEditingSite(site);
        setData({
            name: site.name,
            url: site.url,
            category: site.category || 'Public Portals',
            keyword: site.keyword || '',
            timeout: site.timeout || 20,
            latency_threshold: site.latency_threshold || 5000,
            is_public: site.is_public ?? true,
            is_pinned: site.is_pinned ?? false,
        });
        setIsAddModalOpen(true);
    };

    const openAddModal = () => {
        setEditingSite(null);
        reset();
        setData({
            name: '',
            url: '',
            category: 'Public Portals',
            keyword: '',
            timeout: 20,
            latency_threshold: 5000,
            is_public: true,
            is_pinned: false,
        });
        setIsAddModalOpen(true);
    };

    const handleTogglePin = (site: Website) => {
        router.patch(`/websites/${site.id}/toggle-pin`, {}, {
            preserveScroll: true,
        });
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingSite) {
            put(`/websites/${editingSite.id}`, {
                preserveScroll: true,
                onSuccess: () => {
                    setIsAddModalOpen(false);
                    reset();
                },
            });
        } else {
            post('/websites', {
                preserveScroll: true,
                onSuccess: () => {
                    setIsAddModalOpen(false);
                    reset();
                },
            });
        }
    };

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

    // Available categories extracted dynamically (Public Portals first)
    const availableCategories = Array.from(
        new Set(websites.map((w) => w.category || 'Public Portals'))
    ).sort(compareCategories);

    // Filter websites
    const filteredWebsites = websites.filter((site) => {
        const matchesSearch =
            site.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            site.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (site.keyword && site.keyword.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (site.category && site.category.toLowerCase().includes(searchTerm.toLowerCase()));

        if (!matchesSearch) return false;

        if (statusFilter === 'up' && site.last_is_up !== true) return false;
        if (statusFilter === 'down' && site.last_is_up !== false) return false;

        if (categoryFilter !== 'all' && (site.category || 'Public Portals') !== categoryFilter) {
            return false;
        }

        return true;
    });

    // Separate group for all websites that are currently down, pinned, and unpinned
    const downWebsites = filteredWebsites.filter((site) => site.last_is_up === false);
    const pinnedWebsites = filteredWebsites.filter((site) => site.is_pinned === true);
    const unpinnedWebsites = filteredWebsites.filter((site) => !site.is_pinned);

    // Group unpinned websites by category
    const groupedWebsites = unpinnedWebsites.reduce<Record<string, Website[]>>((acc, site) => {
        const cat = site.category || 'Public Portals';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(site);
        return acc;
    }, {});

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

        const isAllUp = stats.down === 0;
        const lines = [
            '========================================',
            ' DOST-STII SYSTEM AVAILABILITY BRIEFING',
            '========================================',
            `Status: ${isAllUp ? '[ALL SYSTEMS OPERATIONAL]' : '[ACTIVE SYSTEM DISRUPTIONS]'}`,
            `As of: ${dateFormatted}`,
            `Monitored Systems: ${stats.up} / ${stats.total} Operational (${stats.overall_uptime}% Uptime)`,
            `Average Latency: ${stats.avg_response_time} ms`,
            '',
            '--- Category Summary ---',
        ];

        if (pinnedWebsites.length > 0) {
            const pinnedUp = pinnedWebsites.filter((s) => s.last_is_up).length;
            lines.push(`* Pinned Services: ${pinnedUp} / ${pinnedWebsites.length} Operational`);
        }

        for (const cat of availableCategories) {
            const catSites = websites.filter((w) => (w.category || 'Public Portals') === cat);
            const catUp = catSites.filter((w) => w.last_is_up).length;
            lines.push(`* ${cat}: ${catUp} / ${catSites.length} Operational`);
        }

        if (stats.down > 0) {
            lines.push('');
            lines.push('--- Active Disruptions ---');
            websites.filter((s) => !s.last_is_up).forEach((s) => {
                lines.push(`- [ALERT] ${s.name}: ${s.url} (${s.last_error || 'Unreachable'})`);
            });
        }

        lines.push('');
        lines.push(`Live Status: ${typeof window !== 'undefined' ? window.location.origin : ''}/`);
        lines.push('========================================');

        if (navigator.clipboard) {
            navigator.clipboard.writeText(lines.join('\n')).then(() => {
                setCopyStatus('Briefing copied to clipboard!');
                setTimeout(() => setCopyStatus(null), 3000);
            });
        }
    };

    // Pad heartbeat bars to ensure exactly 30 bars are displayed
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
                                className="w-1.5 h-6 sm:h-7 rounded-sm bg-[#BFE8F8]/60 transition-all shrink-0"
                                title="No data recorded"
                            />
                        );
                    }

                    const isUp = check.is_up;
                    const latency = check.response_time;
                    const isSlow = isUp && latency > thresholdMs;
                    const dateStr = check.created_at ? new Date(check.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                    const retryTag = check.was_retried ? ' [Retried]' : '';
                    const slowTag = isSlow ? ` [Slow > ${(thresholdMs / 1000).toFixed(0)}s threshold]` : '';
                    const tooltipMsg = `${dateStr} • ${isUp ? (isSlow ? 'SLOW RESPONSE' : 'UP (Keyword Verified)') : 'DOWN'} • ${latency} ms${retryTag}${slowTag}${check.error ? ` (${check.error})` : ''}`;

                    return (
                        <div
                            key={check.id || idx}
                            className={`w-1.5 h-6 sm:h-7 rounded-sm cursor-pointer transition-all duration-150 shrink-0 hover:scale-y-125 ${
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

    // Render individual website card
    const renderSiteCard = (site: Website) => {
        const isCheckingThis = checkingSiteId === site.id || isCheckingAll;
        const isUp = site.last_is_up === true;
        const isDown = site.last_is_up === false;

        return (
            <div
                key={site.id}
                onClick={() => openDrawer(site)}
                className="bg-white border border-[#BFE8F8] hover:border-[#47C0E9] hover:shadow-md cursor-pointer rounded-xl p-4 sm:p-5 transition-all shadow-sm group"
            >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">

                    {/* Left: Status, Name, URL, Keyword, Category */}
                    <div className="flex items-start space-x-3.5 min-w-[280px]">
                        <div className="pt-0.5">
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

                        <div className="flex-1">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <h3 className="font-semibold text-[#0D3144] text-sm sm:text-base group-hover:text-[#1188B8] transition-colors">{site.name}</h3>
                                {isUp && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        UP
                                    </span>
                                )}
                                {isDown && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                        DOWN
                                    </span>
                                )}
                                {site.is_public ? (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] flex items-center space-x-1" title="Visible on Public Status Page (/status)">
                                        <Globe className="w-2.5 h-2.5" />
                                        <span>Public</span>
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center space-x-1" title="Internal only - Hidden from Public Status Page">
                                        <Lock className="w-2.5 h-2.5" />
                                        <span>Private</span>
                                    </span>
                                )}
                                {site.is_pinned && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 flex items-center space-x-1" title="Pinned to top of category">
                                        <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                        <span>Pinned</span>
                                    </span>
                                )}
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E2F3FC] border border-[#BFE8F8] text-[#144C66]">
                                    {site.category || 'Public Portals'}
                                </span>
                            </div>

                            <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                                <a
                                    href={site.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs text-[#1188B8] hover:text-[#0F6D95] font-medium transition-colors inline-flex items-center space-x-0.5 group/link"
                                >
                                    <span className="truncate max-w-xs">{site.url}</span>
                                    <ArrowUpRight className="w-3 h-3 opacity-60 group-hover/link:opacity-100 shrink-0" />
                                </a>
                                {site.keyword && (
                                    <span className={`inline-flex items-center space-x-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                        site.last_keyword_found === true
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : site.last_keyword_found === false
                                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                                            : 'bg-[#E2F3FC] text-[#144C66] border-[#BFE8F8]'
                                    }`}>
                                        <span className="text-[#144C66]/70">Key:</span>
                                        <span className="text-[#0D3144] font-semibold">"{site.keyword}"</span>
                                        <span className="opacity-40">•</span>
                                        {site.last_keyword_found === true ? (
                                            <span className="text-emerald-700 font-semibold flex items-center space-x-1">
                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                                                <span>Found</span>
                                            </span>
                                        ) : site.last_keyword_found === false ? (
                                            <span className="text-rose-700 font-semibold flex items-center space-x-1">
                                                <XCircle className="w-2.5 h-2.5 text-rose-600" />
                                                <span>Not Found</span>
                                            </span>
                                        ) : (
                                            <span className="text-[#144C66]/60">Pending</span>
                                        )}
                                    </span>
                                )}
                            </div>

                            {/* Error message if down */}
                            {/* {site.last_error && isDown && (
                                <div className="mt-1 text-xs text-rose-600 font-medium flex items-center space-x-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{site.last_error}</span>
                                </div>
                            )} */}
                        </div>
                    </div>

                    {/* Center: Heartbeat 30-Bar Strip */}
                    <div className="flex flex-col items-start lg:items-center max-w-full overflow-x-auto pb-1">
                        <div className="flex items-center justify-between w-full text-[11px] text-[#144C66]/70 mb-1 px-0.5">
                            <span>Historical Checks (Last 30)</span>
                            <span className="font-semibold text-[#0D3144]">
                                {site.uptime_24h !== undefined ? `${site.uptime_24h}%` : '100%'}
                            </span>
                        </div>
                        {renderHeartbeatBars(site.recent_checks, site.latency_threshold ?? 5000)}
                    </div>

                    {/* Right: Response Time & Action Buttons */}
                    <div className="flex items-center justify-between lg:justify-end space-x-3 sm:space-x-4 pt-2.5 lg:pt-0 border-t lg:border-t-0 border-[#E2F3FC]">
                        {/* Response Time before keyword is found */}
                        <div className="text-left lg:text-right">
                            <div className="text-xs font-mono font-bold text-[#0D3144]">
                                {site.last_response_time !== null ? `${site.last_response_time} ms` : '--'}
                            </div>
                            <div className="text-[10px] text-[#144C66]/70 font-medium">
                                {site.last_is_up ? (site.keyword ? 'Keyword found' : 'Response time') : (site.last_error ? 'Content outage' : '--')}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center space-x-1 sm:space-x-1.5">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openDrawer(site);
                                }}
                                title="View Analytics & Incident Timeline"
                                className="p-2 sm:p-1.5 rounded-lg text-[#144C66]/70 hover:text-[#1188B8] hover:bg-[#E2F3FC] transition-colors"
                            >
                                <BarChart3 className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    triggerCheckSingle(site.id);
                                }}
                                disabled={isCheckingThis}
                                title="Re-check now"
                                className="p-2 sm:p-1.5 rounded-lg text-[#144C66]/70 hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${isCheckingThis ? 'animate-spin text-[#1188B8]' : ''}`} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleTogglePin(site);
                                }}
                                title={site.is_pinned ? 'Unpin from top' : 'Pin to top of category group'}
                                className={`p-2 sm:p-1.5 rounded-lg transition-colors ${
                                    site.is_pinned
                                        ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-300'
                                        : 'text-[#144C66]/70 hover:text-amber-600 hover:bg-[#E2F3FC]'
                                }`}
                            >
                                <Pin className={`w-4 h-4 ${site.is_pinned ? 'fill-amber-500' : ''}`} />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(site);
                                }}
                                title="Edit monitor settings"
                                className="p-2 sm:p-1.5 rounded-lg text-[#144C66]/70 hover:text-[#1188B8] hover:bg-[#E2F3FC] transition-colors"
                            >
                                <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(site);
                                }}
                                title="Delete monitor"
                                className="p-2 sm:p-1.5 rounded-lg text-[#144C66]/70 hover:text-rose-600 hover:bg-[#E2F3FC] transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-[#F1FAFE] text-[#0D3144] flex flex-col font-sans selection:bg-[#1FA9D8] selection:text-white">
            <Head title="System Monitor | WebCheck" />

            {/* Copy Notification Toast */}
            {copyStatus && (
                <div className="fixed bottom-6 right-6 z-50 bg-[#0D3144] text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 text-xs font-semibold animate-fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{copyStatus}</span>
                </div>
            )}

            {/* Top Navigation */}
            <header className="border-b border-[#BFE8F8] bg-white/95 backdrop-blur sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-3.5">
                        <div className="p-2 rounded-xl bg-gradient-to-tr from-[#0F6D95] via-[#1188B8] to-[#1FA9D8] text-white shadow-md shadow-[#1FA9D8]/20">
                            <Activity className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center space-x-2.5">
                                <span className="text-xs font-bold text-[#1188B8] uppercase tracking-wider">DOST-STII</span>
                                <span className="text-[#BFE8F8]">•</span>
                                <h1 className="text-lg font-bold tracking-tight text-[#0D3144]">WebCheck Monitor</h1>
                            </div>
                        </div>
                    </div>

                    {/* Action Controls */}
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

                        {/* Test Alarm Sound */}
                        <button
                            type="button"
                            onClick={playAlarmSound}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shadow-sm"
                            title="Test fire alarm sound"
                        >
                            <Volume2 className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span className="hidden md:inline">Test</span>
                        </button>

                        {/* 5-Min Refresh Controls */}
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

                        {/* Immediate Check All */}
                        <button
                            type="button"
                            onClick={triggerCheckAll}
                            disabled={isCheckingAll}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm shadow-[#1FA9D8]/20 disabled:opacity-50 transition-all cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAll ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">{isCheckingAll ? 'Checking...' : 'Check All'}</span>
                        </button>

                        {/* 24/7 Background Scheduler Indicator & Setup Button */}
                        <button
                            type="button"
                            onClick={() => setIsCronModalOpen(true)}
                            className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-sm ${
                                schedulerStatus?.is_healthy
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                    : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                            }`}
                            title="Click to view 24/7 background monitoring status and server setup guide"
                        >
                            {schedulerStatus?.is_healthy ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span className="hidden lg:inline font-semibold">24/7 Monitor Active</span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span className="hidden lg:inline font-semibold">24/7 Setup Needed</span>
                                </>
                            )}
                        </button>

                        {/* Executive Briefing Copy Button */}
                        <button
                            type="button"
                            onClick={copyExecutiveBriefing}
                            className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shadow-sm"
                            title="Copy clean executive availability briefing to clipboard"
                        >
                            {copyStatus ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-[#1188B8]" />}
                            <span className="hidden md:inline">{copyStatus ? 'Copied!' : 'Briefing'}</span>
                        </button>

                        {/* Public Status Page Link */}
                        <a
                            href="/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E2F3FC] hover:bg-[#BFE8F8] text-[#0F6D95] border border-[#BFE8F8] transition-colors shadow-sm"
                            title="Open Public Status Page (/) in new tab"
                        >
                            <Globe className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span className="hidden sm:inline">Public Status</span>
                            <ArrowUpRight className="w-3 h-3 opacity-60" />
                        </a>

                        {/* Add Website */}
                        <button
                            type="button"
                            onClick={openAddModal}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm shadow-[#1FA9D8]/20 transition-all cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add Monitor</span>
                        </button>

                        {/* Logout Button */}
                        <button
                            type="button"
                            onClick={() => router.post('/logout')}
                            className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-rose-50 text-[#144C66] hover:text-rose-600 border border-[#BFE8F8] hover:border-rose-200 transition-colors shadow-sm cursor-pointer"
                            title="Sign out of Administrator Session"
                        >
                            <LogOut className="w-3.5 h-3.5 text-rose-500" />
                            <span className="hidden md:inline">Logout</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-6">

                {/* Status Banner */}
                {stats.any_down ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 rounded-xl bg-rose-100 border border-rose-200 text-rose-600">
                                    <ShieldAlert className="w-8 h-8 animate-bounce" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-rose-950 flex items-center space-x-2">
                                        <span>System Disruption Detected</span>
                                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 font-semibold">
                                            {stats.down} {stats.down === 1 ? 'Service Down' : 'Services Down'}
                                        </span>
                                    </h2>
                                    <p className="text-xs text-rose-700 mt-1">
                                        One or more monitored endpoints are currently unreachable or failing keyword content validation.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6">
                                <div className="text-right">
                                    <div className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Overall Uptime (24h)</div>
                                    <div className="text-2xl font-bold text-rose-700">{stats.overall_uptime}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-gradient-to-r from-emerald-50 via-[#E2F3FC]/50 to-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700">
                                    <ShieldCheck className="w-8 h-8" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-emerald-950 flex items-center space-x-2">
                                        <span>All Systems Operational</span>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                                            Healthy
                                        </span>
                                    </h2>
                                </div>
                            </div>
                            <div className="flex items-center space-x-6">
                                <div className="text-right">
                                    <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Overall Uptime (24h)</div>
                                    <div className="text-2xl font-bold text-emerald-700">{stats.overall_uptime}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 24/7 Background Scheduler Alert if Inactive */}
                {schedulerStatus && !schedulerStatus.is_healthy && (
                    <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                        <div className="flex items-start space-x-3.5">
                            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 border border-amber-200 shrink-0 mt-0.5">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-amber-950 flex items-center space-x-2 flex-wrap gap-y-1">
                                    <span>24/7 Background Monitoring Inactive</span>
                                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                                        {schedulerStatus.minutes_ago !== null ? `Last background scan ${schedulerStatus.minutes_ago}m ago` : 'No background scans detected'}
                                    </span>
                                </h3>
                                <p className="text-xs text-amber-900/80 mt-1 max-w-3xl">
                                    When no browser tab is left open, the server requires a background cron job, continuous daemon, or webhook trigger to monitor outages and log uptime 24/7.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsCronModalOpen(true)}
                            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors shrink-0 cursor-pointer"
                        >
                            Setup 24/7 Monitoring
                        </button>
                    </div>
                )}

                {/* KPI Metrics */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 shadow-sm">
                        <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Monitored Services</div>
                        <div className="mt-1.5 text-2xl font-bold text-[#0D3144]">{stats.total}</div>
                    </div>
                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 shadow-sm">
                        <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Operational (UP)</div>
                        <div className="mt-1.5 text-2xl font-bold text-emerald-600">{stats.up}</div>
                    </div>
                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 shadow-sm">
                        <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Outages (DOWN)</div>
                        <div className={`mt-1.5 text-2xl font-bold ${stats.down > 0 ? 'text-rose-600' : 'text-[#144C66]/50'}`}>
                            {stats.down}
                        </div>
                    </div>
                    <div className="bg-white border border-[#BFE8F8] rounded-xl p-4 shadow-sm">
                        <div className="text-xs font-bold text-[#144C66]/70 uppercase tracking-wider">Avg Latency</div>
                        <div className="mt-1.5 text-2xl font-bold text-[#1188B8]">{stats.avg_response_time} ms</div>
                    </div>
                </div>

                {/* Filters and Search Bar */}
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#144C66]/50" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search monitors by name, URL, or category..."
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

                    <div className="flex items-center flex-wrap gap-2">
                        {/* Category Filter Pills */}
                        <div className="inline-flex items-center bg-[#E2F3FC]/80 border border-[#BFE8F8] rounded-lg p-0.5 text-xs text-[#144C66]">
                            <button
                                type="button"
                                onClick={() => setCategoryFilter('all')}
                                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                    categoryFilter === 'all'
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                All Categories
                            </button>
                            {availableCategories.map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategoryFilter(cat)}
                                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                        categoryFilter === cat
                                            ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                            : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                {cat}
                            </button>
                            ))}
                        </div>

                        {/* Status Filter Pills */}
                        <div className="inline-flex items-center bg-[#E2F3FC]/80 border border-[#BFE8F8] rounded-lg p-0.5 text-xs text-[#144C66]">
                            <button
                                type="button"
                                onClick={() => setStatusFilter('all')}
                                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                    statusFilter === 'all'
                                        ? 'bg-white text-[#0F6D95] font-bold shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                All ({websites.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('up')}
                                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                    statusFilter === 'up'
                                        ? 'bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-[#0D3144]'
                                }`}
                            >
                                UP ({stats.up})
                            </button>
                            <button
                                type="button"
                                onClick={() => setStatusFilter('down')}
                                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                                    statusFilter === 'down'
                                        ? 'bg-rose-50 text-rose-700 font-bold border border-rose-200 shadow-sm'
                                        : 'text-[#144C66]/80 hover:text-rose-600'
                                }`}
                            >
                                DOWN ({stats.down})
                            </button>
                        </div>

                        {/* Grouped vs Flat View Toggle */}
                        <button
                            type="button"
                            onClick={() => setIsGroupedView(!isGroupedView)}
                            className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors shadow-sm ${
                                isGroupedView
                                    ? 'bg-white border-[#BFE8F8] text-[#0F6D95]'
                                    : 'bg-[#E2F3FC]/80 border-[#BFE8F8] text-[#144C66] hover:text-[#0D3144]'
                            }`}
                            title={isGroupedView ? 'Switch to flat list view' : 'Switch to category-grouped view'}
                        >
                            <Layers className="w-3.5 h-3.5 text-[#1188B8]" />
                            <span>{isGroupedView ? 'Grouped' : 'Flat'}</span>
                        </button>
                    </div>
                </div>

                {/* Monitor List (Grouped or Flat) */}
                <div className="space-y-4">
                    {filteredWebsites.length === 0 ? (
                        <div className="bg-white border border-[#BFE8F8] rounded-xl p-12 text-center text-[#144C66]/60 shadow-sm">
                            No monitored websites match your criteria.
                        </div>
                    ) : (
                        <>
                            {/* Separate Priority Alert Group for All Currently Down Services */}
                            {downWebsites.length > 0 && statusFilter !== 'down' && (
                                <div className="space-y-3 bg-rose-50/80 border-2 border-rose-200 rounded-2xl p-3.5 sm:p-4 shadow-sm">
                                    {/* Group Header */}
                                    <div
                                        onClick={() => toggleCategoryCollapse('__active_outages__')}
                                        className="flex items-center justify-between p-3.5 bg-rose-100/70 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer transition-colors shadow-sm select-none"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <span className="text-rose-700 hover:text-rose-900 transition-colors">
                                                {collapsedCategories['__active_outages__'] ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                            </span>
                                            <div className="p-1.5 rounded-lg bg-rose-200/60 text-rose-700 border border-rose-300">
                                                <ShieldAlert className="w-4 h-4 text-rose-700 animate-pulse" />
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2.5 flex-wrap">
                                                    <h3 className="text-sm font-bold text-rose-950 tracking-wide">
                                                        Currently Down / Active Outages
                                                    </h3>
                                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 border border-rose-300 font-bold flex items-center space-x-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping mr-1"></span>
                                                        <span>{downWebsites.length} {downWebsites.length === 1 ? 'Service Down' : 'Services Down'}</span>
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-rose-700 mt-0.5">
                                                    Isolated emergency group: endpoints failing keyword content validation or unreachable.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-3">
                                            <span className="text-xs text-rose-700 hidden sm:inline font-semibold">
                                                {collapsedCategories['__active_outages__'] ? 'Expand Outages' : 'Collapse Outages'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Down Monitors List */}
                                    {!collapsedCategories['__active_outages__'] && (
                                        <div className="space-y-2.5 pl-2 sm:pl-3 border-l-2 border-rose-300 ml-2">
                                            {downWebsites.map((site) => renderSiteCard(site))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isGroupedView ? (
                                /* Category Grouped View */
                                <>
                                    {/* Dedicated Group for Pinned Websites */}
                                    {pinnedWebsites.length > 0 && (
                                        <div className="space-y-3">
                                            {/* Pinned Section Header */}
                                            <div
                                                onClick={() => toggleCategoryCollapse('__pinned_websites__')}
                                                className="flex items-center justify-between p-3.5 bg-white hover:bg-[#F1FAFE] border border-amber-300/80 rounded-xl cursor-pointer transition-colors shadow-sm select-none"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <span className="text-[#144C66]/70 hover:text-[#0D3144] transition-colors">
                                                        {collapsedCategories['__pinned_websites__'] ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </span>
                                                    <div className="p-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-300">
                                                        <Pin className="w-4 h-4 fill-amber-500 text-amber-600" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center space-x-2.5">
                                                            <h3 className="text-sm font-bold text-[#0D3144] tracking-wide">Pinned Websites</h3>
                                                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold">
                                                                {pinnedWebsites.length} {pinnedWebsites.length === 1 ? 'monitor' : 'monitors'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center space-x-3">
                                                    <span
                                                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 border ${
                                                            pinnedWebsites.every((s) => s.last_is_up === true)
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-rose-50 text-rose-700 border-rose-200'
                                                        }`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${pinnedWebsites.every((s) => s.last_is_up === true) ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                        <span>
                                                            {pinnedWebsites.every((s) => s.last_is_up === true)
                                                                ? `${pinnedWebsites.filter((s) => s.last_is_up === true).length}/${pinnedWebsites.length} Operational`
                                                                : `${pinnedWebsites.filter((s) => s.last_is_up === false).length} Disrupted`}
                                                        </span>
                                                    </span>
                                                    <span className="text-xs text-[#144C66]/60 hidden sm:inline font-medium">
                                                        {collapsedCategories['__pinned_websites__'] ? 'Expand' : 'Collapse'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Pinned Monitors List */}
                                            {!collapsedCategories['__pinned_websites__'] && (
                                                <div className="space-y-2.5 pl-2 sm:pl-3 border-l-2 border-amber-300/80 ml-2">
                                                    {pinnedWebsites.map((site) => renderSiteCard(site))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Categorized Unpinned Monitors */}
                                    {Object.entries(groupedWebsites)
                                        .sort(([catA], [catB]) => compareCategories(catA, catB))
                                        .map(([categoryName, sites]) => {
                                            const isCollapsed = collapsedCategories[categoryName];
                                            const catTotal = sites.length;
                                            const catUp = sites.filter((s) => s.last_is_up === true).length;
                                            const catDown = sites.filter((s) => s.last_is_up === false).length;
                                            const allCatUp = catDown === 0;
                                            const isInternal = categoryName.toLowerCase().includes('internal');

                                            return (
                                                <div key={categoryName} className="space-y-3">
                                                    {/* Category Section Header */}
                                                    <div
                                                        onClick={() => toggleCategoryCollapse(categoryName)}
                                                        className="flex items-center justify-between p-3.5 bg-white hover:bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl cursor-pointer transition-colors shadow-sm select-none"
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <span className="text-[#144C66]/70 hover:text-[#0D3144] transition-colors">
                                                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </span>
                                                            <div
                                                                className={`p-1.5 rounded-lg border ${
                                                                    isInternal
                                                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                                                        : 'bg-[#E2F3FC] text-[#0F6D95] border-[#BFE8F8]'
                                                                }`}
                                                            >
                                                                {isInternal ? <Lock className="w-4 h-4 text-amber-600" /> : <Globe className="w-4 h-4 text-[#1188B8]" />}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center space-x-2.5">
                                                                    <h3 className="text-sm font-bold text-[#0D3144] tracking-wide">{categoryName}</h3>
                                                                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                                                                        {catTotal} {catTotal === 1 ? 'monitor' : 'monitors'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center space-x-3">
                                                            <span
                                                                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center space-x-1.5 border ${
                                                                    allCatUp
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                                                }`}
                                                            >
                                                                <span className={`w-1.5 h-1.5 rounded-full ${allCatUp ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                                                                <span>{allCatUp ? `${catUp}/${catTotal} Operational` : `${catDown} Disrupted`}</span>
                                                            </span>
                                                            <span className="text-xs text-[#144C66]/60 hidden sm:inline font-medium">
                                                                {isCollapsed ? 'Expand' : 'Collapse'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Category Monitors List */}
                                                    {!isCollapsed && (
                                                        <div className="space-y-2.5 pl-2 sm:pl-3 border-l-2 border-[#BFE8F8] ml-2">
                                                            {sites.map((site) => renderSiteCard(site))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </>
                            ) : (
                                /* Flat List View */
                                filteredWebsites
                                    .slice()
                                    .sort((a, b) => {
                                        if (a.is_pinned !== b.is_pinned) {
                                            return (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
                                        }
                                        const catCompare = compareCategories(a.category || 'Public Portals', b.category || 'Public Portals');
                                        if (catCompare !== 0) return catCompare;
                                        return a.name.localeCompare(b.name);
                                    })
                                    .map((site) => renderSiteCard(site))
                            )}
                    </>
                )}
                </div>
            </main>

            {/* Modal for Adding or Editing Website */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0D3144]/50 backdrop-blur-sm">
                    {/* Backdrop click to close */}
                    <div
                        className="absolute inset-0"
                        onClick={() => setIsAddModalOpen(false)}
                    />

                    {/* Modal Panel Container */}
                    <div className="bg-white border border-[#BFE8F8] rounded-2xl w-full max-w-lg sm:max-w-xl max-h-[92vh] flex flex-col shadow-2xl relative z-10 overflow-hidden">
                        {/* Header */}
                        <div className="px-5 sm:px-6 py-4 border-b border-[#BFE8F8] flex items-center justify-between bg-[#F1FAFE] shrink-0">
                            <div className="min-w-0 pr-2">
                                <div className="flex items-center space-x-2 flex-wrap">
                                    <h2 className="text-base sm:text-lg font-bold text-[#0D3144]">
                                        {editingSite ? 'Edit Monitored Website' : 'Add New Website to Monitor'}
                                    </h2>
                                    {editingSite && (
                                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8] truncate max-w-[160px] sm:max-w-[220px]">
                                            {editingSite.name}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-[#144C66]/70 mt-0.5">
                                    Configure endpoint URL, category group, timeout, and response time thresholds.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-1.5 rounded-lg text-[#144C66]/60 hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors shrink-0"
                                title="Close modal (Esc)"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form Body - Scrollable */}
                        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto flex flex-col">
                            <div className="p-5 sm:p-6 space-y-4 flex-1">
                                <div>
                                    <label className="block text-xs font-semibold text-[#0D3144] mb-1">Display Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Science.ph Portal"
                                        value={data.name}
                                        onChange={(e) => setData('name', e.target.value)}
                                        className="w-full px-3 py-2 bg-white border border-[#BFE8F8] rounded-lg text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8]"
                                    />
                                    {errors.name && <p className="text-xs text-rose-600 mt-1">{errors.name}</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#0D3144] mb-1">Endpoint URL</label>
                                    <input
                                        type="url"
                                        required
                                        placeholder="https://example.com"
                                        value={data.url}
                                        onChange={(e) => setData('url', e.target.value)}
                                        className="w-full px-3 py-2 bg-white border border-[#BFE8F8] rounded-lg text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8]"
                                    />
                                    {errors.url && <p className="text-xs text-rose-600 mt-1">{errors.url}</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-[#0D3144] mb-1">Category Group</label>
                                    <div className="space-y-1.5">
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Public Portals"
                                            value={data.category}
                                            onChange={(e) => setData('category', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-[#BFE8F8] rounded-lg text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8]"
                                        />
                                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setData((prev) => ({ ...prev, category: 'Public Portals', is_public: true }))}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center truncate ${
                                                    data.category === 'Public Portals'
                                                        ? 'bg-[#E2F3FC] border-[#47C0E9] text-[#0F6D95] font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                Public Portals
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setData((prev) => ({ ...prev, category: 'Internal Systems', is_public: false }))}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center truncate ${
                                                    data.category === 'Internal Systems'
                                                        ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                Internal Systems
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setData('category', 'APIs & Services')}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center truncate ${
                                                    data.category === 'APIs & Services'
                                                        ? 'bg-[#E2F3FC] border-[#47C0E9] text-[#0F6D95] font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                APIs & Services
                                            </button>
                                        </div>
                                    </div>
                                    {errors.category && <p className="text-xs text-rose-600 mt-1">{errors.category}</p>}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-[#0D3144] mb-1">
                                            Expected Keyword (Criteria 3 Content Check)
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. DOST-STII"
                                            value={data.keyword}
                                            onChange={(e) => setData('keyword', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-[#BFE8F8] rounded-lg text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8]"
                                        />
                                        <p className="text-[11px] text-[#144C66]/70 mt-0.5">
                                            Primary health check: marks site UP when this keyword is found in the response body.
                                        </p>
                                        {errors.keyword && <p className="text-xs text-rose-600 mt-1">{errors.keyword}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-[#0D3144] mb-1">Timeout (seconds)</label>
                                        <input
                                            type="number"
                                            min={5}
                                            max={60}
                                            value={data.timeout}
                                            onChange={(e) => setData('timeout', parseInt(e.target.value) || 20)}
                                            className="w-full px-3 py-2 bg-white border border-[#BFE8F8] rounded-lg text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1FA9D8]/20 focus:border-[#1FA9D8]"
                                        />
                                        <p className="text-[11px] text-[#144C66]/70 mt-0.5">
                                            Recommended: 20–30s for portals.
                                        </p>
                                        {errors.timeout && <p className="text-xs text-rose-600 mt-1">{errors.timeout}</p>}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-semibold text-[#0D3144]">
                                            Slow Response Warning Threshold
                                        </label>
                                        <span className="text-xs font-mono font-bold text-[#1188B8]">
                                            {((data.latency_threshold || 5000) / 1000).toFixed(0)} seconds ({data.latency_threshold || 5000} ms)
                                        </span>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setData('latency_threshold', 3000)}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center ${
                                                    data.latency_threshold === 3000
                                                        ? 'bg-[#E2F3FC] border-[#47C0E9] text-[#0F6D95] font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                3s (Fast)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setData('latency_threshold', 5000)}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center ${
                                                    data.latency_threshold === 5000
                                                        ? 'bg-[#E2F3FC] border-[#47C0E9] text-[#0F6D95] font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                5s (Standard)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setData('latency_threshold', 8000)}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center ${
                                                    data.latency_threshold === 8000
                                                        ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                8s (DOSTv/Media)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setData('latency_threshold', 10000)}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center ${
                                                    data.latency_threshold === 10000
                                                        ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold shadow-sm'
                                                        : 'bg-white border-[#BFE8F8] text-[#144C66] hover:bg-[#F1FAFE]'
                                                }`}
                                            >
                                                10s (Heavy)
                                            </button>
                                        </div>

                                        <p className="text-[11px] text-[#144C66]/70">
                                            Heartbeat bars turn yellow (warning) when response time exceeds this threshold. Use 8s–10s for heavy media/video sites like DOSTv and STARBOOKS.
                                        </p>
                                    </div>
                                    {errors.latency_threshold && <p className="text-xs text-rose-600 mt-1">{errors.latency_threshold}</p>}
                                </div>

                                <div className="flex items-start space-x-2.5 pt-1 bg-[#F1FAFE] p-3 rounded-xl border border-[#BFE8F8]">
                                    <input
                                        type="checkbox"
                                        id="is_public"
                                        checked={data.is_public}
                                        onChange={(e) => setData('is_public', e.target.checked)}
                                        className="w-4 h-4 mt-0.5 rounded border-[#BFE8F8] text-[#1FA9D8] focus:ring-[#1FA9D8]/50 focus:ring-offset-0 cursor-pointer"
                                    />
                                    <label htmlFor="is_public" className="text-xs text-[#0D3144] cursor-pointer">
                                        <span className="font-semibold">Display on Public Status Page (</span><span className="text-[#1188B8] font-mono font-medium">/status</span><span className="font-semibold">)</span>
                                        <span className="block text-[11px] text-[#144C66]/70 mt-0.5">
                                            Uncheck for internal intranet services (e.g. HRIS, ERMS) to restrict visibility to this dashboard only.
                                        </span>
                                    </label>
                                </div>

                                <div className="flex items-start space-x-2.5 pt-1 bg-[#F1FAFE] p-3 rounded-xl border border-[#BFE8F8]">
                                    <input
                                        type="checkbox"
                                        id="is_pinned"
                                        checked={data.is_pinned}
                                        onChange={(e) => setData('is_pinned', e.target.checked)}
                                        className="w-4 h-4 mt-0.5 rounded border-[#BFE8F8] text-[#1FA9D8] focus:ring-[#1FA9D8]/50 focus:ring-offset-0 cursor-pointer"
                                    />
                                    <label htmlFor="is_pinned" className="text-xs text-[#0D3144] cursor-pointer">
                                        <span className="flex items-center space-x-1 font-semibold">
                                            <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                            <span>Pin to Top of Category Group</span>
                                        </span>
                                        <span className="block text-[11px] text-[#144C66]/70 mt-0.5">
                                            Prioritize this website at the very top of its category group (Public Portals or Internal Systems).
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Sticky Footer */}
                            <div className="px-5 sm:px-6 py-3.5 bg-[#F1FAFE] border-t border-[#BFE8F8] flex items-center justify-between shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold text-[#144C66] hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm shadow-[#1FA9D8]/20 disabled:opacity-50 transition-all cursor-pointer"
                                >
                                    {processing ? 'Saving...' : editingSite ? 'Save Changes' : 'Add Monitor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 24/7 Background Scheduler Setup Modal */}
            {isCronModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white border border-[#BFE8F8] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-[#BFE8F8] bg-[#F1FAFE] flex items-center justify-between shrink-0">
                            <div className="flex items-center space-x-2.5">
                                <div className="p-2 rounded-xl bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                                    <Clock className="w-5 h-5 text-[#1188B8]" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-[#0D3144]">24/7 Background Monitoring Setup</h3>
                                    <p className="text-xs text-[#144C66]/70">Automate health checks and incident tracking when no browser is open</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsCronModalOpen(false)}
                                className="p-1.5 rounded-lg text-[#144C66]/60 hover:text-[#0D3144] hover:bg-[#E2F3FC] transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-6 text-xs text-[#0D3144]">
                            {/* Live Status Card */}
                            <div className={`p-4 rounded-xl border flex items-center justify-between ${
                                schedulerStatus?.is_healthy
                                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                                    : 'bg-amber-50/80 border-amber-300 text-amber-950'
                            }`}>
                                <div className="flex items-center space-x-3">
                                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                                        schedulerStatus?.is_healthy ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                                    }`}></div>
                                    <div>
                                        <div className="font-bold text-sm">
                                            {schedulerStatus?.is_healthy ? 'Background Monitor Active' : 'Background Monitor Inactive / Not Detected'}
                                        </div>
                                        <div className="text-[11px] text-[#144C66]/80 mt-0.5">
                                            {schedulerStatus?.last_checked_at
                                                ? `Latest automated scan: ${new Date(schedulerStatus.last_checked_at).toLocaleTimeString()} (${schedulerStatus.minutes_ago ?? 0}m ago)`
                                                : 'No background scans have been recorded yet.'}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={triggerCheckAll}
                                    disabled={isCheckingAll}
                                    className="px-3 py-1.5 rounded-lg font-semibold bg-white border border-[#BFE8F8] text-[#144C66] hover:bg-[#E2F3FC] shadow-xs transition-colors shrink-0"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 ${isCheckingAll ? 'animate-spin text-[#1188B8]' : ''}`} />
                                    {isCheckingAll ? 'Scanning...' : 'Test Scan Now'}
                                </button>
                            </div>

                            {/* Why Background Monitoring is Necessary */}
                            <div className="bg-[#F1FAFE] border border-[#BFE8F8] rounded-xl p-4 space-y-2">
                                <h4 className="font-bold text-[#0D3144] flex items-center space-x-1.5">
                                    <AlertCircle className="w-4 h-4 text-[#1188B8]" />
                                    <span>Why is server-side background monitoring required?</span>
                                </h4>
                                <p className="text-[#144C66]/80 leading-relaxed text-[11px]">
                                    When you close your browser tab or shut down your PC, browser-based JavaScript stops running. To track outages, calculate accurate 24-hour uptime, and record incidents around the clock (e.g. overnight outages), your live server must run checks on a scheduled background loop.
                                </p>
                            </div>

                            {/* Setup Option 1: Linux / cPanel Crontab */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm text-[#0D3144] flex items-center space-x-1.5">
                                        <span className="w-5 h-5 rounded-full bg-[#1188B8] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                                        <span>Option 1: Linux / cPanel Cron Job (Recommended)</span>
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard('* * * * * cd /path-to-your-project && php artisan schedule:run >> /dev/null 2>&1', 'cron')}
                                        className="text-[#1188B8] hover:text-[#0F6D95] font-semibold text-[11px] flex items-center space-x-1"
                                    >
                                        {copiedSnippet === 'cron' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedSnippet === 'cron' ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                                <p className="text-[#144C66]/70 text-[11px]">
                                    In your server terminal (<code className="bg-[#E2F3FC] px-1 rounded">crontab -e</code>) or cPanel "Cron Jobs" interface, add this entry to run every minute:
                                </p>
                                <div className="bg-[#0D3144] text-[#E2F3FC] p-3 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                                    * * * * * cd /var/www/webcheck && php artisan schedule:run &gt;&gt; /dev/null 2&gt;&amp;1
                                </div>
                            </div>

                            {/* Setup Option 2: 24/7 Continuous Background Daemon */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm text-[#0D3144] flex items-center space-x-1.5">
                                        <span className="w-5 h-5 rounded-full bg-[#1188B8] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                                        <span>Option 2: 24/7 Background Daemon Command (No Cron Required)</span>
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard('nohup php artisan websites:watch --interval=60 > storage/logs/monitor.log 2>&1 &', 'daemon')}
                                        className="text-[#1188B8] hover:text-[#0F6D95] font-semibold text-[11px] flex items-center space-x-1"
                                    >
                                        {copiedSnippet === 'daemon' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedSnippet === 'daemon' ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                                <p className="text-[#144C66]/70 text-[11px]">
                                    Run WebCheck as an automated continuous daemon (works with nohup, Supervisor, or Systemd):
                                </p>
                                <div className="bg-[#0D3144] text-[#E2F3FC] p-3 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                                    nohup php artisan websites:watch --interval=60 &gt; storage/logs/monitor.log 2&gt;&amp;1 &amp;
                                </div>
                            </div>

                            {/* Setup Option 3: Web-Cron / HTTP Webhook Trigger */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-sm text-[#0D3144] flex items-center space-x-1.5">
                                        <span className="w-5 h-5 rounded-full bg-[#1188B8] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                                        <span>Option 3: Web-Cron / HTTP Webhook URL (For External Cron Services)</span>
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/api/cron/check`, 'webhook')}
                                        className="text-[#1188B8] hover:text-[#0F6D95] font-semibold text-[11px] flex items-center space-x-1"
                                    >
                                        {copiedSnippet === 'webhook' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedSnippet === 'webhook' ? 'Copied' : 'Copy'}</span>
                                    </button>
                                </div>
                                <p className="text-[#144C66]/70 text-[11px]">
                                    If your server has no shell or crontab access, ping this endpoint every 1-5 minutes using cPanel curl or a free web-cron service (e.g. cron-job.org or EasyCron):
                                </p>
                                <div className="bg-[#0D3144] text-[#E2F3FC] p-3 rounded-xl font-mono text-[11px] overflow-x-auto select-all">
                                    {typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com'}/api/cron/check
                                </div>
                            </div>
                        </div>

                        {/* Sticky Modal Footer */}
                        <div className="px-6 py-3.5 bg-[#F1FAFE] border-t border-[#BFE8F8] flex items-center justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsCronModalOpen(false)}
                                className="px-5 py-2 rounded-lg text-xs font-semibold bg-[#1FA9D8] hover:bg-[#1188B8] text-white shadow-sm transition-colors cursor-pointer"
                            >
                                Close Setup Guide
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Slide-over Analytics & Incident Timeline Drawer */}
            <MonitorDrawer
                site={selectedSiteForDrawer}
                isOpen={isDrawerOpen}
                onClose={closeDrawer}
                onRecheck={triggerCheckSingle}
                isChecking={selectedSiteForDrawer ? checkingSiteId === selectedSiteForDrawer.id : false}
            />

            {/* Footer */}
            <footer className="border-t border-[#BFE8F8] bg-white py-4 text-center text-xs text-[#144C66]/70 shadow-sm mt-auto">
                WebCheck Monitor &bull; 5-Minute Auto-Polling Engine &bull; Institutional Health System
            </footer>
        </div>
    );
}
