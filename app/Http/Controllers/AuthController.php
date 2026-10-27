<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    /**
     * Show the login page.
     */
    public function create(): Response
    {
        return Inertia::render('Login');
    }

    /**
     * Handle the login request.
     */
    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $username = trim($request->input('username'));
        $password = (string) $request->input('password');

        // Look up by username/name or email
        $user = User::where('name', $username)
            ->orWhere('email', $username)
            ->first();

        // If user doesn't exist yet and credentials are admin / admin, auto-create the admin user
        if (!$user && strtolower($username) === 'admin' && $password === 'admin') {
            $user = User::create([
                'name' => 'admin',
                'email' => 'admin@webcheck.local',
                'password' => Hash::make('admin'),
                'email_verified_at' => now(),
            ]);
        }

        // If admin user exists and attempts login with password 'admin' but hash didn't match, sync it
        if ($user && (strtolower($username) === 'admin' || $user->name === 'admin') && $password === 'admin') {
            if (!Hash::check($password, $user->password)) {
                $user->password = Hash::make('admin');
                $user->save();
            }
        }

        if ($user && Hash::check($password, $user->password)) {
            Auth::login($user, $request->boolean('remember'));
            $request->session()->regenerate();

            return redirect()->intended(route('dashboard'));
        }

        throw ValidationException::withMessages([
            'username' => 'Invalid credentials. Default administrator access is admin / admin.',
        ]);
    }

    /**
     * Handle logout.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('status.public');
    }
}

