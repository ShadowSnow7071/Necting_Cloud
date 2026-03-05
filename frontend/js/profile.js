/**
 * Módulo de Perfil
 */
import { profileAPI, skillsAPI } from './api.js';
import { getCurrentUser } from './auth.js';

let profileData = null;
let isEditing = false;
let originalProfile = null;

export async function loadProfile() {
    try {
        profileData = await profileAPI.get();
        renderProfile();
    } catch (error) {
        // Si el error es 401 (no autenticado), no mostrar error en consola
        // porque es esperado cuando el usuario no ha iniciado sesión
        if (error.message && error.message.includes('No autenticado')) {
            return;
        }
        console.error('Error cargando perfil:', error);
    }
}

function formatExperience(value) {
    if (value == null || value === '') return '';
    const s = String(value).trim();
    if (/^\d+$/.test(s)) return s + ' años';
    return s;
}

function parseExperienceYears(value) {
    if (value == null || value === '') return '';
    const s = String(value).trim();
    const n = parseInt(s, 10);
    if (!isNaN(n) && n >= 0) return String(n);
    return s.replace(/\s*años?\s*$/i, '').trim() || s;
}

function renderProfile() {
    if (!profileData) return;
    
    const user = getCurrentUser();
    
    const emailBadge = document.getElementById('user-email-badge');
    if (user && emailBadge) {
        emailBadge.innerHTML = `<p><strong>Email:</strong> ${user.email}</p>`;
        emailBadge.style.display = 'block';
    }
    
    const profileImage = document.getElementById('profile-image');
    if (profileImage) {
        profileImage.src = profileData.image || 'https://via.placeholder.com/200?text=No+Image';
        const pos = profileData.avatarPosition || '50% 50%';
        profileImage.style.objectPosition = pos.includes('%') ? pos : `${pos.replace(/\s+/, ' ').split(' ')[0] || 50}% ${(pos.split(' ')[1] || 50)}%`;
    }
    
    const nameEl = document.getElementById('profile-name');
    const positionEl = document.getElementById('profile-position');
    const experienceEl = document.getElementById('profile-experience');
    const bioEl = document.getElementById('profile-bio');
    
    if (nameEl) nameEl.textContent = profileData.name || '';
    if (positionEl) positionEl.textContent = profileData.position || '';
    if (experienceEl) experienceEl.textContent = formatExperience(profileData.experience);
    if (bioEl) bioEl.textContent = profileData.bio || '';
    
    renderSkills(profileData.softSkills || []);
    updateStats();
}

function renderSkills(skills) {
    const container = document.getElementById('profile-skills');
    container.innerHTML = skills.map((skill, index) => `
        <span class="skill-item">
            ${skill}
            ${isEditing ? `<button class="remove-skill" onclick="removeSkill(${index})">
                <i class="fas fa-times"></i>
            </button>` : ''}
        </span>
    `).join('');
}

export function toggleEditProfile() {
    isEditing = !isEditing;
    
    if (isEditing) {
        originalProfile = { ...profileData };
        showEditFields();
    } else {
        hideEditFields();
    }
}

const SLOT_KEYS = ['image_url', 'image_url_2', 'image_url_3', 'image_url_4'];
let encuadreListenersAdded = false;

async function openAvatarModal() {
    const modal = document.getElementById('avatar-edit-modal');
    if (!modal) return;
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    modal.setAttribute('data-modal-theme', theme);
    try {
        profileData = await profileAPI.get();
    } catch (e) {
        console.error('Error al cargar perfil:', e);
    }
    renderPhotoThumbnails();
    renderUploadMore();
    initEncuadre();
    modal.classList.add('avatar-modal-open');
    modal.setAttribute('aria-hidden', 'false');

    document.getElementById('avatar-modal-backdrop').onclick = closeAvatarModal;
    document.getElementById('avatar-modal-cancel').onclick = closeAvatarModal;
    document.getElementById('avatar-modal-save').onclick = saveAvatarAndCloseModal;
}

function closeAvatarModal() {
    const modal = document.getElementById('avatar-edit-modal');
    if (!modal) return;
    modal.classList.remove('avatar-modal-open');
    modal.setAttribute('aria-hidden', 'true');
}

async function saveAvatarAndCloseModal() {
    try {
        await profileAPI.update({
            image: profileData.image || '',
            avatarPosition: profileData.avatarPosition || '50% 50%',
            position: profileData.position || '',
            experience: profileData.experience || '',
            bio: profileData.bio || ''
        });
        const profileImage = document.getElementById('profile-image');
        if (profileImage) {
            profileImage.src = profileData.image || profileImage.src;
            profileImage.style.objectPosition = profileData.avatarPosition || '50% 50%';
        }
        closeAvatarModal();
    } catch (e) {
        console.error(e);
        alert('No se pudo guardar el encuadre.');
    }
}

function showEditFields() {
    document.getElementById('edit-profile-btn').style.display = 'none';
    document.getElementById('edit-actions').style.display = 'flex';
    document.getElementById('edit-image-btn').style.display = 'block';

    const fields = ['name', 'position', 'experience', 'bio'];
    fields.forEach(field => {
        const display = document.getElementById(`profile-${field}`);
        const input = document.getElementById(`edit-${field}`);
        if (display && input) {
            display.style.display = 'none';
            input.style.display = 'block';
            if (field === 'experience') {
                input.value = parseExperienceYears(profileData[field]);
            } else {
                input.value = profileData[field] || '';
            }
        }
    });

    document.getElementById('add-skill-container').style.display = 'flex';
    renderSkills(profileData.softSkills || []);

    // Clic en la imagen o en el botón de editar abre el modal (no se muestra el editor inline)
    const editBtn = document.getElementById('edit-image-btn');
    const clickArea = document.getElementById('profile-image-click-area');
    if (clickArea) clickArea.classList.add('profile-image-editable');
    if (editBtn) {
        editBtn.onclick = (e) => { e.stopPropagation(); openAvatarModal(); };
    }
    if (clickArea) {
        clickArea.onclick = () => { if (isEditing) openAvatarModal(); };
    }
}

function renderPhotoThumbnails() {
    const container = document.getElementById('profile-photos-thumbnails');
    if (!container || !profileData) return;
    const images = profileData.profileImages || [];
    const mainUrl = (profileData.image || '').trim();
    container.innerHTML = '';
    if (images.length === 0) {
        container.innerHTML = '<p class="profile-no-photos-hint">Aún no tienes fotos. Sube al menos una abajo.</p>';
        return;
    }
    images.forEach((url, index) => {
        if (!url || typeof url !== 'string') return;
        const slot = SLOT_KEYS[index] || SLOT_KEYS[0];
        const isMain = url.trim() === mainUrl;
        const div = document.createElement('div');
        div.className = 'profile-thumb' + (isMain ? ' profile-thumb-main' : '');
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        div.innerHTML = `<img src="${esc(url)}" alt="Foto ${index + 1}" loading="lazy" onerror="this.style.background='#e5e7eb';this.alt='Error al cargar';"><span class="thumb-label">${isMain ? 'Principal' : 'Usar como principal'}</span>`;
        if (!isMain) {
            div.addEventListener('click', () => setPrimaryPhoto(slot));
        }
        container.appendChild(div);
    });
}

async function setPrimaryPhoto(slot) {
    try {
        await profileAPI.setPrimaryPhoto(slot);
        profileData = await profileAPI.get();
        renderPhotoThumbnails();
        const profileImage = document.getElementById('profile-image');
        if (profileImage) {
            profileImage.src = profileData.image || profileImage.src;
            profileImage.style.objectPosition = profileData.avatarPosition || '50% 50%';
        }
        const modalPreview = document.getElementById('profile-encuadre-preview');
        if (modalPreview) {
            modalPreview.src = profileData.image || '';
            modalPreview.style.objectPosition = profileData.avatarPosition || '50% 50%';
        }
    } catch (e) {
        console.error(e);
        alert('No se pudo cambiar la foto principal.');
    }
}

function renderUploadMore() {
    const container = document.getElementById('profile-upload-more');
    if (!container || !profileData) return;
    const images = profileData.profileImages || [];
    const count = images.length;
    if (count >= 4) {
        container.innerHTML = '';
        return;
    }
    const canAdd = Math.min(2, 4 - count);
    container.innerHTML = `<label>Subir ${canAdd} más</label><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" id="profile-extra-photo" style="display:block; margin-top:4px;">`;
    const input = document.getElementById('profile-extra-photo');
    if (input) {
        input.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                alert('Máximo 5MB por imagen');
                return;
            }
            try {
                await profileAPI.uploadPhoto(file);
                const updated = await profileAPI.get();
                profileData.profileImages = updated.profileImages || [];
                profileData.image = updated.image;
                renderPhotoThumbnails();
                renderUploadMore();
            } catch (err) {
                alert(err.message || 'Error al subir');
            }
            input.value = '';
        };
    }
}

function initEncuadre() {
    const pos = profileData.avatarPosition || '50% 50%';
    const parts = pos.replace(/%/g, '').split(/\s+/);
    let x = 50, y = 50;
    if (parts.length >= 2) {
        x = Math.min(100, Math.max(0, parseInt(parts[0], 10) || 50));
        y = Math.min(100, Math.max(0, parseInt(parts[1], 10) || 50));
    }
    const xSlider = document.getElementById('encuadre-x');
    const ySlider = document.getElementById('encuadre-y');
    const xValue = document.getElementById('encuadre-x-value');
    const yValue = document.getElementById('encuadre-y-value');
    const preview = document.getElementById('profile-encuadre-preview');
    const mainImg = document.getElementById('profile-image');
    if (xSlider) xSlider.value = x;
    if (ySlider) ySlider.value = y;
    if (xValue) xValue.textContent = x;
    if (yValue) yValue.textContent = y;
    const applyPos = (px, py) => {
        const posStr = `${px}% ${py}%`;
        if (preview) {
            preview.style.objectPosition = posStr;
            preview.src = profileData.image || mainImg?.src || '';
        }
        if (mainImg) mainImg.style.objectPosition = posStr;
        profileData.avatarPosition = posStr;
    };
    applyPos(x, y);
    if (preview && profileData.image) preview.src = profileData.image;

    if (encuadreListenersAdded) return;
    encuadreListenersAdded = true;
    xSlider?.addEventListener('input', () => {
        const v = parseInt(xSlider.value, 10);
        if (xValue) xValue.textContent = v;
        applyPos(v, parseInt(ySlider?.value || 50, 10));
    });
    ySlider?.addEventListener('input', () => {
        const v = parseInt(ySlider.value, 10);
        if (yValue) yValue.textContent = v;
        applyPos(parseInt(xSlider?.value || 50, 10), v);
    });
}

function hideEditFields() {
    document.getElementById('edit-profile-btn').style.display = 'block';
    document.getElementById('edit-actions').style.display = 'none';
    document.getElementById('edit-image-btn').style.display = 'none';
    const clickArea = document.getElementById('profile-image-click-area');
    if (clickArea) clickArea.classList.remove('profile-image-editable');
    closeAvatarModal();
    
    // Ocultar inputs
    const fields = ['name', 'position', 'experience', 'bio'];
    fields.forEach(field => {
        const display = document.getElementById(`profile-${field}`);
        const input = document.getElementById(`edit-${field}`);
        if (display && input) {
            display.style.display = 'block';
            input.style.display = 'none';
        }
    });
    
    // Ocultar contenedor de agregar skill y el picker
    document.getElementById('add-skill-container').style.display = 'none';
    const picker = document.getElementById('profile-skills-picker');
    if (picker) picker.style.display = 'none';
    
    // Re-renderizar skills sin botones de eliminar
    renderSkills(profileData.softSkills || []);
}

export function cancelEdit() {
    if (originalProfile) {
        profileData = { ...originalProfile };
        renderProfile();
    }
    isEditing = false;
    hideEditFields();
}

export async function saveProfile() {
    let exp = document.getElementById('edit-experience').value.trim();
    if (/^\d+$/.test(exp)) exp = exp ? exp + ' años' : '';
    const updatedProfile = {
        name: document.getElementById('edit-name').value,
        position: document.getElementById('edit-position').value,
        experience: exp,
        bio: document.getElementById('edit-bio').value,
        image: profileData.image || '',
        avatarPosition: profileData.avatarPosition || '50% 50%',
        softSkills: profileData.softSkills || []
    };
    
    try {
        await profileAPI.update(updatedProfile);
        profileData = updatedProfile;
        isEditing = false;
        hideEditFields();
        renderProfile();
        alert('Perfil actualizado exitosamente');
    } catch (error) {
        console.error('Error guardando perfil:', error);
        alert('Error al guardar perfil: ' + (error.message || 'Error desconocido'));
    }
}

export async function openSoftSkillsPicker() {
    if (!profileData) return;
    const current = profileData.softSkills || [];
    if (current.length >= 8) {
        alert('Máximo 8 habilidades. Elimina alguna para agregar más.');
        return;
    }
    const picker = document.getElementById('profile-skills-picker');
    const listEl = document.getElementById('profile-skills-picker-list');
    if (!picker || !listEl) return;
    try {
        const { skills } = await skillsAPI.getAllowed();
        listEl.innerHTML = '';
        skills.forEach(skillName => {
            const tag = document.createElement('button');
            tag.type = 'button';
            tag.className = 'skill-tag';
            tag.textContent = skillName;
            tag.dataset.skill = skillName;
            if (current.includes(skillName)) {
                tag.classList.add('in-profile');
                tag.disabled = true;
                tag.title = 'Ya está en tu perfil';
            } else {
                tag.addEventListener('click', () => tag.classList.toggle('selected'));
            }
            listEl.appendChild(tag);
        });
        picker.style.display = 'block';
    } catch (err) {
        console.error('Error cargando soft skills:', err);
        alert('No se pudo cargar la lista de soft skills.');
    }
}

export function confirmAddSkills() {
    const listEl = document.getElementById('profile-skills-picker-list');
    const picker = document.getElementById('profile-skills-picker');
    if (!listEl || !picker || !profileData) return;
    const selected = Array.from(listEl.querySelectorAll('.skill-tag.selected')).map(t => t.dataset.skill || t.textContent.trim());
    if (!profileData.softSkills) profileData.softSkills = [];
    let added = 0;
    selected.forEach(skill => {
        if (profileData.softSkills.length >= 8) return;
        if (!profileData.softSkills.includes(skill)) {
            profileData.softSkills.push(skill);
            added++;
        }
    });
    picker.style.display = 'none';
    renderSkills(profileData.softSkills);
    if (added > 0) {
        listEl.querySelectorAll('.skill-tag').forEach(t => t.classList.remove('selected'));
    }
}

export function removeSkill(index) {
    profileData.softSkills.splice(index, 1);
    renderSkills(profileData.softSkills);
}

function updateStats() {
    // Obtener estadísticas del backend
    profileAPI.getStats()
        .then(stats => {
            document.getElementById('profiles-reviewed').textContent = stats.profilesReviewed || '0';
            document.getElementById('matches-made').textContent = stats.matchesMade || '0';
        })
        .catch(error => {
            console.error('Error cargando estadísticas:', error);
            document.getElementById('profiles-reviewed').textContent = '0';
            document.getElementById('matches-made').textContent = '0';
        });
}

// Exportar funciones globales
window.toggleEditProfile = toggleEditProfile;
window.cancelEdit = cancelEdit;
window.saveProfile = saveProfile;
window.openSoftSkillsPicker = openSoftSkillsPicker;
window.confirmAddSkills = confirmAddSkills;
window.removeSkill = removeSkill;
