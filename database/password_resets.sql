-- Tabla para el flujo de recuperación de contraseña por código OTP
-- Ejecutar en phpMyAdmin: selecciona la base de datos necting_db y ejecuta este script.

USE necting_db;

CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    reset_token_hash VARCHAR(255) NULL,
    reset_expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    INDEX idx_email (email),
    INDEX idx_expires (expires_at),
    INDEX idx_reset_expires (reset_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
