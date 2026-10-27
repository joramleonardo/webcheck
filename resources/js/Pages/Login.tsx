import React, { useState } from 'react';
import { Head, Link, useForm } from '@inertiajs/react';
import {
    Activity,
    Lock,
    User,
    ShieldCheck,
    ArrowLeft,
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound
} from 'lucide-react';

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [quickFilled, setQuickFilled] = useState(false);

    const { data, setData, post, processing, errors, reset } = useForm({
        username: '',
        password: '',
        remember: true,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        post('/login', {
            onFinish: () => reset('password'),
        });
    };

    const handleQuickFill = () => {
        setData((prev) => ({
            ...prev,
            username: 'admin',
            password: 'admin',
        }));
        setQuickFilled(true);
        setTimeout(() => setQuickFilled(false), 2500);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#EBF8FD] via-[#F1FAFE] to-[#F8FDFF] text-[#0D3144] flex flex-col justify-between font-sans selection:bg-[#BFE8F8] selection:text-[#0D3144]">
            <Head title="Admin Login - DOST-STII WebCheck" />

            {/* Top Navigation Strip */}
            <div className="max-w-5xl w-full mx-auto px-4 py-4 flex items-center justify-between">
                <Link
                    href="/"
                    className="inline-flex items-center space-x-2 text-xs font-semibold text-[#144C66] hover:text-[#0F6D95] bg-white/80 hover:bg-white px-3 py-1.5 rounded-lg border border-[#BFE8F8] transition-colors shadow-sm"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to Public Status Page</span>
                </Link>

                <div className="flex items-center space-x-2 text-xs font-medium text-[#144C66]/80">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Monitoring Engine Active</span>
                </div>
            </div>

            {/* Login Card Container */}
            <div className="flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    {/* Brand Card Header */}
                    <div className="text-center mb-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#0F6D95] to-[#1FA9D8] text-white shadow-lg shadow-[#1188B8]/25 mb-3 border border-white/20">
                            <Activity className="w-7 h-7" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0D3144]">
                            DOST-STII WebCheck
                        </h1>
                        <p className="text-xs text-[#144C66]/80 mt-1 font-medium">
                            Network Operations &amp; Systems Administration Portal
                        </p>
                    </div>

                    {/* Main Form Box */}
                    <div className="bg-white/95 backdrop-blur rounded-2xl border border-[#BFE8F8] shadow-xl shadow-[#1188B8]/10 p-6 sm:p-8 space-y-6">
                        <div className="flex items-center justify-between border-b border-[#BFE8F8]/60 pb-4">
                            <div className="flex items-center space-x-2">
                                <Lock className="w-4 h-4 text-[#1188B8]" />
                                <h2 className="text-sm font-bold text-[#0D3144]">Administrator Sign In</h2>
                            </div>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#E2F3FC] text-[#0F6D95] border border-[#BFE8F8]">
                                Protected Area
                            </span>
                        </div>

                        {/* Error Alert */}
                        {errors.username && (
                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5 animate-fade-in">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <span className="font-medium leading-relaxed">{errors.username}</span>
                            </div>
                        )}

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Username or Email */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-[#144C66]" htmlFor="username">
                                    Username or Email
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#144C66]/50">
                                        <User className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="username"
                                        type="text"
                                        value={data.username}
                                        onChange={(e) => setData('username', e.target.value)}
                                        placeholder="admin"
                                        autoFocus
                                        required
                                        className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#BFE8F8] rounded-xl text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1188B8] focus:border-[#1188B8] transition-all shadow-sm"
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-[#144C66]" htmlFor="password">
                                    Password
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#144C66]/50">
                                        <KeyRound className="w-4 h-4" />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={data.password}
                                        onChange={(e) => setData('password', e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#BFE8F8] rounded-xl text-sm text-[#0D3144] placeholder-[#144C66]/40 focus:outline-none focus:ring-2 focus:ring-[#1188B8] focus:border-[#1188B8] transition-all shadow-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#144C66]/50 hover:text-[#0F6D95] transition-colors"
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Remember & Quick Help */}
                            <div className="flex items-center justify-between text-xs pt-1">
                                <label className="flex items-center space-x-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={data.remember}
                                        onChange={(e) => setData('remember', e.target.checked)}
                                        className="w-4 h-4 rounded border-[#BFE8F8] text-[#1188B8] focus:ring-[#1188B8] cursor-pointer"
                                    />
                                    <span className="text-[#144C66] font-medium">Keep me signed in</span>
                                </label>
                            </div>

                            {/* Sign In Button */}
                            <button
                                type="submit"
                                disabled={processing}
                                className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-[#1FA9D8] hover:bg-[#1188B8] active:bg-[#0F6D95] shadow-md shadow-[#1FA9D8]/25 hover:shadow-lg hover:shadow-[#1188B8]/30 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2 mt-2"
                            >
                                <ShieldCheck className="w-4 h-4" />
                                <span>{processing ? 'Authenticating...' : 'Sign In to Dashboard'}</span>
                            </button>
                        </form>

                        {/* Quick Fill Box for convenience */}
                        <div className="pt-2 border-t border-[#BFE8F8]/60">
                            <button
                                type="button"
                                onClick={handleQuickFill}
                                className="w-full py-2 px-3 rounded-lg text-xs font-medium bg-[#F1FAFE] hover:bg-[#E2F3FC] border border-[#BFE8F8] text-[#0F6D95] transition-colors flex items-center justify-between group"
                                title="Click to fill default credentials (admin / admin)"
                            >
                                <span className="flex items-center space-x-1.5">
                                    <KeyRound className="w-3.5 h-3.5 text-[#1188B8]" />
                                    <span>Default credentials: <strong className="font-mono">admin / admin</strong></span>
                                </span>
                                <span className="text-[11px] underline font-semibold text-[#1188B8] group-hover:text-[#0F6D95]">
                                    {quickFilled ? 'Filled!' : 'Auto Fill'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Back link */}
                    <div className="text-center mt-6">
                        <Link
                            href="/"
                            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-[#144C66] hover:text-[#0F6D95] transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Go back to Public Status Page</span>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Minimal Footer */}
            <footer className="py-4 text-center text-[11px] text-[#144C66]/70 border-t border-[#BFE8F8]/60 bg-white/50">
                DOST-STII WebCheck &bull; Institutional Uptime &amp; Incident Monitoring
            </footer>
        </div>
    );
}

