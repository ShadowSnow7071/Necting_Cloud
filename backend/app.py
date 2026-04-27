import os
import secrets
import string
import re
import unicodedata
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv, dotenv_values
import mysql.connector
from mysql.connector import Error
import requests
import cloudinary
import cloudinary.uploader

# Obtener la ruta del directorio del proyecto


# Cargar .env desde el directorio backend (donde está app.py)
# Forzar que las variables definidas en backend/.env sobrescriban las del entorno del sistema en desarrollo
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

# Configurar Cloudinary usando variables de entorno ya cargadas
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)
CLOUDINARY_FOLDER = os.getenv("CLOUDINARY_FOLDER", "necting/profile_images")
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
MAX_IMAGE_SIZE_MB = 5

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
# Ya no necesitamos CORS estricto ya que todo está en el mismo puerto
CORS(app, supports_credentials=True)

# Configuración de la base de datos
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'necting_db'),
    'port': int(os.environ.get('DB_PORT', '3306')),
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci'
}

def get_db_connection():
    """Crea una conexión a la base de datos"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Error conectando a MySQL: {e}")
        return None

def generate_verification_code():
    """Genera un código de verificación de 6 dígitos"""
    return ''.join(secrets.choice(string.digits) for _ in range(6))


def _send_email_via_resend(to_email, subject, body, reply_to=None):
    """Envía email usando la API HTTP de Resend (sin SMTP)."""
    resend_api_key = (os.environ.get("RESEND_API_KEY") or "").strip()
    email_from = (os.environ.get("EMAIL_FROM") or "").strip()

    if not resend_api_key or not email_from:
        return False, "Falta RESEND_API_KEY o EMAIL_FROM en variables de entorno"

    headers = {
        "Authorization": f"Bearer {resend_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "from": email_from,
        "to": [to_email],
        "subject": subject,
        "text": body,
    }
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers=headers,
            json=payload,
            timeout=20,
        )
        if 200 <= response.status_code < 300:
            return True, None
        return False, f"Resend API error {response.status_code}: {response.text}"
    except Exception as e:
        return False, f"Error llamando API de Resend: {e}"


def _send_email_via_smtp(to_email, subject, body, reply_to=None):
    """Envía email por SMTP (fallback para desarrollo local)."""
    import smtplib
    from email.message import EmailMessage

    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    smtp_port_str = (os.environ.get("SMTP_PORT") or "587").strip() or "587"
    try:
        smtp_port = int(smtp_port_str)
    except ValueError:
        smtp_port = 587
    smtp_user = (os.environ.get("SMTP_USER") or "").strip()
    smtp_pass = os.environ.get("SMTP_PASS") or ""

    if not all([smtp_host, smtp_user, smtp_pass]):
        return False, "Configuración SMTP incompleta en variables de entorno"

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = os.environ.get("SMTP_FROM", smtp_user)
        msg["To"] = to_email
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.set_content(body)

        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        return True, None
    except Exception as e:
        return False, str(e)


def _send_email(to_email, subject, body, reply_to=None):
    """
    Dispatcher de email.
    EMAIL_PROVIDER=resend|smtp (default: resend).
    """
    provider = (os.environ.get("EMAIL_PROVIDER") or "resend").strip().lower()
    if provider == "smtp":
        return _send_email_via_smtp(to_email, subject, body, reply_to=reply_to)
    if provider == "resend":
        return _send_email_via_resend(to_email, subject, body, reply_to=reply_to)
    return False, f"EMAIL_PROVIDER no soportado: {provider}"


def send_verification_email(to_email, code):
    """Envía el código de verificación por email. Retorna (éxito, mensaje_error)."""
    subject = "Código de verificación - Necting"
    body = (
        f"Tu código de verificación es: {code}\n\n"
        "Escríbelo en la aplicación para confirmar tu correo."
    )

    ok, err = _send_email(to_email, subject, body)
    if ok:
        print(f"[OK] Email enviado a {to_email}")
        return True, None

    print(f"[ERROR] Error enviando email a {to_email}: {err}")
    print(f"   Codigo (desarrollo): {code}")
    return False, err


def send_password_reset_email(to_email, code, expires_minutes=10):
    """Envía el código de recuperación de contraseña por email. Retorna (éxito, mensaje_error)."""
    subject = "Código para restablecer tu contraseña - Necting"
    body = (
        f"Tu código para restablecer la contraseña es: {code}\n\n"
        f"El código expira en {expires_minutes} minutos.\n\n"
        "Ingrésalo en la aplicación para continuar con el restablecimiento."
    )

    ok, err = _send_email(to_email, subject, body)
    if ok:
        print(f"[OK] Email de reset enviado a {to_email}")
        return True, None

    print(f"[ERROR] Error enviando email de reset a {to_email}: {err}")
    print(f"   Codigo (desarrollo): {code}")
    return False, err


def send_contact_email(to_email, subject, body, sender_name, sender_email):
    """Envía un mensaje de contacto entre empleador y candidato."""
    clean_subject = subject.strip() or "Nuevo mensaje de contacto - Necting"
    sender_name = sender_name or "Un empleador en Necting"
    sender_email_text = f" ({sender_email})" if sender_email else ""
    full_body = (
        f"Has recibido un nuevo mensaje en Necting de {sender_name}{sender_email_text}:\n\n"
        f"{body}\n\n"
        "Responde a este correo o ponte en contacto directamente con la persona que te escribió."
    )

    ok, err = _send_email(
        to_email,
        f"[Necting] {clean_subject}",
        full_body,
        reply_to=sender_email or None,
    )
    if ok:
        print(f"[OK] Email de contacto enviado a {to_email}")
        return True, None

    print(f"[ERROR] Error enviando email de contacto a {to_email}: {err}")
    return False, err

# Recuperación de contraseña: tiempos y límites
PASSWORD_RESET_CODE_EXPIRY_MINUTES = 10
PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 10
PASSWORD_RESET_MAX_ATTEMPTS = 5


def login_required(f):
    """Decorador para rutas que requieren autenticación"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'No autenticado'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Lista cerrada de soft skills permitidas organizadas por categoría
ALLOWED_SOFT_SKILLS = (
    'Trabajo en equipo', 'Comunicación efectiva', 'Pensamiento crítico', 'Adaptabilidad',
    'Creatividad', 'Empatía', 'Colaboración', 'Atención al detalle', 'Liderazgo', 'Organización',
    'Resolución de conflictos', 'Gestión del tiempo', 'Análisis crítico', 'Comunicación de datos',
    'Curiosidad', 'Metodología', 'Creatividad estratégica', 'Negociación', 'Visión de negocio',
    'Persuasión', 'Resolución de problemas', 'Aprendizaje continuo', 'Precisión'
)

# Agrupación de skills por categoría (para mejor UX)
# NOTA: Solo incluye skills que están en ALLOWED_SOFT_SKILLS
SKILLS_BY_CATEGORY = {
    'Comunicación': ['Comunicación efectiva', 'Comunicación de datos', 'Persuasión'],
    'Liderazgo': ['Liderazgo', 'Organización', 'Gestión del tiempo', 'Negociación', 'Visión de negocio'],
    'Pensamiento': ['Pensamiento crítico', 'Análisis crítico', 'Curiosidad', 'Metodología'],
    'Relaciones': ['Trabajo en equipo', 'Colaboración', 'Empatía', 'Resolución de conflictos'],
    'Creatividad': ['Creatividad', 'Creatividad estratégica'],
    'Valores': ['Atención al detalle', 'Precisión', 'Aprendizaje continuo', 'Adaptabilidad', 'Resolución de problemas']
}

def _normalize_soft_skill(value: str) -> str:
    """Normaliza un nombre de soft skill para comparar (case-insensitive, sin acentos, espacios colapsados)."""
    if value is None:
        return ''
    s = str(value).strip().lower()
    s = ''.join(ch for ch in unicodedata.normalize('NFKD', s) if not unicodedata.combining(ch))
    s = re.sub(r'\s+', ' ', s).strip()
    return s

_ALLOWED_SOFT_SKILLS_NORM = { _normalize_soft_skill(s): s for s in ALLOWED_SOFT_SKILLS }

def _canonical_soft_skill(value: str):
    """Devuelve la versión canónica (la de ALLOWED_SOFT_SKILLS) o None si no es válida."""
    key = _normalize_soft_skill(value)
    return _ALLOWED_SOFT_SKILLS_NORM.get(key)

def _compute_soft_skills_compat(required_skills, candidate_skills):
    """
    required_skills: iterable[str] skills requeridas (empresa)
    candidate_skills: iterable[str] skills del candidato
    Retorna (percentage:int, matches:list[str], missing:list[str], is_na:bool)
    """
    required_canonical = []
    for s in (required_skills or []):
        canon = _canonical_soft_skill(s)
        if canon:
            required_canonical.append(canon)

    candidate_set = set()
    for s in (candidate_skills or []):
        canon = _canonical_soft_skill(s)
        if canon:
            candidate_set.add(canon)

    required_set = set(required_canonical)
    if not required_set:
        return 0, [], [], True

    matches = sorted(required_set.intersection(candidate_set))
    missing = sorted(required_set.difference(candidate_set))
    percentage = int(round((len(matches) / len(required_set)) * 100))
    return percentage, matches, missing, False

# ==================== RUTAS DE AUTENTICACIÓN ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registra un nuevo usuario. account_type: 'empleado' (solo @tecmilenio.mx) o 'empleador' (cualquier dominio)."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido (se espera JSON)'}), 400
    email = data.get('email', '').strip()
    password = data.get('password', '')
    name = data.get('name', '').strip()
    account_type = (data.get('account_type') or 'empleado').strip().lower()
    
    # Validaciones
    if not email or not password or not name:
        return jsonify({'error': 'Todos los campos son requeridos'}), 400

    # Empleado: solo @tecmilenio.mx. Empleador: cualquier dominio de correo.
    if account_type == 'empleador':
        # Cualquier correo válido (validación básica de formato)
        if '@' not in email or '.' not in email.split('@')[-1]:
            return jsonify({'error': 'Ingresa un correo electrónico válido'}), 400
    else:
        if not email.endswith('@tecmilenio.mx'):
            return jsonify({'error': 'La cuenta de empleado requiere correo institucional @tecmilenio.mx'}), 400
    pwd_pattern = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$')
    if not pwd_pattern.match(password):
        return jsonify({'error': 'La contraseña debe tener 8-16 caracteres e incluir mayúsculas, minúsculas, números y símbolos'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Verificar si el email ya existe
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'error': 'Este correo ya está registrado'}), 400
        
        # Crear usuario
        password_hash = generate_password_hash(password)
        verification_code = generate_verification_code()
        
        cursor.execute(
            """INSERT INTO users (email, password_hash, name, email_verification_code, account_type) 
               VALUES (%s, %s, %s, %s, %s)""",
            (email, password_hash, name, verification_code, account_type)
        )
        user_id = cursor.lastrowid
        
        # Crear perfil vacío
        cursor.execute(
            """INSERT INTO user_profiles (user_id, position, department, image_url, experience, bio)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (user_id, '', 'Producto', '', '', '')
        )
        profile_id = cursor.lastrowid
        
        # Agregar soft skills por defecto (solo las permitidas en ALLOWED_SOFT_SKILLS)
        default_skills = ['Liderazgo', 'Visión de negocio', 'Empatía', 'Comunicación efectiva']
        for skill in default_skills:
            cursor.execute(
                "INSERT INTO user_soft_skills (user_profile_id, skill_name) VALUES (%s, %s)",
                (profile_id, skill)
            )
        
        conn.commit()

        email_sent, email_error = send_verification_email(email, verification_code)

        if email_sent:
            return jsonify({
                'message': 'Usuario registrado. Revisa tu correo para el código de verificación.',
                'user_id': user_id
            }), 201
        # Si falló el envío, devolver el código solo en desarrollo para no bloquear al usuario
        return jsonify({
            'message': 'Usuario registrado. No se pudo enviar el correo.',
            'user_id': user_id,
            'email_error': email_error,
            'verification_code': verification_code
        }), 201
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return jsonify({'error': f'Error al registrar: {str(e)}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Inicia sesión de un usuario"""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido (se espera JSON)'}), 400
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if not email or not password:
        return jsonify({'error': 'Email y contraseña son requeridos'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, email, password_hash, name, is_email_verified FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        # Email no registrado
        if not user:
            return jsonify({'error': 'Este correo electrónico no existe. Verifica que esté bien escrito o regístrate primero.'}), 404

        # Contraseña incorrecta
        if not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'La contraseña es incorrecta.'}), 401
        
        # Crear sesión
        session['user_id'] = user['id']
        session['user_email'] = user['email']
        
        return jsonify({
            'message': 'Login exitoso',
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'isEmailVerified': bool(user['is_email_verified'])
            }
        }), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """Cierra la sesión del usuario"""
    session.clear()
    return jsonify({'message': 'Sesión cerrada exitosamente'}), 200

@app.route('/api/auth/verify-email', methods=['POST'])
def verify_email():
    """Verifica el código de email del usuario"""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido (se espera JSON)'}), 400
    code = (data.get('code') or '').strip()
    
    if not code or len(code) != 6:
        return jsonify({'error': 'Código inválido'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, email FROM users WHERE email_verification_code = %s",
            (code,)
        )
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'Código inválido'}), 400
        
        # Actualizar usuario como verificado
        cursor.execute(
            "UPDATE users SET is_email_verified = TRUE, email_verification_code = NULL WHERE id = %s",
            (user['id'],)
        )
        conn.commit()
        
        # Crear sesión
        session['user_id'] = user['id']
        session['user_email'] = user['email']
        
        return jsonify({
            'message': 'Email verificado exitosamente',
            'user': {
                'id': user['id'],
                'email': user['email'],
                'isEmailVerified': True
            }
        }), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()
@app.route('/api/auth/resend-verification', methods=['POST'])
def resend_verification():
    """Reenvía el código de verificación al correo del usuario. Acepta cualquier correo (empleador puede usar @outlook.com, etc.)."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido (se espera JSON)'}), 400
    email = data.get('email', '').strip()
    if not email or '@' not in email or '.' not in email.split('@')[-1]:
        return jsonify({'error': 'Indica un correo electrónico válido'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, is_email_verified FROM users WHERE email = %s",
            (email,)
        )
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'No existe una cuenta con este correo'}), 404
        if user['is_email_verified']:
            return jsonify({'error': 'Este correo ya está verificado'}), 400

        new_code = generate_verification_code()
        cursor.execute(
            "UPDATE users SET email_verification_code = %s WHERE id = %s",
            (new_code, user['id'])
        )
        conn.commit()

        email_sent, email_error = send_verification_email(email, new_code)
        if email_sent:
            return jsonify({'message': 'Código reenviado a tu correo'}), 200
        return jsonify({
            'message': 'No se pudo enviar el correo.',
            'email_error': email_error,
            'verification_code': new_code
        }), 200
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if conn:
                conn.close()
        except Exception:
            pass

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """Solicita código de recuperación. Respuesta genérica por seguridad."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido (se espera JSON)'}), 400
    email = (data.get('email') or '').strip()
    if not email or not email.endswith('@tecmilenio.mx'):
        return jsonify({'error': 'Debes usar tu correo institucional (@tecmilenio.mx)'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()
        # Respuesta siempre genérica por seguridad, aunque el correo no exista
        if not user:
            return jsonify({'message': 'Si el correo existe, se envió un código.'}), 200

        # Invalidar cualquier reset previo pendiente de este email
        cursor.execute(
            "UPDATE password_resets SET used_at = NOW() WHERE email = %s AND used_at IS NULL",
            (email,)
        )

        # Crear un nuevo intento de recuperación con OTP nuevo
        code = generate_verification_code()
        code_hash = generate_password_hash(code)
        expires_at = datetime.now() + timedelta(minutes=PASSWORD_RESET_CODE_EXPIRY_MINUTES)
        cursor.execute(
            """INSERT INTO password_resets (email, code_hash, expires_at, attempts, used_at, reset_token_hash, reset_expires_at)
               VALUES (%s, %s, %s, 0, NULL, NULL, NULL)""",
            (email, code_hash, expires_at)
        )
        conn.commit()

        send_password_reset_email(email, code, PASSWORD_RESET_CODE_EXPIRY_MINUTES)
        return jsonify({'message': 'Si el correo existe, se envió un código.'}), 200
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': 'Error en la base de datos'}), 500
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.route('/api/auth/verify-code', methods=['POST'])
def verify_code():
    """Verifica el código OTP y devuelve un reset_token temporal."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido'}), 400
    email = (data.get('email') or '').strip()
    code = (data.get('code') or '').strip()
    if not email or not code or len(code) != 6:
        return jsonify({'error': 'Email y código de 6 dígitos son requeridos'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """SELECT id, code_hash, expires_at, attempts
               FROM password_resets
               WHERE email = %s
                 AND used_at IS NULL
                 AND reset_token_hash IS NULL
                 AND expires_at > NOW()
               ORDER BY created_at DESC
               LIMIT 1""",
            (email,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Código inválido o expirado. Solicita uno nuevo.'}), 400
        if row['attempts'] >= PASSWORD_RESET_MAX_ATTEMPTS:
            return jsonify({'error': 'Demasiados intentos. Solicita un nuevo código.'}), 400
        if not check_password_hash(row['code_hash'], code):
            cursor.execute(
                "UPDATE password_resets SET attempts = attempts + 1 WHERE id = %s",
                (row['id'],)
            )
            conn.commit()
            return jsonify({'error': 'Código incorrecto.'}), 400

        reset_token = secrets.token_urlsafe(32)
        reset_token_hash = generate_password_hash(reset_token)
        reset_expires_at = datetime.now() + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRY_MINUTES)
        cursor.execute(
            """UPDATE password_resets SET reset_token_hash = %s, reset_expires_at = %s WHERE id = %s""",
            (reset_token_hash, reset_expires_at, row['id'])
        )
        conn.commit()
        return jsonify({'reset_token': reset_token}), 200
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': 'Error en la base de datos'}), 500
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """Actualiza la contraseña usando reset_token. Invalida código/token tras éxito."""
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({'error': 'Cuerpo de la petición inválido'}), 400
    email = (data.get('email') or '').strip()
    reset_token = (data.get('reset_token') or '').strip()
    new_password = data.get('new_password') or ''
    if not email or not reset_token or not new_password:
        return jsonify({'error': 'Email, token y nueva contraseña son requeridos'}), 400

    pwd_pattern = re.compile(r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$')
    if not pwd_pattern.match(new_password):
        return jsonify({'error': 'La contraseña debe tener 8-16 caracteres e incluir mayúsculas, minúsculas, números y símbolos'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    cursor = None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """SELECT id, reset_token_hash, reset_expires_at
               FROM password_resets
               WHERE email = %s
                 AND used_at IS NULL
                 AND reset_token_hash IS NOT NULL
                 AND reset_expires_at > NOW()
               ORDER BY created_at DESC
               LIMIT 1""",
            (email,)
        )
        row = cursor.fetchone()
        if not row or not row['reset_token_hash']:
            return jsonify({'error': 'Token inválido o expirado. Vuelve a solicitar el código.'}), 400
        if not check_password_hash(row['reset_token_hash'], reset_token):
            return jsonify({'error': 'Token inválido.'}), 400

        password_hash = generate_password_hash(new_password)
        cursor.execute("UPDATE users SET password_hash = %s WHERE email = %s", (password_hash, email))
        cursor.execute(
            "UPDATE password_resets SET used_at = %s WHERE id = %s",
            (datetime.now(), row['id'])
        )
        conn.commit()
        return jsonify({'message': 'Contraseña actualizada correctamente.'}), 200
    except Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': 'Error en la base de datos'}), 500
    finally:
        if cursor:
            try:
                cursor.close()
            except Exception:
                pass
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@app.route('/api/auth/check', methods=['GET'])
def check_auth():
    """Verifica si el usuario está autenticado"""
    if 'user_id' not in session:
        return jsonify({'authenticated': False}), 200
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'authenticated': False}), 200
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, email, name, is_email_verified FROM users WHERE id = %s",
            (session['user_id'],)
        )
        user = cursor.fetchone()
        
        if not user:
            session.clear()
            return jsonify({'authenticated': False}), 200
        
        return jsonify({
            'authenticated': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'isEmailVerified': bool(user['is_email_verified'])
            }
        }), 200
        
    except Error as e:
        return jsonify({'authenticated': False}), 200
    finally:
        cursor.close()
        conn.close()

# ---------------- Microsoft / Outlook OAuth ----------------
MICROSOFT_TENANT_ID = os.environ.get('MICROSOFT_TENANT_ID', 'common')
MICROSOFT_AUTHORIZE_URL = f'https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize'
MICROSOFT_TOKEN_URL = f'https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/token'
MICROSOFT_GRAPH_ME = 'https://graph.microsoft.com/v1.0/me'
MICROSOFT_LOGOUT_URL = f'https://login.microsoftonline.com/{MICROSOFT_TENANT_ID}/oauth2/v2.0/logout'

def _get_ms_config():
    # Priorizar valores explícitos en backend/.env (evita que una variable de entorno del sistema interfiera)
    env_file = dotenv_values(os.path.join(BASE_DIR, ".env"))
    client_id = env_file.get('MICROSOFT_CLIENT_ID') or os.environ.get('MICROSOFT_CLIENT_ID') or os.environ.get('MS_CLIENT_ID')
    client_secret = env_file.get('MICROSOFT_CLIENT_SECRET') or os.environ.get('MICROSOFT_CLIENT_SECRET') or os.environ.get('MS_CLIENT_SECRET')
    redirect = env_file.get('MICROSOFT_REDIRECT_URI') or os.environ.get('MICROSOFT_REDIRECT_URI')
    # si no se indica, usar la ruta de callback en el mismo host
    if not redirect:
        redirect = os.environ.get('APP_URL', 'http://localhost:5000') + '/api/auth/microsoft/callback'
    return client_id, client_secret, redirect


@app.route('/api/auth/microsoft/config', methods=['GET'])
def microsoft_config():
    """Devuelve si Microsoft OAuth está configurado en el servidor"""
    client_id, client_secret, redirect = _get_ms_config()
    configured = bool(client_id and client_secret)
    return jsonify({'configured': configured}), 200


# DEBUG: información de configuración visible solo en desarrollo
@app.route('/api/auth/microsoft/debug', methods=['GET'])
def microsoft_debug():
    client_id, client_secret, redirect = _get_ms_config()
    env_path = os.path.join(BASE_DIR, ".env")
    env_file = dotenv_values(env_path)
    return jsonify({
        'base_dir': BASE_DIR,
        'env_path_used': env_path,
        'client_id_loaded_by_server': client_id,
        'redirect_uri_used': redirect,
        'client_secret_present': bool(client_secret),
        'env_file_values': {
            'MICROSOFT_CLIENT_ID': env_file.get('MICROSOFT_CLIENT_ID'),
            'MICROSOFT_CLIENT_SECRET_present': bool(env_file.get('MICROSOFT_CLIENT_SECRET'))
        }
    }), 200


@app.route('/api/auth/microsoft/login')
def microsoft_login():
    """Inicia flujo OAuth con Microsoft (redirige al proveedor)."""
    client_id, client_secret, redirect = _get_ms_config()
    if not client_id or not client_secret:
        # devolver página amigable cuando el usuario navega aquí
        return ("<html><body><h3>Microsoft OAuth no está configurado</h3>"
                "<p>Registra una app en Azure y añade MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET en el archivo .env del servidor.</p>"
                "<p><a href='/'>Volver</a></p></body></html>"), 500

    state = secrets.token_urlsafe(16)
    session['ms_oauth_state'] = state

    params = {
        'client_id': client_id,
        'response_type': 'code',
        'redirect_uri': redirect,
        'response_mode': 'query',
        # permite  llamar a Microsoft Graph /me
        'scope': 'openid profile email User.Read',
        # Forzar selector de cuenta para permitir iniciar con otra cuenta
        'prompt': 'select_account',
        'state': state
    }
    from urllib.parse import urlencode
    authorize_url = f"{MICROSOFT_AUTHORIZE_URL}?{urlencode(params)}"
    print(f"[MS-OAUTH] redirect -> {authorize_url}")
    return '', 302, {'Location': authorize_url}


@app.route('/api/auth/microsoft/logout')
def microsoft_logout():
    """Cierra la sesión local y redirige al endpoint de logout de Microsoft para permitir elegir otra cuenta."""
    # Limpiar sesión local
    session.pop('user_id', None)
    session.pop('user_email', None)
    session.pop('ms_oauth_state', None)

    post_logout = os.environ.get('APP_URL', 'http://localhost:5000')
    logout_url = f"{MICROSOFT_LOGOUT_URL}?post_logout_redirect_uri={post_logout}"
    print(f"[MS-OAUTH] redirecting to logout -> {logout_url}")
    return '', 302, {'Location': logout_url}


@app.route('/api/auth/microsoft/callback')
def microsoft_callback():
    """Callback que Microsoft redirige después de autenticación."""
    # Microsoft puede devolver error en la query (error + error_description)
    # Log completo de parámetros para depuración
    print(f"[MS-OAUTH] callback params: {request.args}")
    error = request.args.get('error')
    error_description = request.args.get('error_description')
    if error:
        print(f"[MS-OAUTH] callback error: {error} - {error_description}")
        return f"Microsoft OAuth error: {error} - {error_description}", 400

    state = request.args.get('state')
    code = request.args.get('code')

    if not state or session.get('ms_oauth_state') != state:
        return "Estado inválido (posible CSRF).", 400

    # intercambiar código por tokens
    client_id, client_secret, redirect = _get_ms_config()
    token_data = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': redirect,
    }

    # Hacemos el request y registramos la respuesta completa para depuración local
    token_resp = None
    try:
        token_resp = requests.post(MICROSOFT_TOKEN_URL, data=token_data, timeout=10)
    except requests.RequestException as e:
        print('[MS-OAUTH] request to token endpoint failed:', repr(e))
        return 'Error comunicándose con Microsoft OAuth (request failed).', 500

    # Si el endpoint devolvió un código distinto de 200, mostrar el body para depuración
    if token_resp.status_code != 200:
        body = token_resp.text
        print(f"[MS-OAUTH] token endpoint returned {token_resp.status_code}: {body}")
        # devolver el mensaje de error de MS en desarrollo para que puedas ver el detalle en el navegador
        return f"Error en token exchange ({token_resp.status_code}): {body}", 400

    try:
        tokens = token_resp.json()
    except ValueError:
        print('[MS-OAUTH] token endpoint returned invalid JSON:', token_resp.text)
        return 'Token endpoint returned invalid response.', 500

    access_token = tokens.get('access_token')
    if not access_token:
        print('[MS-OAUTH] no access_token in response:', tokens)
        return 'No se recibió access_token de Microsoft.', 400

    # obtener perfil del usuario desde Microsoft Graph (comprobar status y body para depuración)
    headers = {'Authorization': f'Bearer {access_token}'}
    # Allow configurable timeout via env var for slow networks or debugging
    graph_timeout = int(os.environ.get('MICROSOFT_HTTP_TIMEOUT', '20'))
    try:
        graph_resp = requests.get(MICROSOFT_GRAPH_ME, headers=headers, timeout=graph_timeout)
    except requests.exceptions.ReadTimeout:
        print(f"[MS-OAUTH] Graph /me request timed out after {graph_timeout}s")
        return f"Error: timeout contacting Microsoft Graph after {graph_timeout}s.", 504
    except requests.RequestException as e:
        print(f"[MS-OAUTH] request to Graph /me failed: {repr(e)}")
        return 'Error comunicándose con Microsoft Graph.', 500

    print(f"[MS-OAUTH] Graph /me status={graph_resp.status_code} body={graph_resp.text}")
    if graph_resp.status_code != 200:
        return f"Error obteniendo perfil (Graph): {graph_resp.status_code} - {graph_resp.text}", 400
    try:
        me = graph_resp.json()
    except ValueError:
        print('[MS-OAUTH] Graph /me returned invalid JSON:', graph_resp.text)
        return 'Respuesta inválida desde Microsoft Graph.', 500
    email = (me.get('mail') or me.get('userPrincipalName') or '').lower()
    name = me.get('displayName') or ''
    if not email:
        print(f"[MS-OAUTH] Graph /me no devolvió email: {me}")
        return f"No se pudo obtener el correo desde Microsoft Graph. Respuesta: {me}", 400

    # Buscar si el usuario ya existe
    conn = get_db_connection()
    if not conn:
        return "Error de conexión a la base de datos.", 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, account_type FROM users WHERE email = %s", (email,))
        user = cursor.fetchone()

        if user:
            # Usuario ya registrado: iniciar sesión y redirigir
            session['user_id'] = user['id']
            session['user_email'] = email
            session.pop('ms_oauth_state', None)
            session.pop('ms_oauth_pending_email', None)
            session.pop('ms_oauth_pending_name', None)
            return '', 302, {'Location': '/'}
        else:
            # Usuario nuevo: guardar pendiente y redirigir para que elija empleado/empleador
            session['ms_oauth_pending_email'] = email
            session['ms_oauth_pending_name'] = name or email.split('@')[0]
            session.pop('ms_oauth_state', None)
            return '', 302, {'Location': '/'}
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@app.route('/api/auth/microsoft/pending', methods=['GET'])
def microsoft_pending():
    """Devuelve email y nombre si hay un registro OAuth pendiente de elegir tipo de cuenta."""
    email = session.get('ms_oauth_pending_email')
    name = session.get('ms_oauth_pending_name')
    if not email:
        return jsonify({'pending': False}), 200
    return jsonify({'pending': True, 'email': email, 'name': name or email.split('@')[0]}), 200


@app.route('/api/auth/microsoft/complete', methods=['POST'])
def microsoft_complete():
    """Completa el registro OAuth con el tipo de cuenta elegido. Empleado solo permite @tecmilenio.mx."""
    data = request.get_json(silent=True) or {}
    account_type = (data.get('account_type') or 'empleado').strip().lower()
    email = session.get('ms_oauth_pending_email')
    name = session.get('ms_oauth_pending_name') or ''

    if not email:
        return jsonify({'error': 'No hay registro de Microsoft pendiente. Inicia sesión con Microsoft de nuevo.'}), 400

    # Empleado: solo @tecmilenio.mx. @outlook.com, @hotmail.com, etc. no son válidos para empleado.
    if account_type == 'empleado':
        if not email.endswith('@tecmilenio.mx'):
            return jsonify({
                'error': 'La cuenta de empleado requiere correo institucional @tecmilenio.mx. '
                         'Usa el registro con correo y contraseña con tu correo @tecmilenio.mx o elige Empleador si tienes otro correo (ej. @outlook.com).'
            }), 400

    # Empleador: solo correos NO institucionales. Si es @tecmilenio.mx debe ir como empleado.
    if account_type == 'empleador':
        if email.endswith('@tecmilenio.mx'):
            return jsonify({
                'error': 'Las cuentas @tecmilenio.mx deben registrarse como Empleado, no como Empleador.'
            }), 400
        # Para empleador solo validamos que el correo tenga formato básico correcto.
        if '@' not in email or '.' not in email.split('@')[-1]:
            return jsonify({'error': 'Ingresa un correo electrónico válido para tu cuenta de empleador.'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            session.pop('ms_oauth_pending_email', None)
            session.pop('ms_oauth_pending_name', None)
            return jsonify({'error': 'Este correo ya está registrado'}), 400

        pwd_hash = generate_password_hash(secrets.token_urlsafe(32))
        cursor.execute(
            "INSERT INTO users (email, password_hash, name, is_email_verified, account_type) VALUES (%s, %s, %s, TRUE, %s)",
            (email, pwd_hash, name or email.split('@')[0], account_type)
        )
        user_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO user_profiles (user_id, position, department, image_url, experience, bio) VALUES (%s, %s, %s, %s, %s, %s)",
            (user_id, '', 'Producto', '', '', '')
        )
        profile_id = cursor.lastrowid
        for skill in ['Liderazgo', 'Empatía', 'Comunicación']:
            if skill in ALLOWED_SOFT_SKILLS:
                cursor.execute("INSERT INTO user_soft_skills (user_profile_id, skill_name) VALUES (%s, %s)", (profile_id, skill))
        conn.commit()

        session['user_id'] = user_id
        session['user_email'] = email
        session.pop('ms_oauth_pending_email', None)
        session.pop('ms_oauth_pending_name', None)
        return jsonify({'message': 'Cuenta creada', 'user_id': user_id}), 200
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        return jsonify({'error': f'Error al completar el registro: {str(e)}'}), 500
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


@app.route('/api/auth/microsoft/cancel-pending', methods=['POST'])
def microsoft_cancel_pending():
    """Cancela el registro OAuth pendiente para poder usar login normal."""
    session.pop('ms_oauth_pending_email', None)
    session.pop('ms_oauth_pending_name', None)
    return jsonify({'message': 'OK'}), 200


# ==================== RUTAS DE SOFT SKILLS ====================

@app.route('/api/skills/allowed', methods=['GET'])
def get_allowed_skills():
    """Devuelve los soft skills permitidas agrupados por categoría"""
    return jsonify({'skills': list(ALLOWED_SOFT_SKILLS), 'categories': SKILLS_BY_CATEGORY}), 200

@app.route('/api/profile/soft-skills', methods=['POST'])
@login_required
def save_profile_soft_skills():
    """Guarda las soft skills seleccionadas del usuario. Reemplaza las existentes."""
    data = request.json
    soft_skills = data.get('softSkills') or []

    if not isinstance(soft_skills, list):
        return jsonify({'error': 'softSkills debe ser una lista'}), 400

    # Solo permitir skills de la lista cerrada
    invalid = [s for s in soft_skills if s not in ALLOWED_SOFT_SKILLS]
    if invalid:
        return jsonify({'error': f'Soft skills no permitidas: {", ".join(invalid)}'}), 400

    if len(soft_skills) < 3:
        return jsonify({'error': 'Debes seleccionar al menos 3 soft skills'}), 400

    user_id = session['user_id']
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM user_profiles WHERE user_id = %s", (user_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Perfil no encontrado'}), 404

        profile_id = row['id']
        cursor.execute("DELETE FROM user_soft_skills WHERE user_profile_id = %s", (profile_id,))
        for skill_name in soft_skills:
            cursor.execute(
                "INSERT INTO user_soft_skills (user_profile_id, skill_name) VALUES (%s, %s)",
                (profile_id, skill_name)
            )
        conn.commit()
        return jsonify({'message': 'Soft skills guardadas correctamente'}), 200
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/compatibility', methods=['GET'])
@login_required
def get_soft_skills_compatibility():
    """
    Compatibilidad 0-100% entre soft skills requeridas (del usuario logueado)
    y las soft skills de un candidato.

    Query params:
      - candidateId: int
      - source: 'employee' | 'user'
    Respuesta:
      { percentage, skills_match, skills_missing, is_na }
    """
    user_id = session['user_id']
    candidate_id = request.args.get('candidateId', type=int)
    source = (request.args.get('source') or 'employee').strip().lower()

    if not candidate_id:
        return jsonify({'error': 'candidateId es requerido'}), 400
    if source not in ('employee', 'user'):
        return jsonify({'error': 'source inválido (employee|user)'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # Skills requeridas = skills del usuario logueado (empresa)
        cursor.execute(
            """
            SELECT uss.skill_name
            FROM user_profiles p
            JOIN user_soft_skills uss ON uss.user_profile_id = p.id
            WHERE p.user_id = %s
            """,
            (user_id,)
        )
        required = [row['skill_name'] for row in cursor.fetchall()]

        candidate = []
        if source == 'employee':
            cursor.execute("SELECT skill_name FROM employee_soft_skills WHERE employee_id = %s", (candidate_id,))
            candidate = [row['skill_name'] for row in cursor.fetchall()]
        else:
            cursor.execute(
                """
                SELECT uss.skill_name
                FROM user_profiles p
                JOIN user_soft_skills uss ON uss.user_profile_id = p.id
                WHERE p.user_id = %s
                """,
                (candidate_id,)
            )
            candidate = [row['skill_name'] for row in cursor.fetchall()]

        percentage, matches, missing, is_na = _compute_soft_skills_compat(required, candidate)
        return jsonify({
            'percentage': percentage,
            'porcentaje': percentage,
            'skills_match': matches,
            'skills_coinciden': matches,
            'skills_missing': missing,
            'skills_faltan': missing,
            'is_na': is_na
        }), 200

    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# ==================== RUTAS DE EMPLEADOS ====================

@app.route('/api/employees', methods=['GET'])
@login_required
def get_employees():
    """Obtiene candidatos disponibles: empleados + otros usuarios registrados (no match ni rechazados)"""
    user_id = session['user_id']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)

        # Skills requeridas por la "empresa" = skills del usuario logueado
        cursor.execute(
            """
            SELECT uss.skill_name
            FROM user_profiles p
            JOIN user_soft_skills uss ON uss.user_profile_id = p.id
            WHERE p.user_id = %s
            """,
            (user_id,)
        )
        required_skills = [row['skill_name'] for row in cursor.fetchall()]
        
        # --- Empleados ---
        cursor.execute("SELECT employee_id FROM matches WHERE user_id = %s", (user_id,))
        matched_ids = [row['employee_id'] for row in cursor.fetchall()]
        cursor.execute("SELECT employee_id FROM rejections WHERE user_id = %s", (user_id,))
        rejected_ids = [row['employee_id'] for row in cursor.fetchall()]
        excluded_ids = matched_ids + rejected_ids
        
        if excluded_ids:
            placeholders = ','.join(['%s'] * len(excluded_ids))
            query = f"""
                SELECT DISTINCT e.id, e.name, e.position, e.department, e.image_url, e.experience, e.bio,
                       GROUP_CONCAT(DISTINCT ess.skill_name) as soft_skills
                FROM employees e
                LEFT JOIN employee_soft_skills ess ON e.id = ess.employee_id
                WHERE e.is_active = TRUE AND e.id NOT IN ({placeholders})
                GROUP BY e.id, e.name, e.position, e.department, e.image_url, e.experience, e.bio
                ORDER BY e.id
            """
            cursor.execute(query, excluded_ids)
        else:
            query = """
                SELECT DISTINCT e.id, e.name, e.position, e.department, e.image_url, e.experience, e.bio,
                       GROUP_CONCAT(DISTINCT ess.skill_name) as soft_skills
                FROM employees e
                LEFT JOIN employee_soft_skills ess ON e.id = ess.employee_id
                WHERE e.is_active = TRUE
                GROUP BY e.id, e.name, e.position, e.department, e.image_url, e.experience, e.bio
                ORDER BY e.id
            """
            cursor.execute(query)
        employees = cursor.fetchall()
        
        result = []
        seen_ids = set()  # Para evitar duplicados
        
        for emp in employees:
            emp_id = emp['id']
            # Saltar si ya hemos visto este empleado
            if emp_id in seen_ids:
                continue
            seen_ids.add(emp_id)
            
            # Limpiar soft skills (eliminar espacios y valores vacíos)
            soft_skills = []
            if emp['soft_skills']:
                soft_skills = [skill.strip() for skill in emp['soft_skills'].split(',') if skill.strip()]

            percentage, matches, missing, is_na = _compute_soft_skills_compat(required_skills, soft_skills)
            
            result.append({
                'id': emp_id,
                'source': 'employee',
                'name': emp['name'],
                'position': emp['position'],
                'department': emp['department'],
                'image': emp['image_url'],
                'experience': emp['experience'],
                'bio': emp['bio'],
                'softSkills': soft_skills,
                'compatibility': {
                    'percentage': percentage,
                    'porcentaje': percentage,
                    'skills_match': matches,
                    'skills_coinciden': matches,
                    'skills_missing': missing,
                    'skills_faltan': missing,
                    'is_na': is_na
                }
            })
        
        # --- Otros usuarios registrados (verificados y con perfil) ---
        cursor.execute("SELECT other_user_id FROM user_matches WHERE user_id = %s", (user_id,))
        matched_user_ids = [row['other_user_id'] for row in cursor.fetchall()]
        cursor.execute("SELECT other_user_id FROM user_rejections WHERE user_id = %s", (user_id,))
        rejected_user_ids = [row['other_user_id'] for row in cursor.fetchall()]
        excluded_user_ids = [user_id] + matched_user_ids + rejected_user_ids
        placeholders = ','.join(['%s'] * len(excluded_user_ids))
        
        # Solo incluir usuarios que son candidatos (empleado). Los empleadores nunca aparecen como candidatos.
        query_users = f"""
            SELECT DISTINCT u.id, u.name, p.position, p.department, p.image_url, p.experience, p.bio,
                   GROUP_CONCAT(DISTINCT uss.skill_name) as soft_skills
            FROM users u
            INNER JOIN user_profiles p ON p.user_id = u.id
            LEFT JOIN user_soft_skills uss ON uss.user_profile_id = p.id
            WHERE u.is_email_verified = TRUE AND u.id NOT IN ({placeholders})
              AND (u.account_type = 'empleado' OR u.account_type IS NULL)
            GROUP BY u.id, u.name, p.position, p.department, p.image_url, p.experience, p.bio
            ORDER BY u.created_at DESC
        """
        cursor.execute(query_users, excluded_user_ids)
        other_users = cursor.fetchall()
        
        default_image = 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=95&w=1920'
        for row in other_users:
            user_id_row = row['id']
            # Saltar si ya hemos visto este usuario
            if user_id_row in seen_ids:
                continue
            seen_ids.add(user_id_row)
            
            # Limpiar soft skills (eliminar espacios y valores vacíos)
            soft_skills = []
            if row['soft_skills']:
                soft_skills = [skill.strip() for skill in row['soft_skills'].split(',') if skill.strip()]

            percentage, matches, missing, is_na = _compute_soft_skills_compat(required_skills, soft_skills)
            
            result.append({
                'id': user_id_row,
                'source': 'user',
                'name': row['name'] or 'Usuario',
                'position': row['position'] or '',
                'department': row['department'] or '',
                'image': row['image_url'] or default_image,
                'experience': row['experience'] or '',
                'bio': row['bio'] or '',
                'softSkills': soft_skills,
                'compatibility': {
                    'percentage': percentage,
                    'porcentaje': percentage,
                    'skills_match': matches,
                    'skills_coinciden': matches,
                    'skills_missing': missing,
                    'skills_faltan': missing,
                    'is_na': is_na
                }
            })
        
        return jsonify(result), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/employees/<int:employee_id>/accept', methods=['POST'])
@login_required
def accept_employee(employee_id):
    """Acepta un candidato: empleado o usuario (match). Body opcional: { \"source\": \"user\" }"""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    source = (data.get('source') or 'employee').lower()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor()
        
        if source == 'user':
            if employee_id == user_id:
                return jsonify({'error': 'No puedes hacer match contigo mismo'}), 400
            cursor.execute("SELECT id FROM users WHERE id = %s AND is_email_verified = TRUE", (employee_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Usuario no encontrado'}), 404
            cursor.execute(
                "INSERT IGNORE INTO user_matches (user_id, other_user_id) VALUES (%s, %s)",
                (user_id, employee_id)
            )
            conn.commit()
            return jsonify({'message': 'Usuario aceptado'}), 200
        
        # Empleado
        cursor.execute("SELECT id FROM employees WHERE id = %s AND is_active = TRUE", (employee_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Empleado no encontrado'}), 404
        cursor.execute(
            "INSERT IGNORE INTO matches (user_id, employee_id) VALUES (%s, %s)",
            (user_id, employee_id)
        )
        conn.commit()
        return jsonify({'message': 'Empleado aceptado'}), 200
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/employees/<int:employee_id>/reject', methods=['POST'])
@login_required
def reject_employee(employee_id):
    """Rechaza un candidato: empleado o usuario. Body opcional: { \"source\": \"user\" }"""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    source = (data.get('source') or 'employee').lower()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor()
        
        if source == 'user':
            if employee_id == user_id:
                return jsonify({'error': 'No puedes rechazarte a ti mismo'}), 400
            cursor.execute("SELECT id FROM users WHERE id = %s", (employee_id,))
            if not cursor.fetchone():
                return jsonify({'error': 'Usuario no encontrado'}), 404
            cursor.execute(
                "INSERT IGNORE INTO user_rejections (user_id, other_user_id) VALUES (%s, %s)",
                (user_id, employee_id)
            )
            conn.commit()
            return jsonify({'message': 'Usuario rechazado'}), 200
        
        cursor.execute("SELECT id FROM employees WHERE id = %s AND is_active = TRUE", (employee_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Empleado no encontrado'}), 404
        cursor.execute(
            "INSERT IGNORE INTO rejections (user_id, employee_id) VALUES (%s, %s)",
            (user_id, employee_id)
        )
        conn.commit()
        return jsonify({'message': 'Empleado rechazado'}), 200
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/employees/<int:employee_id>/unmatch', methods=['DELETE'])
@login_required
def unmatch_employee(employee_id):
    """Elimina un match existente (para undo). Body opcional: { \"source\": \"user\" }"""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    source = (data.get('source') or 'employee').lower()
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor()
        
        if source == 'user':
            # Eliminar match con usuario
            cursor.execute(
                "DELETE FROM user_matches WHERE user_id = %s AND other_user_id = %s",
                (user_id, employee_id)
            )
            deleted = cursor.rowcount
            conn.commit()
            if deleted > 0:
                return jsonify({'message': 'Match con usuario eliminado'}), 200
            else:
                return jsonify({'message': 'No se encontró el match'}), 404
        
        # Eliminar match con empleado
        cursor.execute(
            "DELETE FROM matches WHERE user_id = %s AND employee_id = %s",
            (user_id, employee_id)
        )
        deleted = cursor.rowcount
        conn.commit()
        
        if deleted > 0:
            return jsonify({'message': 'Match con empleado eliminado'}), 200
        else:
            return jsonify({'message': 'No se encontró el match'}), 404
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/matches', methods=['GET'])
@login_required
def get_matches():
    """Obtiene los matches del usuario (empleados + usuarios)"""
    user_id = session['user_id']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        result = []
        default_image = 'https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=95&w=1920'

        # Skills requeridas por la "empresa" = skills del usuario logueado
        cursor.execute(
            """
            SELECT uss.skill_name
            FROM user_profiles p
            JOIN user_soft_skills uss ON uss.user_profile_id = p.id
            WHERE p.user_id = %s
            """,
            (user_id,)
        )
        required_skills = [row['skill_name'] for row in cursor.fetchall()]
        
        # Matches con empleados
        query = """
            SELECT e.*, GROUP_CONCAT(ess.skill_name) as soft_skills
            FROM matches m
            JOIN employees e ON m.employee_id = e.id
            LEFT JOIN employee_soft_skills ess ON e.id = ess.employee_id
            WHERE m.user_id = %s
            GROUP BY e.id
            ORDER BY m.created_at DESC
        """
        cursor.execute(query, (user_id,))
        for emp in cursor.fetchall():
            emp_skills = emp['soft_skills'].split(',') if emp['soft_skills'] else []
            percentage, matches, missing, is_na = _compute_soft_skills_compat(required_skills, emp_skills)
            result.append({
                'id': emp['id'],
                'source': 'employee',
                'name': emp['name'],
                'position': emp['position'],
                'department': emp['department'],
                'image': emp['image_url'],
                'experience': emp['experience'],
                'bio': emp['bio'],
                'softSkills': emp_skills,
                'compatibility': {
                    'percentage': percentage,
                    'porcentaje': percentage,
                    'skills_match': matches,
                    'skills_coinciden': matches,
                    'skills_missing': missing,
                    'skills_faltan': missing,
                    'is_na': is_na
                }
            })
        
        # Matches con otros usuarios (solo candidatos empleados; empleadores no aparecen en matches)
        query_user = """
            SELECT u.id, u.name, p.position, p.department, p.image_url, p.experience, p.bio,
                   GROUP_CONCAT(uss.skill_name) as soft_skills
            FROM user_matches um
            JOIN users u ON u.id = um.other_user_id
            JOIN user_profiles p ON p.user_id = u.id
            LEFT JOIN user_soft_skills uss ON uss.user_profile_id = p.id
            WHERE um.user_id = %s
              AND (u.account_type = 'empleado' OR u.account_type IS NULL)
            GROUP BY u.id, u.name, p.position, p.department, p.image_url, p.experience, p.bio
            ORDER BY um.created_at DESC
        """
        cursor.execute(query_user, (user_id,))
        for row in cursor.fetchall():
            user_skills = row['soft_skills'].split(',') if row['soft_skills'] else []
            percentage, matches, missing, is_na = _compute_soft_skills_compat(required_skills, user_skills)
            result.append({
                'id': row['id'],
                'source': 'user',
                'name': row['name'] or 'Usuario',
                'position': row['position'] or '',
                'department': row['department'] or '',
                'image': row['image_url'] or default_image,
                'experience': row['experience'] or '',
                'bio': row['bio'] or '',
                'softSkills': user_skills,
                'compatibility': {
                    'percentage': percentage,
                    'porcentaje': percentage,
                    'skills_match': matches,
                    'skills_coinciden': matches,
                    'skills_missing': missing,
                    'skills_faltan': missing,
                    'is_na': is_na
                }
            })
        
        return jsonify(result), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    """Obtiene las estadísticas del usuario: perfiles revisados y matches realizados"""
    user_id = session['user_id']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Contar perfiles revisados (rechazados + aceptados/matches)
        cursor.execute(
            "SELECT COUNT(*) as count FROM rejections WHERE user_id = %s",
            (user_id,)
        )
        rejected_employees = cursor.fetchone()['count']
        
        cursor.execute(
            "SELECT COUNT(*) as count FROM user_rejections WHERE user_id = %s",
            (user_id,)
        )
        rejected_users = cursor.fetchone()['count']
        
        cursor.execute(
            "SELECT COUNT(*) as count FROM matches WHERE user_id = %s",
            (user_id,)
        )
        matched_employees = cursor.fetchone()['count']
        
        cursor.execute(
            "SELECT COUNT(*) as count FROM user_matches WHERE user_id = %s",
            (user_id,)
        )
        matched_users = cursor.fetchone()['count']
        
        # Perfiles revisados = rechazados + aceptados
        profiles_reviewed = rejected_employees + rejected_users + matched_employees + matched_users
        
        # Matches realizados = aceptados (matches + user_matches)
        matches_made = matched_employees + matched_users
        
        return jsonify({
            'profilesReviewed': profiles_reviewed,
            'matchesMade': matches_made
        }), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/matches/contact', methods=['POST'])
@login_required
def contact_match():
    """Envía un correo al match seleccionado (empleado o usuario)."""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}

    target_id = data.get('targetId')
    source = (data.get('source') or 'user').strip()
    subject = (data.get('subject') or '').strip()
    message = (data.get('message') or '').strip()

    if not isinstance(target_id, int):
        return jsonify({'error': 'ID de destinatario inválido.'}), 400
    if not subject or not message:
        return jsonify({'error': 'Asunto y mensaje son obligatorios.'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # Obtener datos del remitente
        cursor.execute(
            "SELECT u.email, u.name, u.account_type FROM users u WHERE u.id = %s",
            (user_id,)
        )
        sender = cursor.fetchone()
        if not sender:
            return jsonify({'error': 'Usuario no encontrado'}), 400

        sender_email = sender['email']
        sender_name = sender['name'] or 'Usuario Necting'

        # Por simplicidad permitimos que cualquier tipo de cuenta envíe mensajes,
        # pero normalmente esto se limitaría a empleadores.

        # Verificar que realmente existe un match entre el usuario y el destinatario
        target_email = None
        target_name = None

        if source == 'employee':
            # matches con tabla employees
            cursor.execute(
                """
                SELECT e.name
                FROM matches m
                JOIN employees e ON e.id = m.employee_id
                WHERE m.user_id = %s AND e.id = %s
                """,
                (user_id, target_id)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'No tienes un match válido con este candidato.'}), 400

            # Por ahora no tenemos correo en la tabla employees; mostramos error claro.
            return jsonify({
                'error': 'Este candidato de demostración no tiene un correo institucional configurado aún.'
            }), 400

        else:
            # matches con otros usuarios (user_matches)
            cursor.execute(
                """
                SELECT u.email, u.name
                FROM user_matches um
                JOIN users u ON u.id = um.other_user_id
                WHERE um.user_id = %s AND u.id = %s
                """,
                (user_id, target_id)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'No tienes un match válido con este candidato.'}), 400

            target_email = row['email']
            target_name = row['name'] or 'Usuario Necting'

        if not target_email:
            return jsonify({'error': 'El destinatario no tiene un correo institucional configurado.'}), 400

        ok, err = send_contact_email(
            to_email=target_email,
            subject=subject,
            body=message,
            sender_name=sender_name,
            sender_email=sender_email,
        )

        if not ok:
            return jsonify({'error': f'No se pudo enviar el correo: {err}'}), 500

        return jsonify({
            'message': 'Mensaje enviado correctamente.',
            'to': {
                'name': target_name,
                'email': target_email,
            }
        }), 200

    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# ==================== RUTAS DE PERFIL ====================

def _get_onboarding_step(cursor, user_id, profile, skills_count):
    """Determina el paso de onboarding: 'profile' | 'photos' | 'soft_skills' | 'done'."""
    position = (profile or {}).get('position') or ''
    experience = (profile or {}).get('experience')
    if experience is None:
        experience = ''
    has_position_exp = bool(position.strip() and str(experience).strip() != '')
    photo_count = 0
    if profile:
        for key in ('image_url', 'image_url_2', 'image_url_3', 'image_url_4'):
            if profile.get(key) and profile.get(key).strip():
                photo_count += 1
    if not has_position_exp:
        return 'profile', photo_count
    if photo_count < 2:
        return 'photos', photo_count
    if (skills_count or 0) < 3:
        return 'soft_skills', photo_count
    return 'done', photo_count


@app.route('/api/profile/onboarding-status', methods=['GET'])
@login_required
def get_onboarding_status():
    """Devuelve el paso actual de onboarding para mostrar la pantalla correcta."""
    user_id = session['user_id']
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM user_profiles WHERE user_id = %s", (user_id,))
        profile = cursor.fetchone()
        cursor.execute(
            "SELECT COUNT(*) as c FROM user_soft_skills uss JOIN user_profiles p ON p.id = uss.user_profile_id WHERE p.user_id = %s",
            (user_id,)
        )
        skills_count = cursor.fetchone().get('c', 0)
        step, photo_count = _get_onboarding_step(cursor, user_id, profile, skills_count)
        return jsonify({'step': step, 'photoCount': photo_count}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/profile/complete-onboarding', methods=['POST'])
@login_required
def complete_onboarding():
    """Guarda ocupación (position) y años de experiencia. Primer paso de onboarding."""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    position = (data.get('position') or '').strip()
    experience = (data.get('experience') or '').strip()
    if not position:
        return jsonify({'error': 'Indica tu ocupación'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE user_profiles SET position = %s, experience = %s WHERE user_id = %s",
            (position, experience, user_id)
        )
        conn.commit()
        return jsonify({'message': 'Perfil actualizado'}), 200
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


def _allowed_file(filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return ext in ALLOWED_IMAGE_EXTENSIONS


@app.route('/api/profile/upload-photo', methods=['POST'])
@login_required
def upload_profile_photo():
    """Sube una foto de perfil. Asigna al primer slot vacío (image_url, image_url_2, image_url_3, image_url_4). Máx 5MB."""
    if 'file' not in request.files and 'photo' not in request.files:
        return jsonify({'error': 'No se envió ninguna imagen'}), 400
    file = request.files.get('file') or request.files.get('photo')
    if not file or file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo'}), 400
    if not _allowed_file(file.filename):
        return jsonify({'error': 'Solo se permiten imágenes (JPG, PNG, GIF, WebP)'}), 400
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_IMAGE_SIZE_MB * 1024 * 1024:
        return jsonify({'error': f'Tamaño máximo por imagen: {MAX_IMAGE_SIZE_MB}MB'}), 400
    user_id = session['user_id']
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, image_url, image_url_2, image_url_3, image_url_4 FROM user_profiles WHERE user_id = %s", (user_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Perfil no encontrado'}), 404
        slot_keys = ['image_url', 'image_url_2', 'image_url_3', 'image_url_4']
        slot = None
        for k in slot_keys:
            if not (row.get(k) and row[k].strip()):
                slot = k
                break
        if not slot:
            return jsonify({'error': 'Ya tienes 4 fotos. No se pueden subir más.'}), 400

        # Subir a Cloudinary en lugar de guardar en disco local
        try:
            upload_result = cloudinary.uploader.upload(
                file,
                folder=f"{CLOUDINARY_FOLDER}/user_{user_id}",
                overwrite=False,
                resource_type="image",
            )
            url = upload_result.get('secure_url')
            if not url:
                raise RuntimeError("Cloudinary no devolvió una URL segura")
        except Exception as e:
            print(f"Error subiendo imagen a Cloudinary para user_id={user_id}: {e}")
            return jsonify({'error': 'No se pudo subir la imagen. Intenta de nuevo.'}), 500

        cursor.execute(f"UPDATE user_profiles SET {slot} = %s WHERE user_id = %s", (url, user_id))
        conn.commit()
        return jsonify({'url': url, 'slot': slot}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Sirve archivos subidos desde backend/uploads."""
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    """Obtiene el perfil del usuario"""
    user_id = session['user_id']
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Obtener usuario
        cursor.execute("SELECT id, email, name FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        
        # Obtener perfil
        cursor.execute("SELECT * FROM user_profiles WHERE user_id = %s", (user_id,))
        profile = cursor.fetchone()
        
        # Obtener soft skills
        cursor.execute(
            "SELECT skill_name FROM user_soft_skills WHERE user_profile_id = %s",
            (profile['id'],)
        )
        skills = [row['skill_name'] for row in cursor.fetchall()]
        
        images = []
        for key in ('image_url', 'image_url_2', 'image_url_3', 'image_url_4'):
            url = (profile.get(key) or '').strip()
            if url:
                images.append(url)
        avatar_pos = (profile.get('avatar_position') or '50% 50%').strip() or '50% 50%'
        return jsonify({
            'name': user['name'],
            'email': user['email'],
            'position': profile['position'],
            'department': profile['department'],
            'image': profile['image_url'],
            'profileImages': images,
            'avatarPosition': avatar_pos,
            'experience': profile['experience'],
            'bio': profile['bio'],
            'softSkills': skills
        }), 200
        
    except Error as e:
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """Actualiza el perfil del usuario"""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión a la base de datos'}), 500
    
    try:
        cursor = conn.cursor()

        # Actualizar perfil (department se mantiene si no viene en el payload)
        fields = []
        values = []
        fields.append("position = %s")
        values.append(data.get('position', ''))

        if 'department' in data:
            fields.append("department = %s")
            values.append(data.get('department', ''))

        fields.append("image_url = %s")
        values.append(data.get('image', ''))
        if 'avatarPosition' in data:
            fields.append("avatar_position = %s")
            values.append(data.get('avatarPosition', '50% 50%'))
        fields.append("experience = %s")
        values.append(data.get('experience', ''))
        fields.append("bio = %s")
        values.append(data.get('bio', ''))

        values.append(user_id)
        cursor.execute(f"UPDATE user_profiles SET {', '.join(fields)} WHERE user_id = %s", tuple(values))
        
        # Obtener profile_id
        cursor.execute("SELECT id FROM user_profiles WHERE user_id = %s", (user_id,))
        profile = cursor.fetchone()
        profile_id = profile[0]
        
        # Actualizar soft skills
        if 'softSkills' in data:
            # Eliminar skills existentes
            cursor.execute("DELETE FROM user_soft_skills WHERE user_profile_id = %s", (profile_id,))
            
            # Insertar nuevas skills
            for skill in data['softSkills']:
                cursor.execute(
                    "INSERT INTO user_soft_skills (user_profile_id, skill_name) VALUES (%s, %s)",
                    (profile_id, skill)
                )
        
        conn.commit()
        
        return jsonify({'message': 'Perfil actualizado exitosamente'}), 200
        
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'Error en la base de datos: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/profile/set-primary-photo', methods=['POST'])
@login_required
def set_primary_photo():
    """Establece qué foto es la principal (ícono de perfil). slot: image_url_2, image_url_3 o image_url_4."""
    user_id = session['user_id']
    data = request.get_json(silent=True) or {}
    slot = (data.get('slot') or data.get('index') or '').strip()
    allowed = ('image_url_2', 'image_url_3', 'image_url_4')
    if slot not in allowed:
        return jsonify({'error': 'Indica la foto a establecer como principal (image_url_2, image_url_3 o image_url_4)'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Error de conexión'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT image_url, image_url_2, image_url_3, image_url_4 FROM user_profiles WHERE user_id = %s",
            (user_id,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Perfil no encontrado'}), 404
        other_url = (row.get(slot) or '').strip()
        if not other_url:
            return jsonify({'error': 'Esa posición no tiene foto'}), 400
        main_url = (row.get('image_url') or '').strip()
        cursor.execute(
            "UPDATE user_profiles SET image_url = %s, " + slot + " = %s WHERE user_id = %s",
            (other_url, main_url, user_id)
        )
        conn.commit()
        return jsonify({'message': 'Foto principal actualizada', 'image': other_url}), 200
    except Error as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()


# ==================== RUTAS PARA SERVIR EL FRONTEND ====================

@app.route('/')
def index():
    """Sirve la página principal del frontend"""
    return send_file(os.path.join(FRONTEND_DIR, 'index.html'))

@app.route('/css/<path:filename>')
def serve_css(filename):
    """Sirve archivos CSS"""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'css'), filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    """Sirve archivos JavaScript"""
    return send_from_directory(os.path.join(FRONTEND_DIR, 'js'), filename)

@app.route('/favicon.ico')
def favicon():
    """Maneja la solicitud de favicon"""
    return '', 204  # No Content - el navegador dejará de solicitarlo

if __name__ == '__main__':
    PORT = 5000
    print("\n" + "="*50)
    print(f"Servidor iniciado en http://localhost:{PORT}")
    print("="*50 + "\n")
    app.run(debug=True, port=PORT)
