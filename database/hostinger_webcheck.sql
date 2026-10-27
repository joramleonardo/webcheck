-- ==============================================================
-- WebCheck Complete Production Database Schema for Hostinger
-- Target Database: u962919458_webmonitoring
-- Host: 127.0.0.1 / localhost
-- ==============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------
-- Table structure for `sessions`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `cache`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `cache_locks`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `jobs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL,
  `reserved_at` int(10) UNSIGNED DEFAULT NULL,
  `available_at` int(10) UNSIGNED NOT NULL,
  `created_at` int(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `failed_jobs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `failed_jobs` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `websites`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `websites` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `keyword` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Public Portals',
  `timeout` int(11) NOT NULL DEFAULT 20,
  `latency_threshold` int(11) NOT NULL DEFAULT 5000,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `last_is_up` tinyint(1) DEFAULT NULL,
  `last_http_code` int(11) DEFAULT NULL,
  `last_response_time` int(11) DEFAULT NULL,
  `last_keyword_found` tinyint(1) DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consecutive_failures` int(11) NOT NULL DEFAULT 0,
  `last_checked_at` timestamp NULL DEFAULT NULL,
  `ssl_valid` tinyint(1) DEFAULT NULL,
  `ssl_issuer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_expires_at` timestamp NULL DEFAULT NULL,
  `ssl_days_remaining` int(11) DEFAULT NULL,
  `ssl_checked_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for `website_checks`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `website_checks` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `website_id` bigint(20) UNSIGNED NOT NULL,
  `is_up` tinyint(1) NOT NULL,
  `http_code` int(11) NOT NULL DEFAULT 0,
  `response_time` int(11) NOT NULL DEFAULT 0,
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `was_retried` tinyint(1) NOT NULL DEFAULT 0,
  `keyword_found` tinyint(1) DEFAULT NULL,
  `error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `website_checks_website_id_foreign` (`website_id`),
  KEY `website_checks_created_at_index` (`created_at`),
  CONSTRAINT `website_checks_website_id_foreign` FOREIGN KEY (`website_id`) REFERENCES `websites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Initial Seed Data: DOST-STII Monitored Portals & Systems
-- --------------------------------------------------------
INSERT INTO `websites` (`id`, `name`, `url`, `keyword`, `category`, `timeout`, `latency_threshold`, `is_active`, `is_public`, `is_pinned`, `created_at`, `updated_at`) VALUES
(1, 'S&T Post Portal', 'https://sntpost.dost.gov.ph', 'DOST-STII', 'Public Portals', 20, 5000, 1, 1, 1, NOW(), NOW()),
(2, 'Science.ph', 'https://www.science.ph', 'science ph', 'Public Portals', 20, 5000, 1, 1, 0, NOW(), NOW()),
(3, 'STARBOOKS Online', 'https://www.starbooks.ph', 'starbooks', 'Public Portals', 20, 8000, 1, 1, 1, NOW(), NOW()),
(4, 'SciNeT-Phil Portal', 'http://scinet.dost.gov.ph', 'scinet', 'Public Portals', 20, 5000, 1, 1, 0, NOW(), NOW()),
(5, 'DOSTv Portal', 'https://www.dostv.ph', 'dostv', 'Public Portals', 25, 10000, 1, 1, 1, NOW(), NOW()),
(6, 'Philippine Journal of Science', 'https://philjournalsci.dost.gov.ph', 'Philippine', 'Public Portals', 20, 5000, 1, 1, 0, NOW(), NOW()),
(7, 'DOST-STII Official Website', 'https://stii.dost.gov.ph/', 'Philippine', 'Public Portals', 20, 5000, 1, 1, 0, NOW(), NOW()),
(8, 'STII HRIS (Intranet)', 'http://hris.stii.local/', 'hris', 'Internal Systems', 20, 5000, 1, 0, 0, NOW(), NOW()),
(9, 'STII ERMS Records System', 'http://10.10.140.3/erms/', 'records', 'Internal Systems', 20, 5000, 1, 0, 0, NOW(), NOW());

-- --------------------------------------------------------
-- Table structure for `users`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Default Administrator Account (Username: admin / Password: admin)
-- --------------------------------------------------------
INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `created_at`, `updated_at`) VALUES
(1, 'admin', 'admin@webcheck.local', NOW(), '$2y$10$vwv/MQ7hkikTuRiCoVj2WupV2tdT0thqgUfCzI292ii7HRBmLtQLO', NOW(), NOW())
ON DUPLICATE KEY UPDATE `password` = VALUES(`password`);

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;

