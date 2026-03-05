/**
 * Módulo de Autenticación
 */
import { authAPI, profileAPI, skillsAPI } from './api.js';
import { loadEmployees } from './swipe.js';
import { loadMatches } from './matches.js';
import { loadProfile } from './profile.js';

let currentUser = null;
let resendTimer = 60;
let resendTimerInterval = null;

/** Email y token durante el flujo de recuperación de contraseña */
let forgotEmail = '';
let resetToken = '';

// Verificar autenticación al cargar
export async function checkAuthentication() {
    try {
        const response = await authAPI.checkAuth();
        if (response.authenticated) {
            currentUser = response.user;
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

export function getCurrentUser() {
    return currentUser;
}

// Mostrar/ocultar vistas de autenticación
export function showLogin() {
    hideAllAuthViews();
    document.getElementById('login-view').classList.add('active');
}

/** Tipo de cuenta elegido en el flujo de registro: 'empleado' | 'empleador' */
let currentRegisterAccountType = 'empleado';

/** Muestra la pantalla de selección de tipo de cuenta (Empleado / Empleador) */
export function showRegisterType() {
    hideAllAuthViews();
    document.getElementById('register-type-view').classList.add('active');
}

/** Muestra el formulario de registro con el tipo de cuenta seleccionado */
export function showRegisterForm(type) {
    currentRegisterAccountType = type === 'empleador' ? 'empleador' : 'empleado';
    hideAllAuthViews();
    document.getElementById('register-view').classList.add('active');

    const box = document.getElementById('register-account-type-box');
    const emailLabel = document.getElementById('register-email-label');
    const emailInput = document.getElementById('register-email');
    const emailHint = document.getElementById('register-email-hint');

    if (currentRegisterAccountType === 'empleado') {
        box.innerHTML = `
            <div class="account-type-box-content">
                <div class="account-type-box-icon"><i class="fas fa-user-friends"></i></div>
                <div>
                    <strong>Cuenta de Empleado</strong>
                    <p class="account-type-box-note">Correo institucional @tecmilenio.mx requerido</p>
                </div>
            </div>
        `;
        emailLabel.textContent = 'Correo Institucional';
        emailInput.placeholder = 'tu.nombre@tecmilenio.mx';
        emailHint.textContent = 'Usa tu correo institucional @tecmilenio.mx';
        emailHint.style.display = 'block';
    } else {
        box.innerHTML = `
            <div class="account-type-box-content">
                <div class="account-type-box-icon"><i class="fas fa-briefcase"></i></div>
                <div>
                    <strong>Cuenta de Empleador</strong>
                    <p class="account-type-box-note">Cualquier correo corporativo es válido</p>
                </div>
            </div>
        `;
        emailLabel.textContent = 'Correo Electrónico';
        emailInput.placeholder = 'tu.correo@empresa.com';
        emailHint.textContent = 'Usa tu correo corporativo';
        emailHint.style.display = 'block';
    }
    hideError(document.getElementById('register-error'));
}

export function showRegister() {
    showRegisterType();
}

/** Muestra la vista para elegir tipo de cuenta tras OAuth (Microsoft). */
export function showOAuthChooseType(email, name) {
    hideAllAuthViews();
    const view = document.getElementById('oauth-choose-type-view');
    if (view) view.classList.add('active');
    const emailEl = document.getElementById('oauth-pending-email');
    if (emailEl) emailEl.textContent = email || '';
    hideError(document.getElementById('oauth-choose-type-error'));
}

/** Completa el registro OAuth con el tipo elegido. Empleado solo permite @tecmilenio.mx. */
export async function handleOAuthComplete(accountType) {
    const errorDiv = document.getElementById('oauth-choose-type-error');
    hideError(errorDiv);
    try {
        await authAPI.microsoftComplete(accountType);
        window.location.reload();
    } catch (err) {
        showError(errorDiv, err.message || 'No se pudo completar. Intenta de nuevo.');
    }
}

/** Cancela el registro OAuth pendiente y muestra el login. */
export async function cancelOAuthPendingAndShowLogin() {
    try {
        await authAPI.microsoftCancelPending();
    } catch (_) {}
    hideAllAuthViews();
    document.getElementById('login-view').classList.add('active');
}

/** Devuelve true si hay registro OAuth pendiente y se mostró la vista. */
export async function checkOAuthPending() {
    try {
        const data = await authAPI.microsoftPending();
        if (data && data.pending && data.email) {
            showOAuthChooseType(data.email, data.name);
            return true;
        }
    } catch (_) {}
    return false;
}

function resetPasswordRequirements() {
    const box = document.getElementById('password-requirements');
    if (box) box.style.display = 'none';
    ['req-length','req-lower','req-upper','req-number','req-symbol'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('valid');
            el.classList.add('invalid');
        }
    });
}

export function showForgotPassword() {
    hideAllAuthViews();
    document.getElementById('forgot-password-view').classList.add('active');
}

export function showVerifyEmail(email) {
    hideAllAuthViews();
    document.getElementById('verify-email-view').classList.add('active');
    document.getElementById('verify-email-text').textContent = email;
    setupCodeInputs();
    startResendTimer();
}

export async function showSoftSkillsSelection() {
    document.getElementById('auth-container').classList.add('active');
    document.getElementById('app-container').classList.remove('active');
    document.getElementById('welcome-screen').classList.remove('active');
    hideAllAuthViews();
    document.getElementById('soft-skills-view').classList.add('active');
    hideError(document.getElementById('soft-skills-error'));
    await loadAllowedSkillsAndRender();
}

/** Muestra la vista de completar perfil (ocupación + experiencia). */
export function showProfileCompletion() {
    document.getElementById('auth-container').classList.add('active');
    document.getElementById('app-container').classList.remove('active');
    document.getElementById('welcome-screen').classList.remove('active');
    hideAllAuthViews();
    document.getElementById('profile-completion-view').classList.add('active');
    hideError(document.getElementById('profile-completion-error'));
    initOccupationSuggestions();
}

/** Muestra la vista de subir fotos (mín 2). */
export async function showProfilePhotos() {
    document.getElementById('auth-container').classList.add('active');
    document.getElementById('app-container').classList.remove('active');
    document.getElementById('welcome-screen').classList.remove('active');
    hideAllAuthViews();
    document.getElementById('profile-photos-view').classList.add('active');
    hideError(document.getElementById('profile-photos-error'));
    initPhotoSlots();
    try {
        const profile = await profileAPI.get();
        const images = profile.profileImages || (profile.image ? [profile.image] : []);
        images.forEach((url, i) => {
            const slotNum = i + 1;
            const slotEl = document.getElementById(`photo-slot-${slotNum}`);
            if (slotEl) {
                const inner = slotEl.querySelector('.photo-slot-inner');
                if (inner) {
                    inner.innerHTML = `<img src="${url}" alt="Foto ${slotNum}" class="photo-slot-preview">`;
                    inner.classList.add('has-photo');
                }
            }
        });
    } catch (_) {}
    updatePhotosProgress();
}

/** Tras verificar email o al iniciar: muestra el paso de onboarding que corresponda. */
export async function applyOnboardingStep() {
    try {
        const { step } = await profileAPI.getOnboardingStatus();
        if (step === 'profile') {
            showProfileCompletion();
            return;
        }
        if (step === 'photos') {
            showProfilePhotos();
            return;
        }
        if (step === 'soft_skills') {
            await showSoftSkillsSelection();
            return;
        }
        if (step === 'done') {
            const profile = await profileAPI.get();
            if (profile.softSkills && profile.softSkills.length >= 3) {
                await showApp();
            } else {
                await showSoftSkillsSelection();
            }
            return;
        }
        await showSoftSkillsSelection();
    } catch (_) {
        await showSoftSkillsSelection();
    }
}

function initOccupationSuggestions() {
    const input = document.getElementById('profile-occupation');
    const chips = document.querySelectorAll('.suggestion-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const value = chip.dataset.value || chip.textContent;
            if (input) input.value = value;
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
        });
    });
}

let uploadedPhotoCount = 0;

function initPhotoSlots() {
    uploadedPhotoCount = 0;
    const inputs = document.querySelectorAll('.photo-file-input');
    inputs.forEach(input => {
        input.value = '';
        input.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handlePhotoSlotUpload(Number(input.dataset.slot), file);
        };
    });
    document.querySelectorAll('.photo-slot').forEach(slot => {
        const inner = slot.querySelector('.photo-slot-inner');
        const fileInput = slot.querySelector('.photo-file-input');
        if (inner && fileInput) {
            inner.onclick = () => fileInput.click();
        }
    });
    updatePhotosProgress();
}

async function handlePhotoSlotUpload(slotNumber, file) {
    if (file.size > 5 * 1024 * 1024) {
        showError(document.getElementById('profile-photos-error'), 'Tamaño máximo por imagen: 5MB');
        return;
    }
    const errorDiv = document.getElementById('profile-photos-error');
    hideError(errorDiv);
    try {
        await profileAPI.uploadPhoto(file);
        const profile = await profileAPI.get();
        const images = profile.profileImages || (profile.image ? [profile.image] : []);
        [1, 2, 3, 4].forEach((i) => {
            const slotEl = document.getElementById(`photo-slot-${i}`);
            if (!slotEl) return;
            const inner = slotEl.querySelector('.photo-slot-inner');
            if (!inner) return;
            if (images[i - 1]) {
                inner.innerHTML = `<img src="${images[i - 1]}" alt="Foto ${i}" class="photo-slot-preview">`;
                inner.classList.add('has-photo');
            } else {
                inner.innerHTML = `<i class="fas fa-user-circle photo-placeholder-icon"></i><span class="photo-slot-label">${i <= 2 ? 'Requerida' : 'Opcional'}</span><span class="photo-slot-hint">Click para subir</span><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" class="photo-file-input" data-slot="${i}" aria-label="Subir foto ${i}">`;
                inner.classList.remove('has-photo');
                const input = inner.querySelector('.photo-file-input');
                if (input) {
                    input.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) handlePhotoSlotUpload(i, f); };
                    inner.onclick = () => input.click();
                }
            }
        });
        updatePhotosProgress();
    } catch (err) {
        showError(errorDiv, err.message || 'Error al subir la imagen');
    }
}

function updatePhotosProgress() {
    const count = document.querySelectorAll('.photo-slot-inner.has-photo').length;
    const text = document.getElementById('photos-progress-text');
    if (text) text.textContent = `${count} de 2 fotos mínimas`;
    const btn = document.getElementById('profile-photos-finish-btn');
    if (btn) btn.disabled = count < 2;
}

export async function handleProfileCompletion(event) {
    event.preventDefault();
    const position = document.getElementById('profile-occupation').value.trim();
    const experience = document.getElementById('profile-experience-years').value.trim() || '0';
    const errorDiv = document.getElementById('profile-completion-error');
    const submitBtn = document.getElementById('profile-completion-submit');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoader = submitBtn?.querySelector('.btn-loader');
    if (!position) {
        showError(errorDiv, 'Indica tu ocupación');
        return;
    }
    hideError(errorDiv);
    if (btnText) btnText.classList.add('hide');
    if (btnLoader) btnLoader.classList.add('show');
    submitBtn.disabled = true;
    try {
        await profileAPI.completeOnboarding(position, experience);
        showProfilePhotos();
    } catch (err) {
        showError(errorDiv, err.message || 'Error al guardar');
    } finally {
        if (btnText) btnText.classList.remove('hide');
        if (btnLoader) btnLoader.classList.remove('show');
        submitBtn.disabled = false;
    }
}

export function handleFinishProfilePhotos() {
    const count = document.querySelectorAll('.photo-slot-inner.has-photo').length;
    if (count < 2) return;
    showSoftSkillsSelection();
}

function hideAllAuthViews() {
    document.querySelectorAll('.auth-view').forEach(view => {
        view.classList.remove('active');
    });
}

// Manejo de login
export async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    // Validación (en login se acepta cualquier dominio; la restricción @tecmilenio.mx aplica solo a registro de empleado)
    if (!email || !email.includes('@') || !email.split('@')[1].includes('.')) {
        showError(errorDiv, 'Ingresa un correo electrónico válido');
        return;
    }
    if (!password) {
        showError(errorDiv, 'Ingresa tu contraseña');
        return;
    }

    // Mostrar loading
    btnText.classList.add('hide');
    btnLoader.classList.add('show');
    submitBtn.disabled = true;
    hideError(errorDiv);
    
    try {
        const response = await authAPI.login(email, password);
        currentUser = response.user;
        
        if (!currentUser.isEmailVerified) {
            showVerifyEmail(currentUser.email);
        } else {
            await applyOnboardingStep();
        }
    } catch (error) {
        showError(errorDiv, error.message || 'Credenciales incorrectas');
    } finally {
        btnText.classList.remove('hide');
        btnLoader.classList.remove('show');
        submitBtn.disabled = false;
    }
}

// Iniciar flujo de OAuth con Microsoft (Outlook)
export function handleMicrosoftLogin() {
    // Redirige al backend que inicia el flujo OAuth
    window.location.href = '/api/auth/microsoft/login';
}

// Cerrar sesión en Microsoft: limpia sesión local y redirige al logout de Microsoft
export function handleMicrosoftLogout() {
    // Redirige al endpoint que limpia la sesión y llama al logout de MS
    window.location.href = '/api/auth/microsoft/logout';
}

// Manejo de registro
export async function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm').value;
    const errorDiv = document.getElementById('register-error');
    const submitBtn = document.getElementById('register-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    
    // Validación de correo según tipo de cuenta
    if (currentRegisterAccountType === 'empleado') {
        if (!email.endsWith('@tecmilenio.mx')) {
            showError(errorDiv, 'Debes usar tu correo institucional (@tecmilenio.mx)');
            return;
        }
    }
    // Empleador: cualquier dominio permitido en frontend; el backend también lo acepta
    
    const pwdPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$/;
    if (!pwdPattern.test(password)) {
        showError(errorDiv, 'La contraseña debe tener 8-16 caracteres e incluir mayúsculas, minúsculas, números y símbolos');
        return;
    }
    
    if (password !== confirmPassword) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }
    
    // Mostrar loading
    btnText.classList.add('hide');
    btnLoader.classList.add('show');
    submitBtn.disabled = true;
    hideError(errorDiv);
    
    try {
        const response = await authAPI.register(email, password, name, currentRegisterAccountType);
        showVerifyEmail(email);
    } catch (error) {
        showError(errorDiv, error.message || 'Error al crear la cuenta');
    } finally {
        btnText.classList.remove('hide');
        btnLoader.classList.remove('show');
        submitBtn.disabled = false;
    }
}

function updatePasswordRequirements(pwd) {
    const lengthOk = pwd.length >= 8 && pwd.length <= 16;
    const lowerOk = /[a-z]/.test(pwd);
    const upperOk = /[A-Z]/.test(pwd);
    const numberOk = /\d/.test(pwd);
    const symbolOk = /[^\w\s]/.test(pwd);

    const checks = [
        ['req-length', lengthOk],
        ['req-lower', lowerOk],
        ['req-upper', upperOk],
        ['req-number', numberOk],
        ['req-symbol', symbolOk]
    ];

    checks.forEach(([id, ok]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('valid', ok);
        el.classList.toggle('invalid', !ok);
    });
}

function initPasswordHelpers() {
    const pwdInput = document.getElementById('register-password');
    const box = document.getElementById('password-requirements');
    if (!pwdInput || !box) return;

    pwdInput.addEventListener('input', (e) => {
        const v = e.target.value || '';
        updatePasswordRequirements(v);
        box.style.display = v ? 'block' : 'none';
    });

    pwdInput.addEventListener('focus', () => {
        box.style.display = 'block';
    });
}

// Manejo de verificación de email
export async function handleVerifyEmail(event) {
    event.preventDefault();
    
    const container = document.getElementById('code-inputs');
    const codeInputs = container ? container.querySelectorAll('.code-input') : [];
    const code = Array.from(codeInputs).map(input => input.value).join('');
    const errorDiv = document.getElementById('verify-error');
    const submitBtn = document.getElementById('verify-submit');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoader = submitBtn?.querySelector('.btn-loader');
    
    if (code.length !== 6) {
        showError(errorDiv, 'Ingresa el código completo');
        return;
    }
    
    // Mostrar loading
    if (btnText) btnText.classList.add('hide');
    if (btnLoader) btnLoader.classList.add('show');
    if (submitBtn) submitBtn.disabled = true;
    hideError(errorDiv);
    
    try {
        const response = await authAPI.verifyEmail(code);
        currentUser = response.user;
        await applyOnboardingStep();
    } catch (error) {
        showError(errorDiv, error.message || 'Código inválido. Por favor, intenta nuevamente.');
        codeInputs.forEach(input => { input.value = ''; });
        if (codeInputs[0]) codeInputs[0].focus();
    } finally {
        if (btnText) btnText.classList.remove('hide');
        if (btnLoader) btnLoader.classList.remove('show');
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ---- Recuperación de contraseña ----
export function showForgotPasswordBackFromOtp() {
    hideAllAuthViews();
    document.getElementById('forgot-password-view').classList.add('active');
}

export function showForgotOtp(email) {
    forgotEmail = email;
    hideAllAuthViews();
    document.getElementById('forgot-otp-view').classList.add('active');
    const emailEl = document.getElementById('forgot-otp-email');
    if (emailEl) emailEl.textContent = email;
    hideError(document.getElementById('forgot-otp-error'));
    setupForgotCodeInputs();
}

function setupForgotCodeInputs() {
    const container = document.getElementById('forgot-otp-inputs');
    if (!container) return;
    const codeInputs = container.querySelectorAll('.forgot-code-input');
    if (!codeInputs.length) return;
    codeInputs.forEach((input, index) => {
        input.value = '';
        input.oninput = (e) => {
            let value = (e.target.value || '').replace(/\D/g, '');
            if (value.length > 1) value = value.slice(-1);
            e.target.value = value;
            if (value && index < 5) setTimeout(() => codeInputs[index + 1].focus(), 0);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) codeInputs[index - 1].focus();
        };
        input.onpaste = (e) => {
            e.preventDefault();
            const raw = (e.clipboardData && e.clipboardData.getData('text')) || '';
            const digits = raw.replace(/\D/g, '').slice(0, 6);
            const arr = digits.split('');
            codeInputs.forEach((inp, i) => { inp.value = arr[i] || ''; });
            const lastIndex = Math.min(arr.length, 6) - 1;
            if (lastIndex >= 0) setTimeout(() => codeInputs[lastIndex].focus(), 0);
        };
    });
    setTimeout(() => codeInputs[0].focus(), 0);
}

export function showForgotNewPassword() {
    hideAllAuthViews();
    document.getElementById('forgot-new-password-view').classList.add('active');
    hideError(document.getElementById('forgot-new-password-error'));
    document.getElementById('forgot-new-password').value = '';
    document.getElementById('forgot-confirm-password').value = '';
    initForgotPasswordHelpers();
}

function initForgotPasswordHelpers() {
    const pwdInput = document.getElementById('forgot-new-password');
    const box = document.getElementById('forgot-pwd-requirements');
    if (!pwdInput || !box) return;
    pwdInput.addEventListener('input', (e) => {
        const v = e.target.value || '';
        updateForgotPasswordRequirements(v);
        box.style.display = v ? 'block' : 'none';
    });
    pwdInput.addEventListener('focus', () => { box.style.display = 'block'; });
}

function updateForgotPasswordRequirements(pwd) {
    const checks = [
        ['forgot-req-length', pwd.length >= 8 && pwd.length <= 16],
        ['forgot-req-lower', /[a-z]/.test(pwd)],
        ['forgot-req-upper', /[A-Z]/.test(pwd)],
        ['forgot-req-number', /\d/.test(pwd)],
        ['forgot-req-symbol', /[^\w\s]/.test(pwd)]
    ];
    checks.forEach(([id, ok]) => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('valid', ok);
            el.classList.toggle('invalid', !ok);
        }
    });
}

export async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const errorDiv = document.getElementById('forgot-error');
    const submitBtn = document.getElementById('forgot-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    if (!email.endsWith('@tecmilenio.mx')) {
        showError(errorDiv, 'Debes usar tu correo institucional (@tecmilenio.mx)');
        return;
    }

    btnText.classList.add('hide');
    btnLoader.classList.add('show');
    submitBtn.disabled = true;
    hideError(errorDiv);

    try {
        await authAPI.forgotPassword(email);
        showForgotOtp(email);
    } catch (error) {
        showError(errorDiv, error.message || 'Error al enviar. Intenta de nuevo.');
    } finally {
        btnText.classList.remove('hide');
        btnLoader.classList.remove('show');
        submitBtn.disabled = false;
    }
}

export async function handleForgotOtp(event) {
    event.preventDefault();
    const codeInputs = document.querySelectorAll('.forgot-code-input');
    const code = Array.from(codeInputs).map(input => input.value).join('');
    const errorDiv = document.getElementById('forgot-otp-error');
    const submitBtn = document.getElementById('forgot-otp-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    if (code.length !== 6) {
        showError(errorDiv, 'Ingresa el código completo de 6 dígitos');
        return;
    }

    btnText.classList.add('hide');
    btnLoader.classList.add('show');
    submitBtn.disabled = true;
    hideError(errorDiv);

    try {
        const data = await authAPI.verifyResetCode(forgotEmail, code);
        resetToken = data.reset_token;
        showForgotNewPassword();
    } catch (error) {
        showError(errorDiv, error.message || 'Código inválido. Intenta de nuevo.');
        codeInputs.forEach(input => { input.value = ''; });
        if (codeInputs[0]) codeInputs[0].focus();
    } finally {
        btnText.classList.remove('hide');
        btnLoader.classList.remove('show');
        submitBtn.disabled = false;
    }
}

export async function handleResetPasswordSubmit(event) {
    event.preventDefault();
    const newPassword = document.getElementById('forgot-new-password').value;
    const confirmPassword = document.getElementById('forgot-confirm-password').value;
    const errorDiv = document.getElementById('forgot-new-password-error');
    const submitBtn = document.getElementById('forgot-new-password-submit');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');

    const pwdPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,16}$/;
    if (!pwdPattern.test(newPassword)) {
        showError(errorDiv, 'La contraseña debe tener 8-16 caracteres e incluir mayúsculas, minúsculas, números y símbolos');
        return;
    }
    if (newPassword !== confirmPassword) {
        showError(errorDiv, 'Las contraseñas no coinciden');
        return;
    }

    btnText.classList.add('hide');
    btnLoader.classList.add('show');
    submitBtn.disabled = true;
    hideError(errorDiv);

    try {
        await authAPI.resetPasswordWithToken(forgotEmail, resetToken, newPassword);
        const form = document.getElementById('forgot-new-password-form');
        if (form) {
            form.innerHTML = `
                <div style="text-align: center;">
                    <div style="width: 5rem; height: 5rem; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                        <i class="fas fa-check-circle" style="font-size: 2.5rem; color: #10b981;"></i>
                    </div>
                    <h2 style="font-size: 1.5rem; font-weight: bold; color: var(--gray-900); margin-bottom: 0.75rem;">Contraseña actualizada</h2>
                    <p style="color: var(--gray-600); margin-bottom: 2rem;">Ya puedes iniciar sesión con tu nueva contraseña.</p>
                    <button type="button" class="btn-primary full-width" onclick="showLogin()">Ir al inicio de sesión</button>
                </div>
            `;
        }
    } catch (error) {
        showError(errorDiv, error.message || 'Error al cambiar la contraseña.');
    } finally {
        if (btnText) btnText.classList.remove('hide');
        if (btnLoader) btnLoader.classList.remove('show');
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function loadAllowedSkillsAndRender() {
    const container = document.getElementById('soft-skills-container');
    if (!container) return;
    try {
        const data = await skillsAPI.getAllowed();
        const categories = data.categories || data.skills; // Compatibilidad con respuesta antigua
        
        container.innerHTML = '';
        
        if (typeof categories === 'object' && !Array.isArray(categories)) {
            // Mostrar por categorías
            const skillsWrapper = document.createElement('div');
            skillsWrapper.className = 'skills-categories';
            
            Object.entries(categories).forEach(([categoryName, skills]) => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'skills-category';
                
                const categoryTitle = document.createElement('h3');
                categoryTitle.className = 'category-title';
                categoryTitle.textContent = categoryName;
                categoryDiv.appendChild(categoryTitle);
                
                const skillsWrap = document.createElement('div');
                skillsWrap.className = 'skill-tags';
                
                skills.forEach(skillName => {
                    const tag = document.createElement('button');
                    tag.type = 'button';
                    tag.className = 'skill-tag';
                    tag.textContent = skillName;
                    tag.dataset.skill = skillName;
                    tag.addEventListener('click', (e) => {
                        e.preventDefault();
                        tag.classList.toggle('selected');
                        updateSkillsCounter();
                    });
                    skillsWrap.appendChild(tag);
                });
                
                categoryDiv.appendChild(skillsWrap);
                skillsWrapper.appendChild(categoryDiv);
            });
            
            container.appendChild(skillsWrapper);
        } else if (Array.isArray(categories)) {
            // Fallback: mostrar lista simple
            const wrap = document.createElement('div');
            wrap.className = 'skill-tags';
            categories.forEach(skillName => {
                const tag = document.createElement('button');
                tag.type = 'button';
                tag.className = 'skill-tag';
                tag.textContent = skillName;
                tag.dataset.skill = skillName;
                tag.addEventListener('click', (e) => {
                    e.preventDefault();
                    tag.classList.toggle('selected');
                    updateSkillsCounter();
                });
                wrap.appendChild(tag);
            });
            container.appendChild(wrap);
        }
        
        updateSkillsCounter();
    } catch (err) {
        console.error('Error cargando soft skills:', err);
        container.innerHTML = '<p class="error-message">Error al cargar las opciones</p>';
    }
}

function updateSkillsCounter() {
    const container = document.getElementById('soft-skills-container');
    const selectedTags = container ? container.querySelectorAll('.skill-tag.selected') : [];
    const count = selectedTags.length;
    const counterEl = document.getElementById('skills-counter');
    if (counterEl) {
        counterEl.textContent = `${count}/3 seleccionados`;
        counterEl.style.color = count >= 3 ? 'var(--success)' : 'var(--gray-500)';
    }
}

export async function handleSoftSkillsSubmit(event) {
    event.preventDefault();
    const container = document.getElementById('soft-skills-container');
    const selectedTags = container ? container.querySelectorAll('.skill-tag.selected') : [];
    const selected = Array.from(selectedTags).map(t => t.dataset.skill || t.textContent.trim());
    const errorDiv = document.getElementById('soft-skills-error');
    const submitBtn = document.getElementById('soft-skills-submit');
    const btnText = submitBtn?.querySelector('.btn-text');
    const btnLoader = submitBtn?.querySelector('.btn-loader');

    if (selected.length < 3) {
        showError(errorDiv, 'Debes seleccionar al menos 3 soft skills para continuar.');
        return;
    }

    if (submitBtn && btnText && btnLoader) {
        btnText.classList.add('hide');
        btnLoader.classList.add('show');
        submitBtn.disabled = true;
    }
    hideError(errorDiv);

    try {
        await skillsAPI.saveSoftSkills(selected);
        showApp();
    } catch (error) {
        showError(errorDiv, error.message || 'Error al guardar. Intenta de nuevo.');
    } finally {
        if (submitBtn && btnText && btnLoader) {
            btnText.classList.remove('hide');
            btnLoader.classList.remove('show');
            submitBtn.disabled = false;
        }
    }
}

// Configurar inputs de código (solo los del formulario de verificación de email)
function setupCodeInputs() {
    const container = document.getElementById('code-inputs');
    if (!container) return;
    const codeInputs = container.querySelectorAll('.code-input');
    if (!codeInputs.length) return;

    codeInputs.forEach((input, index) => {
        input.value = '';

        input.addEventListener('input', (e) => {
            hideError(document.getElementById('verify-error'));
            let value = (e.target.value || '').replace(/\D/g, '');
            if (value.length > 1) value = value.slice(-1);
            e.target.value = value;
            if (value && index < 5) {
                setTimeout(() => codeInputs[index + 1].focus(), 0);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                codeInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const raw = (e.clipboardData && e.clipboardData.getData('text')) || '';
            const digits = raw.replace(/\D/g, '').slice(0, 6);
            const arr = digits.split('');
            codeInputs.forEach((inp, i) => {
                inp.value = arr[i] || '';
            });
            const lastIndex = Math.min(arr.length, 6) - 1;
            if (lastIndex >= 0) {
                setTimeout(() => codeInputs[lastIndex].focus(), 0);
            }
        });
    });

    setTimeout(() => codeInputs[0].focus(), 0);
}

// Timer para reenvío de código
function startResendTimer() {
    resendTimer = 60;
    const resendBtn = document.getElementById('resend-btn');
    const resendTimerEl = document.getElementById('resend-timer');
    
    if (resendTimerInterval) {
        clearInterval(resendTimerInterval);
    }
    
    resendBtn.style.display = 'none';
    resendTimerEl.style.display = 'block';
    
    resendTimerInterval = setInterval(() => {
        resendTimer--;
        resendTimerEl.textContent = `Reenviar en ${resendTimer}s`;
        
        if (resendTimer <= 0) {
            clearInterval(resendTimerInterval);
            resendBtn.style.display = 'inline-flex';
            resendTimerEl.style.display = 'none';
        }
    }, 1000);
}

export async function resendCode() {
    const emailText = document.getElementById('verify-email-text');
    const email = emailText ? emailText.textContent.trim() : null;
    
    if (!email) {
        console.error('No se pudo obtener el email para reenviar el código');
        return;
    }
    
    const resendBtn = document.getElementById('resend-btn');
    const resendTimerEl = document.getElementById('resend-timer');
    const errorDiv = document.getElementById('verify-error');
    
    // Deshabilitar botón temporalmente
    resendBtn.disabled = true;
    hideError(errorDiv);
    
    try {
        await authAPI.resendVerificationCode(email);
        // Reiniciar timer
        startResendTimer();
    } catch (error) {
        showError(errorDiv, error.message || 'Error al reenviar el código. Por favor, intenta nuevamente.');
        resendBtn.disabled = false;
    }
}

// Logout
export async function logout() {
    try {
        await authAPI.logout();
        currentUser = null;
        showAuth();
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        // Forzar logout local
        currentUser = null;
        showAuth();
    }
}

// Mostrar/ocultar pantallas
export function showAuth() {
    document.getElementById('auth-container').classList.add('active');
    document.getElementById('app-container').classList.remove('active');
    document.getElementById('welcome-screen').classList.remove('active');
    // Asegurar que la vista de login esté activa
    showLogin();
}

export async function showApp() {
    document.getElementById('auth-container').classList.remove('active');
    document.getElementById('app-container').classList.remove('active');
    // Mostrar pantalla de bienvenida primero
    document.getElementById('welcome-screen').classList.add('active');
    
    // Cargar datos de la aplicación cuando el usuario se autentica
    try {
        await Promise.all([
            loadEmployees(),
            loadMatches(),
            loadProfile()
        ]);
    } catch (error) {
        console.error('Error cargando datos de la aplicación:', error);
    }
}

// Funciones auxiliares
function showError(errorDiv, message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError(errorDiv) {
    errorDiv.style.display = 'none';
}

// Toggle password visibility
export function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const toggleBtn = input.parentElement.querySelector('.toggle-password');
    const icon = toggleBtn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }

    // small flip animation for the icon
    if (icon) {
        icon.classList.add('animate');
        setTimeout(() => icon.classList.remove('animate'), 240);
    }
}

// Exportar funciones globales
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleVerifyEmail = handleVerifyEmail;
window.handleForgotPassword = handleForgotPassword;
window.handleForgotOtp = handleForgotOtp;
window.handleResetPasswordSubmit = handleResetPasswordSubmit;
window.showForgotOtp = showForgotOtp;
window.showForgotPasswordBackFromOtp = showForgotPasswordBackFromOtp;
window.showForgotNewPassword = showForgotNewPassword;
window.handleMicrosoftLogin = handleMicrosoftLogin;
window.handleSoftSkillsSubmit = handleSoftSkillsSubmit;
window.showLogin = showLogin;
window.showRegister = showRegister;
window.showRegisterType = showRegisterType;
window.showRegisterForm = showRegisterForm;
window.showForgotPassword = showForgotPassword;
window.handleOAuthComplete = handleOAuthComplete;
window.cancelOAuthPendingAndShowLogin = cancelOAuthPendingAndShowLogin;
window.handleProfileCompletion = handleProfileCompletion;
window.handleFinishProfilePhotos = handleFinishProfilePhotos;
window.showSoftSkillsSelection = showSoftSkillsSelection;
window.resendCode = resendCode;
window.logout = logout;
window.togglePassword = togglePassword;

// Inicializar helpers de contraseña al cargar el módulo
resetPasswordRequirements();
initPasswordHelpers();

// Deshabilitar/mostrar estado del botón Microsoft si OAuth no está configurado
async function configureMicrosoftButton() {
    try {
        const cfg = await authAPI.microsoftConfig();
        const btn = document.getElementById('ms-login-btn');
        if (!btn) return;
        if (!cfg || !cfg.configured) {
            btn.disabled = true;
            btn.title = 'Inicio de sesión con Outlook no configurado en el servidor';
            const label = btn.querySelector('span');
            if (label) label.textContent = 'Outlook (no configurado)';
            btn.classList.add('disabled');
        } else {
            btn.disabled = false;
            btn.title = '';
            const label = btn.querySelector('span');
            if (label) label.textContent = 'Iniciar sesión con Outlook';
            btn.classList.remove('disabled');
        }
    } catch (err) {
        console.warn('No se pudo comprobar Microsoft OAuth:', err);
    }
}

// Ejecutar comprobación al cargar el módulo
configureMicrosoftButton();
