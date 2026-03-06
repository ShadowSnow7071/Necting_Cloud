/**
 * API Client para Necting
 */
// Usar URL relativa ya que el frontend y backend están en el mismo puerto
const API_BASE_URL = 'https://necting-cloud.onrender.com/api';

// Función auxiliar para hacer peticiones
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        credentials: 'include', // Para cookies de sesión
    };

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const text = await response.text();
            console.error('API no devolvió JSON:', text.slice(0, 200));
            throw new Error('Error del servidor. Comprueba que el servidor esté corriendo y vuelve a intentar.');
        }
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Error en la petición');
        }
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// ==================== AUTENTICACIÓN ====================
export const authAPI = {
    async register(email, password, name, accountType = 'empleado') {
        return apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, name, account_type: accountType }),
        });
    },

    async login(email, password) {
        return apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },

    async logout() {
        return apiRequest('/auth/logout', {
            method: 'POST',
        });
    },

    async verifyEmail(code) {
        return apiRequest('/auth/verify-email', {
            method: 'POST',
            body: JSON.stringify({ code }),
        });
    },

    async resendVerificationCode(email) {
        return apiRequest('/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    },

    /** Solicita envío de código de recuperación al correo. Respuesta genérica. */
    async forgotPassword(email) {
        return apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    },

    /** Verifica código OTP y devuelve reset_token. */
    async verifyResetCode(email, code) {
        return apiRequest('/auth/verify-code', {
            method: 'POST',
            body: JSON.stringify({ email, code }),
        });
    },

    /** Cambia la contraseña con el reset_token obtenido tras verificar el código. */
    async resetPasswordWithToken(email, reset_token, new_password) {
        return apiRequest('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, reset_token, new_password }),
        });
    },

    async checkAuth() {
        return apiRequest('/auth/check', {
            method: 'GET',
        });
    },

    async microsoftConfig() {
        return apiRequest('/auth/microsoft/config', { method: 'GET' });
    },

    /** Si hay registro OAuth pendiente (tras login con Microsoft), devuelve { pending, email, name }. */
    async microsoftPending() {
        return apiRequest('/auth/microsoft/pending', { method: 'GET' });
    },

    /** Completa el registro OAuth con el tipo de cuenta. accountType: 'empleado' | 'empleador'. */
    async microsoftComplete(accountType) {
        return apiRequest('/auth/microsoft/complete', {
            method: 'POST',
            body: JSON.stringify({ account_type: accountType }),
        });
    },

    /** Cancela el registro OAuth pendiente. */
    async microsoftCancelPending() {
        return apiRequest('/auth/microsoft/cancel-pending', { method: 'POST' });
    },
};

// ==================== EMPLEADOS / CANDIDATOS ====================
export const employeesAPI = {
    async getAvailable() {
        return apiRequest('/employees', {
            method: 'GET',
        });
    },

    /** Acepta un candidato. source: 'employee' | 'user' (según lo que devuelve getAvailable) */
    async accept(candidateId, source = 'employee') {
        return apiRequest(`/employees/${candidateId}/accept`, {
            method: 'POST',
            body: JSON.stringify({ source }),
        });
    },

    /** Rechaza un candidato. source: 'employee' | 'user' */
    async reject(candidateId, source = 'employee') {
        return apiRequest(`/employees/${candidateId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ source }),
        });
    },

    /** Elimina un match existente (para undo). source: 'employee' | 'user' */
    async unmatch(candidateId, source = 'employee') {
        return apiRequest(`/employees/${candidateId}/unmatch`, {
            method: 'DELETE',
            body: JSON.stringify({ source }),
        });
    },
};

// ==================== MATCHES ====================
export const matchesAPI = {
    async getAll() {
        return apiRequest('/matches', {
            method: 'GET',
        });
    },

    async contact(targetId, source, subject, message) {
        return apiRequest('/matches/contact', {
            method: 'POST',
            body: JSON.stringify({ targetId, source, subject, message }),
        });
    },
};

// ==================== SOFT SKILLS ====================
export const skillsAPI = {
    async getAllowed() {
        return apiRequest('/skills/allowed', { method: 'GET' });
    },
    async saveSoftSkills(softSkills) {
        return apiRequest('/profile/soft-skills', {
            method: 'POST',
            body: JSON.stringify({ softSkills }),
        });
    },
};

// ==================== PERFIL ====================
export const profileAPI = {
    async get() {
        return apiRequest('/profile', {
            method: 'GET',
        });
    },

    async update(profileData) {
        return apiRequest('/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData),
        });
    },

    async getOnboardingStatus() {
        return apiRequest('/profile/onboarding-status', { method: 'GET' });
    },

    async completeOnboarding(position, experience) {
        return apiRequest('/profile/complete-onboarding', {
            method: 'POST',
            body: JSON.stringify({ position, experience: String(experience) }),
        });
    },

    async uploadPhoto(file) {
        const url = `${API_BASE_URL}/profile/upload-photo`;
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al subir');
        return data;
    },

    async setPrimaryPhoto(slot) {
        return apiRequest('/profile/set-primary-photo', {
            method: 'POST',
            body: JSON.stringify({ slot }),
        });
    },

    async getStats() {
        return apiRequest('/stats', {
            method: 'GET',
        });
    },
};
