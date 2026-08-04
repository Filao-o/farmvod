'use strict';

const fs = require('fs');
const path = require('path');
const { ffmpeg, log, naturalSort, cacheKey, ensureDir, duration } = require('./utils');

const EXTENSIONS = ['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg'];

/**
 * Normalisation loudness en DEUX passes.
 *
 * Passe 1 : loudnorm analyse le fichier et renvoie ses mesures en JSON.
 * Passe 2 : on réinjecte ces mesures, ce qui permet une correction
 *           linéaire exacte plutôt qu'une compression dynamique
 *           approximative faite à la volée.
 *
 * C'est le point qui différencie une chaîne écoutable d'une chaîne où
 * l'auditeur doit corriger le volume tous les trois morceaux.
 */
async function mesurer(fichier, a) {
    const filtre = `loudnorm=I=${a.lufs}:TP=${a.truePeak}:LRA=${a.loudnessRange}:print_format=json`;
    const { stderr } = await ffmpeg(['-i', fichier, '-af', filtre, '-f', 'null', '-']);

    const debut = stderr.lastIndexOf('{');
    const fin = stderr.lastIndexOf('}');
    if (debut === -1 || fin === -1) {
        throw new Error(`Analyse loudnorm illisible pour ${path.basename(fichier)}`);
    }
    return JSON.parse(stderr.slice(debut, fin + 1));
}

async function appliquer(fichier, mesures, sortie, a) {
    const filtre = [
        `loudnorm=I=${a.lufs}:TP=${a.truePeak}:LRA=${a.loudnessRange}`,
        `measured_I=${mesures.input_i}`,
        `measured_TP=${mesures.input_tp}`,
        `measured_LRA=${mesures.input_lra}`,
        `measured_thresh=${mesures.input_thresh}`,
        `offset=${mesures.target_offset}`,
        'linear=true',
        'print_format=summary',
    ].join(':');

    await ffmpeg([
        '-y', '-i', fichier,
        '-af', filtre,
        '-ar', String(a.sampleRate),
        '-ac', '2',
        '-c:a', 'flac', '-compression_level', '5',   // Lossless, et pas de limite des 4 Go du WAV.
        sortie,
    ]);
}

async function normaliser(cfg) {
    log.step('Étape 1/5 — Normalisation du volume (loudnorm, 2 passes)');

    if (!fs.existsSync(cfg.dossierAudio)) {
        throw new Error(`Dossier audio absent : ${cfg.dossierAudio}`);
    }

    const fichiers = fs.readdirSync(cfg.dossierAudio)
        .filter((f) => EXTENSIONS.includes(path.extname(f).toLowerCase()))
        .sort(naturalSort);

    if (fichiers.length === 0) {
        throw new Error(`Aucun fichier audio dans ${cfg.dossierAudio}`);
    }
    if (fichiers.length < 3) {
        log.warn(`Seulement ${fichiers.length} piste(s) : la répétition sera très perceptible sur 3 h.`);
    }

    const dossierCache = ensureDir(path.join(cfg.cache, 'normalized'));
    const resultat = [];

    for (let i = 0; i < fichiers.length; i++) {
        const source = path.join(cfg.dossierAudio, fichiers[i]);
        const cle = cacheKey(source, cfg.audio);
        const sortie = path.join(dossierCache, `${cle}.flac`);
        // Strip du préfixe numérique de tri ("01-Silence" → "Silence").
        // Les fichiers Suno téléchargés en batch sont préfixés pour l'ordre,
        // mais ce préfixe n'a rien à faire dans le now-playing / les chapitres.
        const titre = path.parse(fichiers[i]).name.replace(/^\d+[-_\s]+/, '');

        if (fs.existsSync(sortie)) {
            log.cache(`[${i + 1}/${fichiers.length}] ${titre}`);
        } else {
            log.info(`[${i + 1}/${fichiers.length}] ${titre} — analyse…`);
            const mesures = await mesurer(source, cfg.audio);
            log.info(`[${i + 1}/${fichiers.length}] ${titre} — ${parseFloat(mesures.input_i).toFixed(1)} LUFS → ${cfg.audio.lufs} LUFS`);
            await appliquer(source, mesures, sortie, cfg.audio);
        }

        resultat.push({ titre, fichier: sortie, duree: await duration(sortie) });
    }

    const total = resultat.reduce((s, p) => s + p.duree, 0);
    log.ok(`${resultat.length} pistes normalisées (${(total / 60).toFixed(1)} min de matière première)`);
    return resultat;
}

module.exports = { normaliser };
