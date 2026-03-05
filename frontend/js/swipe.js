/**
 * Módulo de Swipe
 */
import { employeesAPI } from './api.js';

let employees = [];
let currentIndex = 0;
let currentCard = null;
let startX = 0;
let currentX = 0;
let isDragging = false;
const horizontalSwipeQuery = window.matchMedia ? window.matchMedia('(max-width: 768px) and (pointer: coarse)') : null;
let shouldAnimateUndo = false;
let undoDirection = null;
const swipeHistory = [];

function renderCompatibility(compat) {
    if (!compat) return '';
    const isNA = !!compat.is_na;
    const pct = typeof compat.percentage === 'number' ? Math.max(0, Math.min(100, compat.percentage)) : 0;
    const valueText = isNA ? 'N/A' : `${pct}%`;
    const matches = (compat.skills_match || []).slice(0, 3).join(', ');
    const missing = (compat.skills_missing || []).slice(0, 3).join(', ');

    return `
        <div class="compatibility">
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

function isHorizontalSwipe() {
    return horizontalSwipeQuery ? horizontalSwipeQuery.matches : false;
}

function setUndoState(canUndo) {
    document.querySelectorAll('.undo-btn, .card-undo-btn').forEach(button => {
        button.disabled = !canUndo;
    });
}

export async function loadEmployees() {
    try {
        let fetchedEmployees = await employeesAPI.getAvailable();
        
        // Deduplicar perfiles por ID (por si acaso hay duplicados del backend)
        const seenIds = new Set();
        employees = [];
        for (const emp of fetchedEmployees) {
            if (!seenIds.has(emp.id)) {
                seenIds.add(emp.id);
                employees.push(emp);
            }
        }
        
        currentIndex = 0;
        swipeHistory.length = 0;
        renderSwipeView();
        updateAvailableCount();
        updateSwipeCounter();
    } catch (error) {
        console.error('Error cargando empleados:', error);
        showEmptyState('Error al cargar empleados');
    }
}

function renderSwipeView() {
    const container = document.getElementById('swipe-container');
    
    if (currentIndex >= employees.length) {
        showEmptyState();
        updateAvailableCount();
        updateSwipeCounter();
        setUndoState(swipeHistory.length > 0);
        return;
    }
    
    const employee = employees[currentIndex];
    
    // Limpiar contenedor
    container.innerHTML = '';
    
    // Crear tarjeta
    const card = document.createElement('div');
    card.className = 'swipe-card';
    card.innerHTML = `
        <div class="swipe-card-image">
            <img src="${employee.image}" alt="${employee.name}" onerror="this.src='https://via.placeholder.com/400x600?text=No+Image'">
            <div class="swipe-indicator reject"><i class="fas fa-times"></i></div>
            <div class="swipe-indicator accept"><i class="fas fa-heart"></i></div>
        </div>
        <div class="swipe-card-info">
            <h2>${employee.name}</h2>
            <p class="position">${employee.position}</p>
            <p class="meta">${employee.department} • ${employee.experience}</p>
            ${renderCompatibility(employee.compatibility)}
            <div class="swipe-skills">
                <p class="skills-label">Soft Skills</p>
                <div class="skill-tags">
                    ${employee.softSkills.map(skill => 
                        `<span class="skill-tag">${skill}</span>`
                    ).join('')}
                </div>
            </div>
            <p class="bio">${employee.bio}</p>
        </div>
        <div class="swipe-card-actions">
            <button class="action-btn card-undo-btn" onclick="undoSwipe()" disabled>
                <i class="fas fa-undo"></i>
            </button>
            <button class="action-btn card-reject-btn" onclick="rejectCurrent()">
                <i class="fas fa-times"></i>
            </button>
            <button class="action-btn card-accept-btn" onclick="acceptCurrent()">
                <i class="fas fa-heart"></i>
            </button>
        </div>
    `;
    
    container.appendChild(card);
    currentCard = card;

    if (shouldAnimateUndo) {
        const directionClass = undoDirection ? `swipe-card-undo-${undoDirection}` : 'swipe-card-undo-up';
        card.classList.add(directionClass);
        card.addEventListener('animationend', () => {
            card.classList.remove(directionClass);
        }, { once: true });
        shouldAnimateUndo = false;
        undoDirection = null;
    }

    setUndoState(swipeHistory.length > 0);
    
    // Agregar eventos de drag
    setupDragEvents(card);
    
    // Actualizar contadores
    updateSwipeCounter();
    updateAvailableCount();
}

function setupDragEvents(card) {
    let startY = 0;
    let currentY = 0;
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    const horizontalSwipe = isHorizontalSwipe();

    const clearUndoAnimation = () => {
        if (card.classList.contains('swipe-card-undo-left') ||
            card.classList.contains('swipe-card-undo-right') ||
            card.classList.contains('swipe-card-undo-up') ||
            card.classList.contains('swipe-card-undo-down')) {
            card.classList.remove('swipe-card-undo-left', 'swipe-card-undo-right', 'swipe-card-undo-up', 'swipe-card-undo-down');
            card.style.animation = 'none';
            void card.offsetHeight;
            card.style.animation = '';
        }
    };

    const updateIndicators = (delta, isHorizontal) => {
        const rejectIndicator = card.querySelector('.swipe-indicator.reject');
        const acceptIndicator = card.querySelector('.swipe-indicator.accept');

        if (!rejectIndicator || !acceptIndicator) {
            return;
        }

        if (isHorizontal) {
            if (delta > 30) {
                const intensity = Math.min(1, delta / 120);
                acceptIndicator.style.opacity = intensity;
                acceptIndicator.style.transform = `scale(${0.8 + intensity * 0.4})`;
                rejectIndicator.style.opacity = 0;
                rejectIndicator.style.transform = 'scale(0.8)';
            } else if (delta < -30) {
                const intensity = Math.min(1, Math.abs(delta) / 120);
                rejectIndicator.style.opacity = intensity;
                rejectIndicator.style.transform = `scale(${0.8 + intensity * 0.4})`;
                acceptIndicator.style.opacity = 0;
                acceptIndicator.style.transform = 'scale(0.8)';
            } else {
                rejectIndicator.style.opacity = 0;
                acceptIndicator.style.opacity = 0;
                rejectIndicator.style.transform = 'scale(0.8)';
                acceptIndicator.style.transform = 'scale(0.8)';
            }

            return;
        }

        if (delta > 30) {
            const intensity = Math.min(1, delta / 120);
            rejectIndicator.style.opacity = intensity;
            rejectIndicator.style.transform = `scale(${0.8 + intensity * 0.4})`;
            acceptIndicator.style.opacity = 0;
            acceptIndicator.style.transform = 'scale(0.8)';
        } else if (delta < -30) {
            const intensity = Math.min(1, Math.abs(delta) / 120);
            acceptIndicator.style.opacity = intensity;
            acceptIndicator.style.transform = `scale(${0.8 + intensity * 0.4})`;
            rejectIndicator.style.opacity = 0;
            rejectIndicator.style.transform = 'scale(0.8)';
        } else {
            rejectIndicator.style.opacity = 0;
            acceptIndicator.style.opacity = 0;
            rejectIndicator.style.transform = 'scale(0.8)';
            acceptIndicator.style.transform = 'scale(0.8)';
        }
    };
    
    card.addEventListener('mousedown', (e) => {
        clearUndoAnimation();
        isDragging = true;
        startY = e.clientY;
        card.style.transition = 'none';
    });
    
    card.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        currentY = e.clientY - startY;
        const rotate = currentY * 0.08;
        const opacity = 1 - Math.abs(currentY) / 400;
        
        card.style.transform = `translateY(${currentY}px) rotate(${rotate}deg)`;
        card.style.opacity = Math.max(0.5, opacity);
        
        // Mostrar indicadores con transición suave
        updateIndicators(currentY, false);
    });
    
    card.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        
        card.style.transition = 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s ease';
        
        if (Math.abs(currentY) > 100) {
            if (currentY < 0) {
                // Deslizar hacia arriba = Aceptar
                acceptCurrent();
            } else {
                // Deslizar hacia abajo = Rechazar
                rejectCurrent();
            }
        } else {
            // Reset con animación suave
            card.style.transform = '';
            card.style.opacity = '';
            const indicators = card.querySelectorAll('.swipe-indicator');
            indicators.forEach(ind => {
                ind.style.opacity = 0;
                ind.style.transform = 'scale(0.8)';
            });
        }
    });
    
    card.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            card.style.transition = 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s ease';
            
            if (Math.abs(currentY) > 100) {
                if (currentY < 0) {
                    acceptCurrent();
                } else {
                    rejectCurrent();
                }
            } else {
                card.style.transform = '';
                card.style.opacity = '';
                const indicators = card.querySelectorAll('.swipe-indicator');
                indicators.forEach(ind => {
                    ind.style.opacity = 0;
                    ind.style.transform = 'scale(0.8)';
                });
            }
        }
    });
    
    // Touch events para móviles
    card.addEventListener('touchstart', (e) => {
        clearUndoAnimation();
        isDragging = true;
        startY = e.touches[0].clientY;
        startX = e.touches[0].clientX;
        card.style.transition = 'none';
    });
    
    card.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault();

        if (horizontalSwipe) {
            currentX = e.touches[0].clientX - startX;
            const rotate = currentX * 0.05;
            const opacity = 1 - Math.abs(currentX) / 400;

            card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;
            card.style.opacity = Math.max(0.5, opacity);
            updateIndicators(currentX, true);
        } else {
            currentY = e.touches[0].clientY - startY;
            const rotate = currentY * 0.08;
            const opacity = 1 - Math.abs(currentY) / 400;

            card.style.transform = `translateY(${currentY}px) rotate(${rotate}deg)`;
            card.style.opacity = Math.max(0.5, opacity);
            updateIndicators(currentY, false);
        }
    });
    
    card.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        
        card.style.transition = 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.4s ease';

        if (horizontalSwipe) {
            if (Math.abs(currentX) > 100) {
                if (currentX > 0) {
                    acceptCurrent();
                } else {
                    rejectCurrent();
                }
            } else {
                card.style.transform = '';
                card.style.opacity = '';
                const indicators = card.querySelectorAll('.swipe-indicator');
                indicators.forEach(ind => {
                    ind.style.opacity = 0;
                    ind.style.transform = 'scale(0.8)';
                });
            }
        } else {
            if (Math.abs(currentY) > 100) {
                if (currentY < 0) {
                    acceptCurrent();
                } else {
                    rejectCurrent();
                }
            } else {
                card.style.transform = '';
                card.style.opacity = '';
                const indicators = card.querySelectorAll('.swipe-indicator');
                indicators.forEach(ind => {
                    ind.style.opacity = 0;
                    ind.style.transform = 'scale(0.8)';
                });
            }
        }
    });
}

export async function acceptCurrent() {
    console.log('acceptCurrent - currentIndex:', currentIndex, 'employees.length:', employees.length);
    
    if (currentIndex >= employees.length) {
        console.warn('No hay más empleados para aceptar');
        return;
    }
    
    const employee = employees[currentIndex];
    const source = employee.source || 'employee';
    const direction = isHorizontalSwipe() ? 'right' : 'up';
    
    console.log('acceptCurrent: Aceptando empleado:', employee.id, 'source:', source);
    
    try {
        // Mostrar indicador antes de animar
        if (currentCard) {
            const acceptIndicator = currentCard.querySelector('.swipe-indicator.accept');
            if (acceptIndicator) {
                acceptIndicator.style.opacity = '1';
                acceptIndicator.style.transform = 'scale(1.2)';
            }
        }
        
        // Enviar aceptación al servidor
        console.log('acceptCurrent: Enviando aceptación al servidor...');
        await employeesAPI.accept(employee.id, source);
        console.log('acceptCurrent: Aceptación confirmada por servidor');
        
        // Guardar en historial para undo
        swipeHistory.push({ index: currentIndex, direction, action: 'accept', employeeId: employee.id, source });
        
        // Animar salida en la direccion del swipe
        if (currentCard) {
            currentCard.style.transition = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.5s ease';
            if (direction === 'right') {
                currentCard.style.transform = 'translateX(800px) rotate(10deg) scale(0.8)';
            } else {
                currentCard.style.transform = 'translateY(-800px) rotate(10deg) scale(0.8)';
            }
            currentCard.style.opacity = '0';
        }
        
        // Esperar a que termine la animación y luego recargar
        setTimeout(async () => {
            console.log('acceptCurrent: Animación terminada, actualizando UI...');
            currentIndex++;
            renderSwipeView();
            updateAvailableCount();
            
            // Recargar matches desde el servidor inmediatamente
            try {
                const { forceRefreshMatches } = await import('./matches.js');
                console.log('acceptCurrent: Recargando matches desde servidor...');
                await forceRefreshMatches();
                console.log('acceptCurrent: Matches recargados correctamente');
            } catch (error) {
                console.error('acceptCurrent: Error recargando matches:', error);
            }
        }, 500);
    } catch (error) {
        console.error('acceptCurrent: Error aceptando empleado:', error);
        alert('Error al aceptar empleado: ' + error.message);
    }
}

export async function rejectCurrent() {
    console.log('rejectCurrent - currentIndex:', currentIndex, 'employees.length:', employees.length);
    
    if (currentIndex >= employees.length) {
        console.warn('No hay más empleados para rechazar');
        return;
    }
    
    const employee = employees[currentIndex];
    const source = employee.source || 'employee';
    const direction = isHorizontalSwipe() ? 'left' : 'down';
    
    console.log('rejectCurrent: Rechazando empleado:', employee.id, 'source:', source);
    
    try {
        // Mostrar indicador antes de animar
        if (currentCard) {
            const rejectIndicator = currentCard.querySelector('.swipe-indicator.reject');
            if (rejectIndicator) {
                rejectIndicator.style.opacity = '1';
                rejectIndicator.style.transform = 'scale(1.2)';
            }
        }
        
        // Enviar rechazo al servidor
        console.log('rejectCurrent: Enviando rechazo al servidor...');
        await employeesAPI.reject(employee.id, source);
        console.log('rejectCurrent: Rechazo confirmado por servidor');
        
        // Guardar en historial para undo
        swipeHistory.push({ index: currentIndex, direction, action: 'reject', employeeId: employee.id, source });
        
        // Animar salida en la direccion del swipe
        if (currentCard) {
            currentCard.style.transition = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.5s ease';
            if (direction === 'left') {
                currentCard.style.transform = 'translateX(-800px) rotate(-10deg) scale(0.8)';
            } else {
                currentCard.style.transform = 'translateY(800px) rotate(-10deg) scale(0.8)';
            }
            currentCard.style.opacity = '0';
        }
        
        // Esperar a que termine la animación y luego recargar
        setTimeout(async () => {
            console.log('rejectCurrent: Animación terminada, actualizando UI...');
            currentIndex++;
            renderSwipeView();
            updateAvailableCount();
            
            // Recargar matches desde el servidor (para actualizar si el usuario estaba en matches)
            try {
                const { forceRefreshMatches } = await import('./matches.js');
                console.log('rejectCurrent: Recargando matches desde servidor...');
                await forceRefreshMatches();
                console.log('rejectCurrent: Matches recargados correctamente');
            } catch (error) {
                console.error('rejectCurrent: Error recargando matches:', error);
            }
        }, 500);
    } catch (error) {
        console.error('rejectCurrent: Error rechazando empleado:', error);
        alert('Error al rechazar empleado: ' + error.message);
    }
}

export async function undoSwipe() {
    console.log('undoSwipe - currentIndex:', currentIndex, 'historyLength:', swipeHistory.length);
    
    if (swipeHistory.length > 0) {
        const entry = swipeHistory.pop();
        currentIndex = entry.index;
        console.log('undoSwipe: Volviendo al empleado:', currentIndex, 'Revirtiendo acción:', entry.action);
        
        // Revertir la acción en el servidor
        try {
            if (entry.action === 'accept') {
                // Si fue aceptado, eliminarlo de matches
                console.log('undoSwipe: Eliminando match del servidor (employee_id:', entry.employeeId, 'source:', entry.source, ')');
                await employeesAPI.unmatch(entry.employeeId, entry.source);
                console.log('undoSwipe: Match eliminado exitosamente');
            } else if (entry.action === 'reject') {
                // Si fue rechazado, no necesitamos hacer nada en el servidor
                // porque el rechazo se mantiene (no afecta a matches)
                console.log('undoSwipe: Fue un rechazo, no hay cambios en matches');
            }
            
            // Recargar matches después de revertir
            try {
                const { forceRefreshMatches } = await import('./matches.js');
                console.log('undoSwipe: Recargando matches desde servidor...');
                await forceRefreshMatches();
                console.log('undoSwipe: Matches recargados correctamente');
            } catch (error) {
                console.error('undoSwipe: Error recargando matches:', error);
            }
        } catch (error) {
            console.error('undoSwipe: Error revirtiendo acción:', error);
            alert('Error al deshacer: ' + error.message);
            // Restaurar el historial si hay error
            swipeHistory.push(entry);
            return;
        }
        
        shouldAnimateUndo = true;
        undoDirection = entry.direction;
        renderSwipeView();
    } else {
        console.warn('undoSwipe: No hay más empleados anteriores para mostrar');
    }
}

function showEmptyState(message) {
    const container = document.getElementById('swipe-container');
    container.innerHTML = `
        <div class="swipe-empty">
            <div class="swipe-empty-icon">
                <i class="fas fa-heart"></i>
            </div>
            <h2>${message || '¡Has revisado todos los perfiles!'}</h2>
            <p>${message ? '' : 'No hay más empleados por revisar en este momento.'}</p>
            ${!message ? `<button class="btn-primary" onclick="window.reloadEmployees()">Volver a empezar</button>` : ''}
        </div>
    `;
    setUndoState(swipeHistory.length > 0);
}

function updateSwipeCounter() {
    const counter = document.getElementById('swipe-counter-text');
    counter.textContent = `${currentIndex + 1} / ${employees.length}`;
}

function updateAvailableCount() {
    const count = employees.length - currentIndex;
    const counter = document.getElementById('available-count');
    counter.textContent = `${count} candidatos disponibles`;
}

function updateMatchesCount() {
    if (window.updateMatchesBadge) {
        window.updateMatchesBadge();
    }
}

// Exportar funciones globales
window.acceptCurrent = acceptCurrent;
window.rejectCurrent = rejectCurrent;
window.undoSwipe = undoSwipe;
window.reloadEmployees = loadEmployees;
