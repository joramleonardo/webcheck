<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        User::updateOrCreate(
            ['name' => 'admin'],
            [
                'email' => 'admin@webcheck.local',
                'password' => Hash::make('admin'),
                'email_verified_at' => now(),
            ]
        );
    }
}
