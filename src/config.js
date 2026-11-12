'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    audio: {
        lufs: -14,
        truePeak: -1.5,
        loudnessRange: 11,
        crossfadeSeconds: 3,
        sampleRate: 48000,
        bitrate: '320k',
    },
    video: {
        targetDurationMinutes: 180,
        fps: 30,
        gopSeconds: 2,
        crf: 20,
        preset: 'ultrafast',
        // 'auto' : essaie l'encodeur GPU NVIDIA (NVENC) et retombe tout seul
        // sur libx264 (CPU) s'il n'y en a pas. 'nvenc' fait pareil ;
        // 'libx264' force le CPU.
        codec: 'auto',
        upscaleTo4k: false,
    },
    metadata: {
        titre: '',
        descriptionTemplate:
            "{intro}\n\n"
            + "🎵 Tracklist / Chapitres :\n{chapitres}\n\n"
            + "{outro}",
        intro: '',
        outro: '',
        tags: [],
        // Libellés de chapitres, dans l'ordre du 1er passage (= ordre de tri
        // naturel des fichiers audio). Permet de changer un libellé SANS
        // renommer les fichiers (renommer invaliderait le cache → ré-encodage).
        // Vide = on retombe sur le nom de fichier nettoyé.
        chapitres: [],
        genererChapitres: true,
        chapitresPremierPassageSeulement: true,
    },
    upload: {
        actif: false,
        confidentialite: 'private',
        categorieId: '10',
        playlistId: '',
        // Port local du retour OAuth (http://localhost:<port>). À changer
        // seulement s'il est déjà pris sur ta machine.
        oauthPort: 4567,
    },
    // Chaîne utilisée par outils/composer-projet.js quand --chaine est absent
    // (= nom d'un fichier presets/chaines/<chaine>.json).
    chaineDefaut: 'exemple',
};

function deepMerge(base, override) {
    const out = { ...base };
    for (const [k, v] of Object.entries(override || {})) {
        out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k])
            ? deepMerge(base[k], v)
            : v;
    }
    return out;
}

function readJson(file) {
    if (!fs.existsSync(file)) return {};
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        throw new Error(`JSON invalide dans ${file} : ${e.message}`);
    }
}

// Réglages globaux, sans projet : défauts du code < config.json (versionné,
// neutre) < config.local.json (personnel, ignoré par git — playlist, chaîne
// par défaut, port… tout ce qui ne regarde que ta machine).
function loadGlobal(racine) {
    const global = readJson(path.join(racine, 'config.json'));
    const local = readJson(path.join(racine, 'config.local.json'));
    return deepMerge(deepMerge(DEFAULTS, global), local);
}

function listerDossiersProjets(racine) {
    try {
        return fs.readdirSync(path.join(racine, 'projets'), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
    } catch (e) {
        return [];
    }
}

function loadConfig(racine, nomProjet) {
    const dossierProjet = path.join(racine, 'projets', nomProjet);
    if (!fs.existsSync(dossierProjet)) {
        const dispo = listerDossiersProjets(racine);
        throw new Error(
            `Projet introuvable : ${dossierProjet}
` +
            `   Projets existants : ${dispo.join(', ') || '(aucun)'}
` +
            `   Un projet = un dossier projets/<nom>/ avec audio/ et background.jpg (voir README.md).`
        );
    }
    const projet = readJson(path.join(dossierProjet, 'projet.json'));

    const cfg = deepMerge(loadGlobal(racine), projet);

    cfg.nom = nomProjet;
    cfg.racine = racine;
    cfg.dossierProjet = dossierProjet;
    cfg.dossierAudio = path.join(dossierProjet, 'audio');
    cfg.dossierSortie = path.join(dossierProjet, 'output');
    cfg.cache = path.join(racine, '.cache');
    cfg.graine = cfg.graine || nomProjet;

    if (!cfg.metadata.titre) cfg.metadata.titre = nomProjet;

    return cfg;
}

module.exports = { loadConfig, loadGlobal, DEFAULTS };
