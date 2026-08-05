'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentProjet = null;
let pistes = [];
let projetConfig = {};
let fontCitePath = '';
let fontTempsPath = '';

// ── SVG icons ───────────────────────────────────────────────────────
const ICON = {
    grip: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="4" cy="2" r="1" fill="currentColor"/><circle cx="8" cy="2" r="1" fill="currentColor"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="8" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="10" r="1" fill="currentColor"/><circle cx="8" cy="10" r="1" fill="currentColor"/></svg>',
    edit: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 1.5l3 3L4 12H1v-3L8.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    trash: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M4.5 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5 5.5v4M8 5.5v4M3 3l.7 8a1 1 0 001 .9h3.6a1 1 0 001-.9L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ── Init ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupModal();
    setupHome();
    setupProject();
    setupConfig();
    setupConsole();
    setupMetadata();
    await refreshHome();
});

// ── Navigation ──────────────────────────────────────────────────────
function showView(name) {
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');
    if (name === 'config') requestAnimationFrame(updatePreview);
}

function setupNavigation() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-back');
        if (btn) showView(btn.dataset.target);
    });
}

// ── Modal ───────────────────────────────────────────────────────────
let modalCallback = null;

function setupModal() {
    $('#modal-cancel').addEventListener('click', closeModal);
    $('#modal-confirm').addEventListener('click', confirmModal);
    $('#modal-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmModal();
        if (e.key === 'Escape') closeModal();
    });
    $('#modal-overlay').addEventListener('click', (e) => {
        if (e.target === $('#modal-overlay')) closeModal();
    });
}

function openModal(title, placeholder, cb) {
    $('#modal-title').textContent = title;
    $('#modal-input').placeholder = placeholder;
    $('#modal-input').value = '';
    $('#modal-overlay').classList.remove('hidden');
    modalCallback = cb;
    setTimeout(() => $('#modal-input').focus(), 50);
}

function closeModal() { $('#modal-overlay').classList.add('hidden'); modalCallback = null; }
function confirmModal() {
    const val = $('#modal-input').value.trim();
    if (modalCallback && val) modalCallback(val);
    closeModal();
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 0 : HOME
// ═══════════════════════════════════════════════════════════════════
function setupHome() {
    $('#btn-new-projet').addEventListener('click', () => {
        openModal('Nouveau projet', 'Nom du projet', async (nom) => {
            try {
                const slug = await window.api.createProjet(nom);
                await refreshHome();
                await openProject(slug);
            } catch (e) { alert(e.message); }
        });
    });

    $('#search-input').addEventListener('input', filterProjects);
}

async function refreshHome() {
    const projets = await window.api.listProjets();
    const grid = $('#projet-grid');
    grid.innerHTML = '';

    projets.forEach(p => {
        const card = document.createElement('div');
        card.className = 'projet-card';
        card.dataset.nom = p.nom;

        const bgSrc = p.bgExists ? '' : '';
        card.innerHTML = `
            <div class="thumb">
                ${p.bgExists ? '<img alt="">' : `<span class="placeholder">${p.nom}</span>`}
                <button class="btn-delete-card" title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M2 3h9M4.5 3V2a1 1 0 011-1h2a1 1 0 011 1v1M5 5.5v4M8 5.5v4M3 3l.7 8a1 1 0 001 .9h3.6a1 1 0 001-.9L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div class="card-info">
                <div class="card-name">${p.nom}</div>
                <div class="card-meta"><span class="card-status"></span>${p.pistes} piste${p.pistes !== 1 ? 's' : ''}<span class="card-duree"></span></div>
            </div>
        `;

        // Load thumbnail + compiled status async
        if (p.bgExists) {
            window.api.getBackground(p.nom).then(path => {
                if (path) card.querySelector('.thumb img').src = `file://${path}`;
            });
        }
        window.api.outputInfo(p.nom).then(info => {
            const dot = card.querySelector('.card-status');
            dot.classList.add(info.compiled ? 'compiled' : 'not-compiled');
            const dureeEl = card.querySelector('.card-duree');
            if (info.compiled && info.recap && info.recap.duree) {
                dureeEl.textContent = ` · ${info.recap.duree}`;
            } else {
                const mins = (p.config && p.config.video && p.config.video.targetDurationMinutes) || 0;
                if (mins > 0) {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    dureeEl.textContent = ` · ~${h > 0 ? h + 'h' : ''}${m > 0 ? m + 'min' : ''}`;
                }
            }
        });

        card.querySelector('.btn-delete-card').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Supprimer le projet « ${p.nom} » ? Cette action est irréversible.`)) return;
            await window.api.deleteProjet(p.nom);
            showToast('Projet supprimé');
            refreshHome();
        });

        card.addEventListener('click', () => openProject(p.nom));
        grid.appendChild(card);
    });
}

function filterProjects() {
    const q = $('#search-input').value.toLowerCase();
    $$('.projet-card').forEach(c => {
        c.style.display = c.dataset.nom.toLowerCase().includes(q) ? '' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 1 : PROJECT
// ═══════════════════════════════════════════════════════════════════
function setupProject() {
    // Upload audio
    $('#btn-upload-audio').addEventListener('click', async () => {
        if (!currentProjet) return;
        const files = await window.api.openFileDialog({
            title: 'Ajouter des pistes audio',
            filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (files.length > 0) {
            await window.api.addAudio(currentProjet, files);
            await refreshPistes();
        }
    });

    // Background
    $('#btn-choose-bg').addEventListener('click', async () => {
        if (!currentProjet) return;
        const files = await window.api.openFileDialog({
            title: 'Choisir le background',
            filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
            properties: ['openFile'],
        });
        if (files.length > 0) {
            await window.api.setBackground(currentProjet, files[0]);
            await refreshBackground();
        }
    });

    // Drag-and-drop audio files from OS
    const trackCard = $('.track-card');
    trackCard.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            trackCard.classList.add('drag-over-zone');
        }
    });
    trackCard.addEventListener('dragleave', (e) => {
        if (!trackCard.contains(e.relatedTarget)) trackCard.classList.remove('drag-over-zone');
    });
    trackCard.addEventListener('drop', async (e) => {
        e.preventDefault();
        trackCard.classList.remove('drag-over-zone');
        if (!currentProjet) return;
        const files = [...e.dataTransfer.files].map(f => f.path).filter(Boolean);
        if (files.length > 0) {
            await window.api.addAudio(currentProjet, files);
            await refreshPistes();
        }
    });

    // Drag-and-drop background on bg-zone
    const bgZone = $('#bg-zone');
    bgZone.addEventListener('dragover', (e) => { e.preventDefault(); });
    bgZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (!currentProjet || !e.dataTransfer.files.length) return;
        const file = e.dataTransfer.files[0];
        if (file.path && /\.(jpg|jpeg|png|webp)$/i.test(file.path)) {
            await window.api.setBackground(currentProjet, file.path);
            await refreshBackground();
        }
    });

    // Citations
    loadCitationsList();
    $('#btn-add-citation').addEventListener('click', async () => {
        const nom = await window.api.addCitationFile();
        if (nom) {
            await loadCitationsList();
            $('#citations-select').value = nom;
        }
    });

    // Settings button → config view
    $('#btn-settings').addEventListener('click', () => {
        showView('config');
        loadConfigValues();
    });

    // Metadata button → metadata view
    $('#btn-metadata').addEventListener('click', () => {
        showView('metadata');
        loadMetadata();
    });

    // Pipeline buttons
    $('#btn-test').addEventListener('click', () => runPipeline(30));
    $('#btn-run').addEventListener('click', () => runPipeline(0));
}

async function openProject(nom) {
    currentProjet = nom;
    $('#projet-title').textContent = nom;
    showView('project');
    await refreshPistes();
    await refreshBackground();
    projetConfig = await window.api.readConfig(nom);
    loadProjectConfigValues();
    loadCitationSelection();
}

function loadProjectConfigValues() {
    const cfg = projetConfig;
    setVal('#cfg-duree', getPath(cfg, 'video.targetDurationMinutes'));
    setVal('#cfg-crossfade', getPath(cfg, 'audio.crossfadeSeconds'));
}

function loadCitationSelection() {
    const cite = getPath(projetConfig, 'metadata.citations');
    if (cite) $('#citations-select').value = cite;
    const toggle = getPath(projetConfig, 'metadata.citationsActives');
    $('#citations-toggle').checked = toggle !== false;
}

async function refreshPistes() {
    if (!currentProjet) return;
    pistes = await window.api.listPistes(currentProjet);
    renderPistes();
}

function renderPistes() {
    const list = $('#audio-list');
    const empty = $('#audio-empty');
    list.innerHTML = '';

    if (pistes.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    pistes.forEach((p, i) => {
        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.fichier = p.fichier;
        li.dataset.index = i;

        const ext = p.fichier.split('.').pop();
        li.innerHTML = `
            <span class="piste-grip">${ICON.grip}</span>
            <span class="piste-num">${i + 1}</span>
            <span class="piste-titre">${p.titre}</span>
            <button class="piste-rename" title="Renommer">${ICON.edit}</button>
            <span class="piste-ext">${ext}</span>
            <span class="piste-actions">
                <button class="delete" title="Supprimer">${ICON.trash}</button>
            </span>
        `;

        li.querySelector('.piste-rename').addEventListener('click', (e) => {
            e.stopPropagation();
            startRename(li, p);
        });

        li.querySelector('.delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            await window.api.deleteAudio(currentProjet, p.fichier);
            const ordered = pistes.filter(pp => pp.fichier !== p.fichier).map(pp => pp.fichier);
            if (ordered.length > 0) await window.api.reorderAudio(currentProjet, ordered);
            await refreshPistes();
        });

        // Drag reorder
        li.addEventListener('dragstart', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
        });
        li.addEventListener('dragend', () => li.classList.remove('dragging'));
        li.addEventListener('dragover', (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            li.classList.add('drag-over');
        });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', async (e) => {
            if (e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            li.classList.remove('drag-over');
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const to = i;
            if (from === to) return;
            const ordered = [...pistes.map(pp => pp.fichier)];
            const [moved] = ordered.splice(from, 1);
            ordered.splice(to, 0, moved);
            await window.api.reorderAudio(currentProjet, ordered);
            await refreshPistes();
        });

        list.appendChild(li);
    });
}

function startRename(li, piste) {
    const span = li.querySelector('.piste-titre');
    const old = piste.titre;
    span.innerHTML = `<input type="text" value="${old}">`;
    const input = span.querySelector('input');
    input.focus();
    input.select();

    const finish = async () => {
        const val = input.value.trim();
        if (val && val !== old) {
            await window.api.renameAudio(currentProjet, piste.fichier, val);
            await refreshPistes();
        } else {
            span.textContent = old;
        }
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = old; input.blur(); }
    });
}

async function refreshBackground() {
    if (!currentProjet) return;
    const bgPath = await window.api.getBackground(currentProjet);
    const img = $('#bg-img');
    if (bgPath) {
        img.src = `file://${bgPath}?t=${Date.now()}`;
        img.classList.remove('hidden');
        $('#preview-bg').src = `file://${bgPath}?t=${Date.now()}`;
    } else {
        img.classList.add('hidden');
        img.src = '';
    }
}

async function loadCitationsList() {
    const themes = await window.api.listCitations();
    const select = $('#citations-select');
    const current = select.value;
    select.innerHTML = '<option value="">Aucune</option>';
    themes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        select.appendChild(opt);
    });
    if (current) select.value = current;
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 2 : CONFIG / PREVIEW
// ═══════════════════════════════════════════════════════════════════
function setupConfig() {
    // Preview listeners
    const previewIds = [
        'cfg-taille-citation', 'cfg-taille-auteur', 'cfg-taille-temps',
        'cfg-epaisseur-barre', 'cfg-couleur-texte', 'cfg-couleur-barre',
        'cfg-espace-cite-auteur', 'cfg-espace-auteur-barre',
        'cfg-marge-bas', 'cfg-marge-lat',
    ];
    previewIds.forEach(id => {
        const el = $(`#${id}`);
        if (el) {
            el.addEventListener('input', updatePreview);
            el.addEventListener('change', updatePreview);
        }
    });

    // Font pickers
    $('#btn-font-cite').addEventListener('click', async () => {
        const f = await window.api.browseFont();
        if (f) {
            fontCitePath = f;
            $('#btn-font-cite').textContent = f.split(/[/\\]/).pop().replace(/\.\w+$/, '');
        }
    });
    $('#btn-font-temps').addEventListener('click', async () => {
        const f = await window.api.browseFont();
        if (f) {
            fontTempsPath = f;
            $('#btn-font-temps').textContent = f.split(/[/\\]/).pop().replace(/\.\w+$/, '');
        }
    });

    // Save
    $('#btn-save-config').addEventListener('click', saveAllConfig);

    // Go to console
    $('#btn-goto-console').addEventListener('click', () => showView('console'));
}

function loadConfigValues() {
    const cfg = projetConfig;
    setVal('#cfg-couleur-texte', getPath(cfg, 'nowplaying.couleurs.texte'), 'color');
    setVal('#cfg-couleur-barre', getPath(cfg, 'nowplaying.couleurs.barre'), 'color');
    setVal('#cfg-fps', getPath(cfg, 'video.fps'));
    setVal('#cfg-taille-citation', getPath(cfg, 'nowplaying.typographie.taille_citation'));
    setVal('#cfg-taille-auteur', getPath(cfg, 'nowplaying.typographie.taille_auteur'));
    setVal('#cfg-taille-temps', getPath(cfg, 'nowplaying.typographie.taille_temps'));
    setVal('#cfg-epaisseur-barre', getPath(cfg, 'nowplaying.typographie.epaisseur_barre_px'));
    setVal('#cfg-espace-cite-auteur', getPath(cfg, 'nowplaying.typographie.espace_citation_auteur'));
    setVal('#cfg-espace-auteur-barre', getPath(cfg, 'nowplaying.typographie.espace_auteur_barre'));
    setVal('#cfg-marge-bas', getPath(cfg, 'nowplaying.positions.marge_bas_pct'));
    setVal('#cfg-marge-lat', getPath(cfg, 'nowplaying.positions.marge_laterale_pct'));
    setVal('#cfg-citation-intervalle', getPath(cfg, 'nowplaying.citation_intervalle_min'));
    setVal('#cfg-citation-fade', getPath(cfg, 'nowplaying.citation_fade_sec'));

    // Font labels
    const fontCite = getPath(cfg, 'nowplaying.police.regular');
    const fontTemps = getPath(cfg, 'nowplaying.police.temps');
    if (fontCite) {
        fontCitePath = fontCite;
        $('#btn-font-cite').textContent = fontCite.split(/[/\\]/).pop().replace(/\.\w+$/, '');
    }
    if (fontTemps) {
        fontTempsPath = fontTemps;
        $('#btn-font-temps').textContent = fontTemps.split(/[/\\]/).pop().replace(/\.\w+$/, '');
    }

    updatePreview();
}

async function saveAllConfig() {
    if (!currentProjet) return;
    let cfg = await window.api.readConfig(currentProjet);

    // Project view values
    setPath(cfg, 'nowplaying.couleurs.texte', hexToName($('#cfg-couleur-texte').value));
    setPath(cfg, 'nowplaying.couleurs.barre', hexToName($('#cfg-couleur-barre').value));
    setPath(cfg, 'video.targetDurationMinutes', int('#cfg-duree'));
    setPath(cfg, 'audio.crossfadeSeconds', float('#cfg-crossfade'));
    setPath(cfg, 'video.fps', int('#cfg-fps'));

    // Config view values
    setPath(cfg, 'nowplaying.typographie.taille_citation', int('#cfg-taille-citation'));
    setPath(cfg, 'nowplaying.typographie.taille_auteur', int('#cfg-taille-auteur'));
    setPath(cfg, 'nowplaying.typographie.taille_temps', int('#cfg-taille-temps'));
    setPath(cfg, 'nowplaying.typographie.epaisseur_barre_px', int('#cfg-epaisseur-barre'));
    setPath(cfg, 'nowplaying.typographie.espace_citation_auteur', int('#cfg-espace-cite-auteur'));
    setPath(cfg, 'nowplaying.typographie.espace_auteur_barre', int('#cfg-espace-auteur-barre'));
    setPath(cfg, 'nowplaying.positions.marge_bas_pct', int('#cfg-marge-bas'));
    setPath(cfg, 'nowplaying.positions.marge_laterale_pct', int('#cfg-marge-lat'));
    setPath(cfg, 'nowplaying.citation_intervalle_min', int('#cfg-citation-intervalle'));
    setPath(cfg, 'nowplaying.citation_fade_sec', float('#cfg-citation-fade'));

    // Fonts
    if (fontCitePath) {
        setPath(cfg, 'nowplaying.police.regular', fontCitePath);
        setPath(cfg, 'nowplaying.police.bold', fontCitePath);
    }
    if (fontTempsPath) {
        setPath(cfg, 'nowplaying.police.temps', fontTempsPath);
    }

    // Citations
    const citeVal = $('#citations-select').value;
    if (citeVal) setPath(cfg, 'metadata.citations', citeVal);
    else if (cfg.metadata) delete cfg.metadata.citations;
    setPath(cfg, 'metadata.citationsActives', $('#citations-toggle').checked);

    await window.api.saveConfig(currentProjet, JSON.stringify(cfg, null, 2));
    projetConfig = cfg;
    showToast('Configuration sauvegardée');
}

// ── Preview ─────────────────────────────────────────────────────────
function updatePreview() {
    const frame = $('#preview-frame');
    if (!frame) return;
    const scale = 0.5;
    const W = 960;
    const H = 540;

    const tailleCite = parseFloat($('#cfg-taille-citation').value || 30) * scale;
    const tailleAuteur = parseFloat($('#cfg-taille-auteur').value || 22) * scale;
    const tailleTemps = parseFloat($('#cfg-taille-temps').value || 16) * scale;
    const epaisseur = Math.max(2, parseFloat($('#cfg-epaisseur-barre').value || 8) * scale);
    const espaceCiteAuteur = parseFloat($('#cfg-espace-cite-auteur').value || 40) * scale;
    const espaceAuteurBarre = parseFloat($('#cfg-espace-auteur-barre').value || 87) * scale;
    const margeBasPct = parseFloat($('#cfg-marge-bas').value || 12);
    const margeLatPct = parseFloat($('#cfg-marge-lat').value || 8);

    const couleurTexte = $('#cfg-couleur-texte').value;
    const couleurBarre = $('#cfg-couleur-barre').value;

    const margeBas = H * margeBasPct / 100;
    const margeLat = W * margeLatPct / 100;
    const barY = H - margeBas;
    const largeurBarre = W - margeLat * 2;

    const yAuteur = barY - espaceAuteurBarre;
    const yCite = yAuteur - tailleAuteur - espaceCiteAuteur;
    const yTemps = barY + epaisseur + 4 * scale;

    apply('#preview-citation', { top: yCite, fontSize: tailleCite, color: couleurTexte, padding: `0 ${margeLat}px` });
    apply('#preview-auteur', { top: yAuteur, fontSize: tailleAuteur, color: couleurTexte, padding: `0 ${margeLat}px` });

    const barBg = $('#preview-bar-bg');
    Object.assign(barBg.style, {
        left: margeLat + 'px', top: barY + 'px',
        width: largeurBarre + 'px', height: epaisseur + 'px',
        backgroundColor: couleurBarre, opacity: '0.15',
    });
    $('#preview-bar-fill').style.backgroundColor = couleurBarre;

    apply('#preview-time-left', { top: yTemps, fontSize: tailleTemps, color: couleurTexte, left: margeLat + 'px', right: 'auto' });
    apply('#preview-time-right', { top: yTemps, fontSize: tailleTemps, color: couleurTexte, right: margeLat + 'px', left: 'auto' });
}

function apply(sel, props) {
    const el = $(sel);
    if (!el) return;
    for (const [k, v] of Object.entries(props)) {
        el.style[k] = typeof v === 'number' ? v + 'px' : v;
    }
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 3 : CONSOLE
// ═══════════════════════════════════════════════════════════════════
function setupConsole() {
    window.api.onPipelineLog((data) => {
        const out = $('#console-output');
        out.textContent += data;
        out.scrollTop = out.scrollHeight;
    });

    window.api.onPipelineDone((code) => {
        const out = $('#console-output');
        out.textContent += code === 0
            ? '\n--- Terminé avec succès ---\n'
            : `\n--- Erreur (code ${code}) ---\n`;
        out.scrollTop = out.scrollHeight;
        $('#btn-test').disabled = false;
        $('#btn-run').disabled = false;
    });

    $('#btn-clear-console').addEventListener('click', () => {
        $('#console-output').textContent = '';
    });
}

async function runPipeline(testSec) {
    if (!currentProjet) return;
    const running = await window.api.isRunning();
    if (running) { alert('Un pipeline tourne déjà'); return; }

    // Save config first
    await saveAllConfig();

    $('#console-output').textContent = '';
    showView('console');
    $('#btn-test').disabled = true;
    $('#btn-run').disabled = true;

    try {
        await window.api.runPipeline(currentProjet, testSec);
    } catch (e) {
        $('#console-output').textContent += `Erreur: ${e.message}\n`;
        $('#btn-test').disabled = false;
        $('#btn-run').disabled = false;
    }
}

// ═══════════════════════════════════════════════════════════════════
// VIEW 4 : METADATA
// ═══════════════════════════════════════════════════════════════════
function setupMetadata() {
    $('#btn-copy-desc').addEventListener('click', () => {
        const desc = $('#meta-description').value;
        navigator.clipboard.writeText(desc);
        showToast('Description copiée');
    });

    $('#btn-save-meta').addEventListener('click', async () => {
        if (!currentProjet) return;
        let cfg = await window.api.readConfig(currentProjet);
        setPath(cfg, 'metadata.titre', $('#meta-titre').value);
        setPath(cfg, 'metadata.tags', $('#meta-tags').value.split(',').map(t => t.trim()).filter(Boolean));
        await window.api.saveConfig(currentProjet, JSON.stringify(cfg, null, 2));
        projetConfig = cfg;
        showToast('Métadonnées sauvegardées');
    });

    $('#btn-open-output').addEventListener('click', async () => {
        if (!currentProjet) return;
        const info = await window.api.outputInfo(currentProjet);
        if (info.outputDir) window.api.openPath(info.outputDir);
    });
}

async function loadMetadata() {
    if (!currentProjet) return;
    const info = await window.api.outputInfo(currentProjet);
    const video = $('#meta-video');
    const empty = $('#meta-video-empty');

    if (info.mp4Path) {
        video.src = `file://${info.mp4Path}`;
        video.style.display = '';
        empty.style.display = 'none';
    } else {
        video.removeAttribute('src');
        video.style.display = 'none';
        empty.style.display = '';
    }

    const cfg = projetConfig;
    $('#meta-titre').value = getPath(cfg, 'metadata.titre') || currentProjet;
    const tags = getPath(cfg, 'metadata.tags');
    $('#meta-tags').value = Array.isArray(tags) ? tags.join(', ') : (tags || '');

    if (info.description) {
        $('#meta-description').value = info.description;
    } else {
        const recap = info.recap || {};
        let desc = getPath(cfg, 'metadata.titre') || currentProjet;
        if (recap.pistes && recap.pistes.length > 0) {
            desc += '\n\n🎵 Tracklist :\n';
            recap.pistes.forEach(p => {
                desc += `${p.horodatage} ${p.titre}\n`;
            });
        }
        $('#meta-description').value = desc;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────
function getPath(obj, dotPath) {
    return dotPath.split('.').reduce((o, k) => o && o[k], obj);
}

function setPath(obj, dotPath, value) {
    const keys = dotPath.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
        cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
}

function setVal(sel, val, type) {
    if (val == null) return;
    const el = $(sel);
    if (!el) return;
    if (type === 'color') {
        el.value = nameToHex(val);
    } else {
        el.value = val;
    }
}

function int(sel) { return parseInt($(sel).value) || 0; }
function float(sel) { return parseFloat($(sel).value) || 0; }

function nameToHex(name) {
    if (name && name.startsWith('#')) return name;
    const map = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000' };
    return map[name] || '#000000';
}

function hexToName(hex) {
    const map = { '#000000': 'black', '#ffffff': 'white' };
    return map[hex] || hex;
}

function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('visible'), 2200);
}
