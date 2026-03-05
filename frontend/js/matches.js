/**
 * Módulo de Matches
 */
import { matchesAPI } from './api.js';

let matches = [];

function renderCompatibility(compat) {
    if (!compat) return '';
    const isNA = !!compat.is_na;
    const pct = typeof compat.percentage === 'number' ? Math.max(0, Math.min(100, compat.percentage)) : 0;
    const valueText = isNA ? 'N/A' : `${pct}%`;
    const matches = (compat.skills_match || []).slice(0, 3).join(', ');
    const missing = (compat.skills_missing || []).slice(0, 3).join(', ');

    return `
        <div class="compatibility compact">
            <div class="compatibility-header">
                <span class="compatibility-label">Compatibilidad</span>
                <span class="compatibility-value">${valueText}</span>
            </div>
            <div class="compatibility-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${isNA ? 0 : pct}">
                <div class="compatibility-meter-fill ${isNA ? 'is-na' : ''}" style="width: ${isNA ? 0 : pct}%"></div>
            </div>
            ${isNA ? '' : `
                <div class="compatibility-details">
                    <span><strong>Coinciden:</strong> ${matches || '—'}</span>
                    <span><strong>Faltan:</strong> ${missing || '—'}</span>
                </div>
            `}
        </div>
    `;
}

export async function loadMatches() {
    try {
        console.log('loadMatches: Cargando matches desde API...');
        matches = await matchesAPI.getAll();
        console.log('loadMatches: Matches obtenidos:', matches.length);
        renderMatches();
        updateMatchesBadge();
    } catch (error) {
        console.error('Error cargando matches:', error);
        showEmptyState('Error al cargar matches');
    }
}

function renderMatches() {
    const grid = document.getElementById('matches-grid');
    const countEl = document.getElementById('matches-count');
    
    console.log('renderMatches: grid existe?', !!grid, 'countEl existe?', !!countEl);
    
    if (!grid || !countEl) {
        console.error('No se encontraron los elementos del DOM para matches');
        console.log('Grid ID:', grid?.id || 'NO ENCONTRADO');
        console.log('CountEl ID:', countEl?.id || 'NO ENCONTRADO');
        return;
    }
    
    countEl.textContent = `${matches.length} matches encontrados`;
    console.log('renderMatches: Renderizando', matches.length, 'matches');
    
    if (matches.length === 0) {
        showEmptyState();
        return;
    }
    
    grid.innerHTML = matches.map((employee, index) => `
        <div class="match-card" style="--reveal-delay: ${index * 70}ms;">
            <div class="match-card-image">
                <img src="${employee.image}" alt="${employee.name}" onerror="this.src='https://via.placeholder.com/400x600?text=No+Image'">
                <div class="match-badge">
                    <i class="fas fa-heart"></i>
                </div>
            </div>
            <div class="match-card-content">
                <div class="match-card-body">
                    <h3>${employee.name}</h3>
                    <div class="match-card-meta">
                        <i class="fas fa-briefcase"></i>
                        <span>${employee.position}</span>
                    </div>
                    ${renderCompatibility(employee.compatibility)}
                    <div class="swipe-skills">
                        <p class="skills-label">Soft Skills</p>
                        <div class="skill-tags">
                            ${employee.softSkills.slice(0, 3).map(skill => 
                                `<span class="skill-tag">${skill}</span>`
                            ).join('')}
                        </div>
                    </div>
                    <p class="bio match-card-bio">
                        ${employee.bio}
                    </p>
                </div>
                <div class="match-card-actions">
                    <button class="btn-contact" onclick="contactEmployee(${employee.id}, '${employee.source || 'user'}')">
                        <i class="fas fa-envelope"></i>
                        <span>Contactar</span>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    console.log('renderMatches: Matches renderizados correctamente');
}

export function getMatches() {
    return matches;
}

export function removeMatchById(employeeId) {
    const initialLength = matches.length;
    matches = matches.filter(emp => emp.id !== employeeId);
    console.log('removeMatchById:', employeeId, '- Removido. Antes:', initialLength, 'Después:', matches.length);
    renderMatches();
    updateMatchesBadge();
}

export async function forceRefreshMatches() {
    console.log('forceRefreshMatches: Forzando recarga de matches...');
    await loadMatches();
}

function showEmptyState(message) {
    const grid = document.getElementById('matches-grid');
    const countEl = document.getElementById('matches-count');
    
    if (!grid) {
        console.error('No se encontró el elemento matches-grid');
        return;
    }
    
    if (countEl) {
        countEl.textContent = '0 matches encontrados';
    }
    
    grid.innerHTML = `
        <div class="matches-empty" style="grid-column: 1 / -1;">
            <div class="matches-empty-icon">
                <i class="fas fa-heart"></i>
            </div>
            <h2>${message || 'Aún no tienes matches'}</h2>
            <p>${message ? '' : 'Comienza a revisar perfiles para encontrar empleados aptos para tu equipo.'}</p>
        </div>
    `;
}

export function updateMatchesBadge() {
    const badge = document.getElementById('matches-badge');
    if (matches.length > 0) {
        badge.textContent = matches.length > 9 ? '9+' : matches.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

export function getMatchesCount() {
    return matches.length;
}

// ==================== CONTACTO POR CORREO ====================
let currentContact = null;
let contactModalInitialized = false;

function ensureContactModal() {
    if (contactModalInitialized) return;
    const modal = document.getElementById('contact-modal');
    if (!modal) return;

    const backdrop = document.getElementById('contact-modal-backdrop');
    const closeBtn = document.getElementById('contact-modal-close');
    const cancelBtn = document.getElementById('contact-modal-cancel');
    const sendBtn = document.getElementById('contact-modal-send');

    const close = () => {
        modal.classList.remove('contact-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        currentContact = null;
    };

    backdrop && (backdrop.onclick = close);
    closeBtn && (closeBtn.onclick = close);
    cancelBtn && (cancelBtn.onclick = close);
    sendBtn && (sendBtn.onclick = sendContactMessage);

    contactModalInitialized = true;
}

function openContactModal(employee) {
    ensureContactModal();
    const modal = document.getElementById('contact-modal');
    if (!modal || !employee) return;

    currentContact = employee;

    const nameEl = document.getElementById('contact-name');
    const positionEl = document.getElementById('contact-position');
    const avatarEl = document.getElementById('contact-avatar');
    const subjectInput = document.getElementById('contact-subject');
    const messageInput = document.getElementById('contact-message');
    const infoEmailEl = document.getElementById('contact-email-info');
    const errorEl = document.getElementById('contact-error');

    if (nameEl) nameEl.textContent = employee.name || '';
    if (positionEl) positionEl.textContent = employee.position || '';
    if (avatarEl) {
        avatarEl.src = employee.image || 'https://via.placeholder.com/80?text=?';
        avatarEl.alt = employee.name || 'Foto de perfil';
    }
    if (subjectInput) subjectInput.value = '';
    if (messageInput) messageInput.value = '';
    if (errorEl) errorEl.textContent = '';

    // Mensaje informativo (solo texto; el backend decide el correo real)
    if (infoEmailEl) {
        infoEmailEl.textContent = 'El mensaje será enviado al correo institucional del empleado.';
    }

    modal.classList.add('contact-modal-open');
    modal.setAttribute('aria-hidden', 'false');

    subjectInput && subjectInput.focus();
}

async function sendContactMessage() {
    const subjectInput = document.getElementById('contact-subject');
    const messageInput = document.getElementById('contact-message');
    const errorEl = document.getElementById('contact-error');

    if (!currentContact || !subjectInput || !messageInput) return;

    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();

    if (!subject || !message) {
        if (errorEl) {
            errorEl.textContent = 'Escribe un asunto y un mensaje antes de enviar.';
        } else {
            alert('Escribe un asunto y un mensaje antes de enviar.');
        }
        return;
    }

    try {
        await matchesAPI.contact(currentContact.id, currentContact.source || 'user', subject, message);
        if (errorEl) errorEl.textContent = '';
        const modal = document.getElementById('contact-modal');
        if (modal) {
            modal.classList.remove('contact-modal-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        currentContact = null;
    } catch (err) {
        console.error('Error enviando mensaje de contacto:', err);
        if (errorEl) {
            errorEl.textContent = err.message || 'No se pudo enviar el mensaje. Intenta de nuevo.';
        } else {
            alert(err.message || 'No se pudo enviar el mensaje. Intenta de nuevo.');
        }
    }
}

function contactEmployee(employeeId, source = 'user') {
    const employee = matches.find(m => m.id === employeeId && (m.source || 'user') === source);
    if (!employee) {
        alert('No se encontró la información del match seleccionado.');
        return;
    }
    openContactModal(employee);
}

// Exportar funciones globales
window.contactEmployee = contactEmployee;
window.updateMatchesBadge = updateMatchesBadge;
