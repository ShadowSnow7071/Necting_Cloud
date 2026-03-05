-- Necting - Base de datos
-- =============================================================================
-- Aplicación web para facilitar la vinculación entre candidatos y empresas
-- mediante un sistema de coincidencias basado en criterios específicos.
-- Objetivo: optimizar la búsqueda y selección de talento e identificar
-- perfiles compatibles con vacantes laborales.

CREATE DATABASE IF NOT EXISTS necting_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE necting_db;

-- Limpiar tablas si existen (para reseteos de desarrollo)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS user_rejections;
DROP TABLE IF EXISTS user_matches;
DROP TABLE IF EXISTS rejections;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS user_soft_skills;
DROP TABLE IF EXISTS user_profiles;
DROP TABLE IF EXISTS employee_soft_skills;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE,
    email_verification_code VARCHAR(6) NULL,
    reset_password_token VARCHAR(255) NULL,
    reset_password_expires DATETIME NULL,
    account_type VARCHAR(20) NOT NULL DEFAULT 'empleado',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_account_type (account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de recuperación de contraseña (OTP + reset token)
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

-- Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS user_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    position VARCHAR(255) DEFAULT '',
    department VARCHAR(255) DEFAULT '',
    image_url TEXT,
    image_url_2 TEXT NULL,
    image_url_3 TEXT NULL,
    image_url_4 TEXT NULL,
    avatar_position VARCHAR(20) DEFAULT '50% 50%',
    experience VARCHAR(100) DEFAULT '',
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_profile (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de soft skills de usuarios
CREATE TABLE IF NOT EXISTS user_soft_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_profile_id INT NOT NULL,
    skill_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
    INDEX idx_user_profile (user_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de empleados/candidatos
CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    image_url TEXT NOT NULL,
    experience VARCHAR(100) NOT NULL,
    bio TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de soft skills de empleados
CREATE TABLE IF NOT EXISTS employee_soft_skills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    skill_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de matches (empleados aceptados por usuarios)
CREATE TABLE IF NOT EXISTS matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    employee_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE KEY unique_match (user_id, employee_id),
    INDEX idx_user (user_id),
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de rechazos (empleados rechazados por usuarios)
CREATE TABLE IF NOT EXISTS rejections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    employee_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    UNIQUE KEY unique_rejection (user_id, employee_id),
    INDEX idx_user (user_id),
    INDEX idx_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de matches entre usuarios (usuarios aceptados por otros usuarios)
CREATE TABLE IF NOT EXISTS user_matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    other_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_match (user_id, other_user_id),
    INDEX idx_user (user_id),
    INDEX idx_other_user (other_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de rechazos entre usuarios
CREATE TABLE IF NOT EXISTS user_rejections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    other_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (other_user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_rejection (user_id, other_user_id),
    INDEX idx_user (user_id),
    INDEX idx_other_user (other_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insertar datos de ejemplo de empleados
INSERT INTO employees (name, position, department, image_url, experience, bio) VALUES
('María González', 'Desarrolladora Full Stack', 'Tecnología', 'https://images.unsplash.com/photo-1762341118920-0b65e8d88aa2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMG9mZmljZXxlbnwxfHx8fDE3NjgzMTQzNjR8MA&ixlib=rb-4.1.0&q=95&w=1920', '5 años', 'Apasionada por el desarrollo de soluciones innovadoras y el trabajo colaborativo.'),
('Carlos Martínez', 'Diseñador UX/UI', 'Diseño', 'https://images.unsplash.com/photo-1618591552964-837a5a315fb2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBtYW4lMjBjb3Jwb3JhdGV8ZW58MXx8fHwxNzY4NDE0NTUxfDA&ixlib=rb-4.1.0&q=95&w=1920', '3 años', 'Enfocado en crear experiencias de usuario excepcionales y centradas en las personas.'),
('Ana Rodríguez', 'Project Manager', 'Gestión', 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2ODMwMjg2Mnww&ixlib=rb-4.1.0&q=95&w=1920', '7 años', 'Experta en coordinar equipos y entregar proyectos de alta calidad dentro del plazo.'),
('David López', 'Analista de Datos', 'Data Science', 'https://images.unsplash.com/photo-1758876204244-930299843f07?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvZmZpY2UlMjBlbXBsb3llZSUyMGhlYWRzaG90fGVufDF8fHx8MTc2ODM5MTk4OHww&ixlib=rb-4.1.0&q=95&w=1920', '4 años', 'Transformo datos complejos en insights accionables para la toma de decisiones.'),
('Laura Sánchez', 'Marketing Manager', 'Marketing', 'https://images.unsplash.com/photo-1762341118920-0b65e8d88aa2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMG9mZmljZXxlbnwxfHx8fDE3NjgzMTQzNjR8MA&ixlib=rb-4.1.0&q=95&w=1920', '6 años', 'Creo estrategias de marketing innovadoras que conectan marcas con audiencias.'),
('Roberto Fernández', 'Backend Developer', 'Tecnología', 'https://images.unsplash.com/photo-1618591552964-837a5a315fb2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBtYW4lMjBjb3Jwb3JhdGV8ZW58MXx8fHwxNzY4NDE0NTUxfDA&ixlib=rb-4.1.0&q=95&w=1920', '4 años', 'Especializado en arquitecturas escalables y desarrollo de APIs robustas.');

-- Insertar soft skills de empleados
INSERT INTO employee_soft_skills (employee_id, skill_name) VALUES
(1, 'Trabajo en equipo'), (1, 'Comunicación efectiva'), (1, 'Pensamiento crítico'), (1, 'Adaptabilidad'),
(2, 'Creatividad'), (2, 'Empatía'), (2, 'Colaboración'), (2, 'Atención al detalle'),
(3, 'Liderazgo'), (3, 'Organización'), (3, 'Resolución de conflictos'), (3, 'Gestión del tiempo'),
(4, 'Análisis crítico'), (4, 'Comunicación de datos'), (4, 'Curiosidad'), (4, 'Metodología'),
(5, 'Creatividad estratégica'), (5, 'Negociación'), (5, 'Visión de negocio'), (5, 'Persuasión'),
(6, 'Resolución de problemas'), (6, 'Aprendizaje continuo'), (6, 'Precisión'), (6, 'Colaboración');

-- OPCIONAL: Si la tabla user_profiles ya existía sin columnas de fotos/avatar, ejecutar:
-- ALTER TABLE user_profiles ADD COLUMN image_url_2 TEXT NULL, ADD COLUMN image_url_3 TEXT NULL, ADD COLUMN image_url_4 TEXT NULL;
-- ALTER TABLE user_profiles ADD COLUMN avatar_position VARCHAR(20) DEFAULT '50% 50%';
