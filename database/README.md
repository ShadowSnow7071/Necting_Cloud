# Base de datos Necting

## Uso

Solo necesitas **schema.sql** para crear o resetear la base de datos.

```bash
mysql -u root -p < schema.sql
```

O desde MySQL:

```sql
source /ruta/al/proyecto/database/schema.sql;
```

Crea la base `necting_db`, todas las tablas y los datos iniciales de empleados. Las imágenes usan calidad alta (q=95, w=1920). El backend usa la misma calidad para perfiles nuevos y fallbacks.

## Contenido de schema.sql

- Tablas: `users` (con `account_type`), `password_resets`, `user_profiles`, `user_soft_skills`, `employees`, `employee_soft_skills`, `matches`, `rejections`, `user_matches`, `user_rejections`

## Tabla password_resets (recuperación de contraseña)

Si ya tienes la base creada y solo quieres añadir la tabla de recuperación de contraseña:

1. Abre **phpMyAdmin** y selecciona la base de datos `necting_db`.
2. Ve a la pestaña **SQL**.
3. Pega y ejecuta el contenido del archivo `database/password_resets.sql`:

```sql
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
```

4. Pulsa **Continuar** para ejecutar. Campos: `id`, `email`, `code_hash`, `expires_at`, `attempts`, `reset_token_hash`, `reset_expires_at`, `created_at`, `used_at`.

## Columna account_type en users (si ves "Unknown column 'u.account_type'")

Si la base se creó antes de incluir `account_type` en el esquema, la pantalla de matches puede fallar con *Unknown column 'u.account_type'*. Añade la columna así:

1. En **phpMyAdmin**, selecciona la base `necting_db` → pestaña **SQL**.
2. Ejecuta el contenido de `database/migrations/add_account_type.sql`:

```sql
USE necting_db;
ALTER TABLE users ADD COLUMN account_type VARCHAR(20) NOT NULL DEFAULT 'empleado';
```

3. Si MySQL dice que la columna ya existe, no hace falta hacer nada.
