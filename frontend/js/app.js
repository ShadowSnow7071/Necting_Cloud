/**
 * Aplicación Principal
 */
import { checkAuthentication, showAuth, showApp, showSoftSkillsSelection, showProfileCompletion, showProfilePhotos, checkOAuthPending } from './auth.js';
import { profileAPI } from './api.js';
import { loadEmployees } from './swipe.js';
import { loadMatches, updateMatchesBadge } from './matches.js';
import { loadProfile } from './profile.js';

let currentView = 'swipe';

export function getCurrentView() {
    return currentView;
}

// Inicializar aplicación
export async function initApp() {
    const isAuthenticated = await checkAuthentication();

    if (!isAuthenticated) {
        const oauthPending = await checkOAuthPending();
        if (!oauthPending) showAuth();
        return;
    }

    try {
        const status = await profileAPI.getOnboardingStatus();
        if (status.step === 'profile') {
            showProfileCompletion();
            return;
        }
        if (status.step === 'photos') {
            showProfilePhotos();
            return;
        }
        if (status.step === 'soft_skills') {
            await showSoftSkillsSelection();
            return;
        }
        const profile = await profileAPI.get();
        if (!profile.softSkills || profile.softSkills.length < 3) {
            await showSoftSkillsSelection();
            return;
        }
    } catch (_) {
        await showSoftSkillsSelection();
        return;
    }

    await Promise.all([
        loadEmployees(),
        loadMatches(),
        loadProfile()
    ]);

    showApp();
}

// Cambiar vista
export async function switchView(view) {
    try {
        console.log('switchView: Cambiando a vista:', view);
        currentView = view;
        
        // Verificar que el app-container esté activo
        const appContainer = document.getElementById('app-container');
        if (!appContainer || !appContainer.classList.contains('active')) {
            console.warn('El app-container no está activo, activándolo...');
            appContainer.classList.add('active');
            document.getElementById('welcome-screen').classList.remove('active');
            document.getElementById('auth-container').classList.remove('active');
        }
        
        // Actualizar navegación
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Ocultar todas las vistas
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        
        // Activar vista seleccionada en la navegación
        const navItem = Array.from(document.querySelectorAll('.nav-item')).find(item => {
            const onclick = item.getAttribute('onclick');
            return onclick && onclick.includes(`'${view}'`);
        });
        
        if (navItem) {
            navItem.classList.add('active');
        } else {
            console.warn(`No se encontró el elemento de navegación para: ${view}`);
        }
        
        // Activar la vista correspondiente
        const viewElement = document.getElementById(`${view}-view`);
        if (viewElement) {
            viewElement.classList.add('active');
            console.log(`Vista ${view} activada correctamente`);
        } else {
            console.error(`No se encontró el elemento de vista: ${view}-view`);
            return;
        }
        
        // Cargar datos si es necesario
        if (view === 'swipe') {
            console.log('switchView: Reinitiando carga de empleados para recalcular compatibilidad...');
            await loadEmployees();
        } else if (view === 'matches') {
            console.log('switchView: Reinitiando carga de matches desde servidor...');
            await loadMatches();
            console.log('switchView: Matches cargados correctamente');
        } else if (view === 'profile') {
            console.log('switchView: Cargando perfil...');
            await loadProfile();
        }
    } catch (error) {
        console.error('Error cambiando de vista:', error);
    }
}

// Ocultar pantalla de bienvenida y mostrar la app
export function hideWelcome() {
    document.getElementById('welcome-screen').classList.remove('active');
    document.getElementById('app-container').classList.add('active');
    // Asegurar que la vista de swipe esté activa
    switchView('swipe');
}

// Toggle tema
export function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Actualizar iconos del tema
    const icons = document.querySelectorAll('#theme-icon, #theme-icon-auth');
    icons.forEach(icon => {
        icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
    
    // Actualizar logos
    const logoLights = document.querySelectorAll('.logo-img.logo-light');
    const logoDarks = document.querySelectorAll('.logo-img.logo-dark');
    
    if (newTheme === 'dark') {
        logoLights.forEach(logo => logo.style.display = 'none');
        logoDarks.forEach(logo => logo.style.display = 'block');
    } else {
        logoLights.forEach(logo => logo.style.display = 'block');
        logoDarks.forEach(logo => logo.style.display = 'none');
    }
}

// Cargar tema guardado
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icons = document.querySelectorAll('#theme-icon, #theme-icon-auth');
    icons.forEach(icon => {
        icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    });
    
    // Cargar logos según el tema
    const logoLights = document.querySelectorAll('.logo-img.logo-light');
    const logoDarks = document.querySelectorAll('.logo-img.logo-dark');
    
    if (savedTheme === 'dark') {
        logoLights.forEach(logo => logo.style.display = 'none');
        logoDarks.forEach(logo => logo.style.display = 'block');
    } else {
        logoLights.forEach(logo => logo.style.display = 'block');
        logoDarks.forEach(logo => logo.style.display = 'none');
    }
}

// Exportar funciones globales
window.switchView = switchView;
window.hideWelcome = hideWelcome;
window.toggleTheme = toggleTheme;
window.initApp = initApp;

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    initApp();
});
