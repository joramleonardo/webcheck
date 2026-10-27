export interface WebsiteCheck {
    id: number;
    is_up: boolean;
    http_code: number;
    response_time: number;
    keyword_found?: boolean | null;
    attempts?: number;
    was_retried?: boolean;
    error: string | null;
    created_at: string | null;
}

export interface Incident {
    id?: number;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number;
    error: string | null;
    http_code: number | null;
    is_ongoing: boolean;
}

export interface Website {
    id: number;
    name: string;
    url: string;
    keyword: string | null;
    category?: string;
    timeout: number;
    latency_threshold?: number;
    is_active: boolean;
    is_public?: boolean;
    is_pinned?: boolean;
    last_is_up: boolean | null;
    last_http_code: number | null;
    last_response_time: number | null;
    last_keyword_found: boolean | null;
    last_error: string | null;
    consecutive_failures?: number;
    last_checked_at: string | null;
    ssl_valid?: boolean | null;
    ssl_issuer?: string | null;
    ssl_expires_at?: string | null;
    ssl_days_remaining?: number | null;
    ssl_checked_at?: string | null;
    recent_checks?: WebsiteCheck[];
    uptime_24h?: number;
    uptime_7d?: number;
    min_latency_24h?: number;
    max_latency_24h?: number;
    avg_latency_24h?: number;
    incidents?: Incident[];
    created_at?: string;
    updated_at?: string;
}

export interface DashboardStats {
    total: number;
    up: number;
    down: number;
    pending: number;
    overall_uptime: number;
    avg_response_time: number;
    any_down: boolean;
    ssl_expiring_soon?: number;
    ssl_expired?: number;
}

export interface SchedulerStatus {
    last_checked_at: string | null;
    is_healthy: boolean;
    minutes_ago: number | null;
}

export interface DashboardProps {
    websites: Website[];
    stats: DashboardStats;
    serverTime: string;
    schedulerStatus?: SchedulerStatus;
    auth?: Auth;
}

export interface SystemStatus {
    state: 'operational' | 'degraded' | 'major_outage';
    title: string;
    description: string;
}

export interface PublicIncident {
    website_id: number;
    website_name: string;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number;
    error: string | null;
    is_ongoing: boolean;
}

export interface User {
    id: number;
    name: string;
    email: string;
}

export interface Auth {
    user: User | null;
}

export interface StatusPageProps {
    systemStatus: SystemStatus;
    websites: Website[];
    stats: {
        total: number;
        up: number;
        down: number;
        overall_uptime: number;
        avg_response_time: number;
    };
    recentIncidents: PublicIncident[];
    serverTime: string;
    schedulerStatus?: SchedulerStatus;
    auth?: Auth;
}
