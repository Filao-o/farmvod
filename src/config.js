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
        preset: 'fast',
        codec: 'nvenc',
        upscaleTo4k: false,
    },
    metadata: {
        titre: '',
        descriptionTemplate:
            "{intro}\n\n"
            + "🎵 Tracklist / Chapitres :\n{chapitres}\n\n"
            + "{outro}",
        intro: '',
        outro: 'Musique générée avec Suno. Toute reproduction non autorisée est interdite.',
        tags: [],
        citations: '',
        genererChapitres: true,
        chapitresPremierPassageSeulement: true,
    },
    nowplaying: {
        citation_intervalle_min: 5,
        citation_fade_sec: 1,
        typographie: {
            taille_citation: 30,
            taille_auteur: 22,
            taille_temps: 16,
            epaisseur_barre_px: 8,
            espace_citation_auteur: 40,
            espace_auteur_barre: 87,
        },
        couleurs: {
            texte: 'black',
            barre: 'black',
            barre_fond_couleur: 'black',
            barre_fond_opacite: 0.15,
        },
        positions: {
            marge_bas_pct: 12,
            marge_laterale_pct: 8,
        },
        police: {
            regular: process.platform === 'win32'
                ? process.env.LOCALAPPDATA + '/Microsoft/Windows/Fonts/SFUIDisplay-Light.ttf'
                : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            bold: process.platform === 'win32'
                ? process.env.LOCALAPPDATA + '/Microsoft/Windows/Fonts/SFUIDisplay-Bold.ttf'
                : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        },
    },
    upload: {
        actif: false,
        confidentialite: 'private',
        categorieId: '10',
        playlistId: '',
    },
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

function loadConfig(racine, nomProjet) {
    const global = readJson(path.join(racine, 'config.json'));
    const dossierProjet = path.join(racine, 'projets', nomProjet);
    if (!fs.existsSync(dossierProjet)) {
        throw new Error(`Projet introuvable : ${dossierProjet}`);
    }
    const projet = readJson(path.join(dossierProjet, 'projet.json'));

    const cfg = deepMerge(deepMerge(DEFAULTS, global), projet);

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

module.exports = { loadConfig, DEFAULTS };
