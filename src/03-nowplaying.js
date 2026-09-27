'use strict';

const fs = require('fs');
const path = require('path');
const { log } = require('./utils');

const EXT_IMAGES = ['.jpg', '.jpeg', '.png', '.webp'];

function trouverBackground(dossierProjet) {
    for (const ext of EXT_IMAGES) {
        const chemin = path.join(dossierProjet, `background${ext}`);
        if (fs.existsSync(chemin)) return chemin;
    }
    return null;
}

async function preparerNowPlaying(cfg) {
    log.step('Étape 3/5 — Préparation visuelle');

    const background = trouverBackground(cfg.dossierProjet);
    if (!background) {
        throw new Error(
            `Image background manquante dans ${cfg.dossierProjet}\n` +
            `   Dépose un fichier background.jpg (ou .png) — ta vignette YouTube.`
        );
    }
    log.ok(`Background : ${path.basename(background)}`);

    return { background };
}

module.exports = { preparerNowPlaying };
