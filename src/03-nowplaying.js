'use strict';

const fs = require('fs');
const path = require('path');
const { log, seededRandom, ffmpeg, ensureDir } = require('./utils');

const EXT_IMAGES = ['.jpg', '.jpeg', '.png', '.webp'];

function trouverBackground(dossierProjet) {
    for (const ext of EXT_IMAGES) {
        const chemin = path.join(dossierProjet, `background${ext}`);
        if (fs.existsSync(chemin)) return chemin;
    }
    return null;
}

function chargerCitations(cfg) {
    const nomTheme = cfg.metadata && cfg.metadata.citations;
    if (!nomTheme) return [];

    const fichier = path.join(cfg.racine, 'citations', `${nomTheme}.txt`);
    if (!fs.existsSync(fichier)) {
        log.warn(`Fichier citations manquant : ${fichier}`);
        return [];
    }

    return fs.readFileSync(fichier, 'utf-8')
        .split('\n')
        .map((ligne) => ligne.trim())
        .filter((ligne) => ligne && ligne.includes('|') && !ligne.startsWith('#'))
        .map((ligne) => {
            const [citation, auteur] = ligne.split('|');
            return { citation: citation.trim(), auteur: (auteur || '').trim() };
        });
}

// Pré-rend un PNG arrondi (forme capsule/stadium) pour la barre de progression.
// Exécuté une seule fois par dimension, résultat en cache.
async function preGenererBarre(largeur, hauteur, rayon, couleur, opacite, cacheDir) {
    const cle = `bar_${largeur}x${hauteur}_r${rayon}_${couleur}_a${Math.round(opacite * 100)}`;
    const sortie = path.join(cacheDir, `${cle}.png`);
    if (fs.existsSync(sortie)) return sortie;

    const H2 = hauteur / 2;
    const WR = largeur - 1 - rayon;
    // Capsule : un pixel est dedans si sa distance au segment central ≤ rayon.
    const expr = `if(lte(hypot(X-max(${rayon},min(X,${WR})),Y-${H2}),${rayon}),255,0)`;

    let lavfi = `color=c=${couleur}:s=${largeur}x${hauteur},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${expr}'`;
    if (opacite < 1) {
        lavfi += `,colorchannelmixer=aa=${opacite}`;
    }

    await ffmpeg(['-y', '-f', 'lavfi', '-i', lavfi, '-frames:v', '1', sortie]);
    return sortie;
}

async function preparerNowPlaying(cfg, tracklist) {
    log.step('Étape 3/5 — Préparation visuelle (background + citations + barres)');

    const background = trouverBackground(cfg.dossierProjet);
    if (!background) {
        throw new Error(
            `Image background manquante dans ${cfg.dossierProjet}\n` +
            `   Dépose un fichier background.jpg (ou .png) — ta vignette YouTube.`
        );
    }
    log.info(`Background : ${path.basename(background)}`);

    // Citations
    const toutesLesCitations = chargerCitations(cfg);
    if (toutesLesCitations.length > 0) {
        log.info(`${toutesLesCitations.length} citations chargées depuis "${cfg.metadata.citations}"`);
    }

    const rng = seededRandom(cfg.graine + '-citations');
    const citationsMelangees = toutesLesCitations
        .map((c) => ({ c, ordre: rng() }))
        .sort((a, b) => a.ordre - b.ordre)
        .map(({ c }) => c);

    const dureeEstimee = tracklist.length > 0
        ? tracklist[tracklist.length - 1].debut + (tracklist[tracklist.length - 1].duree || 300)
        : cfg.video.targetDurationMinutes * 60;

    const intervalle = (cfg.nowplaying.citation_intervalle_min || 5) * 60;
    const nbTranches = Math.max(1, Math.ceil(dureeEstimee / intervalle));
    const citations = [];

    for (let i = 0; i < nbTranches; i++) {
        const source = citationsMelangees.length > 0
            ? citationsMelangees[i % citationsMelangees.length]
            : { citation: '', auteur: '' };

        citations.push({
            citation: source.citation,
            auteur: source.auteur,
            debut: i * intervalle,
            fin: Math.min((i + 1) * intervalle, dureeEstimee),
        });
    }

    // Barres arrondies pré-rendues en PNG (forme capsule)
    const W = cfg.video.upscaleTo4k ? 3840 : 1920;
    const H = cfg.video.upscaleTo4k ? 2160 : 1080;
    const echelle = W / 1920;
    const margeLat = Math.round(W * (cfg.nowplaying.positions.marge_laterale_pct || 8) / 100);
    const largeurBarre = W - margeLat * 2;
    const epaisseurBarre = Math.max(3, Math.round(cfg.nowplaying.typographie.epaisseur_barre_px * echelle));
    const rayonBarre = Math.floor(epaisseurBarre / 2);

    const couleurBarre = cfg.nowplaying.couleurs.barre || 'black';
    const couleurFond = cfg.nowplaying.couleurs.barre_fond_couleur || 'black';
    const opaciteFond = cfg.nowplaying.couleurs.barre_fond_opacite || 0.15;

    const cacheBarres = ensureDir(path.join(cfg.cache, 'barres'));
    log.info('Pré-rendu des barres arrondies…');
    const barBg = await preGenererBarre(largeurBarre, epaisseurBarre, rayonBarre, couleurFond, opaciteFond, cacheBarres);
    const barFill = await preGenererBarre(largeurBarre, epaisseurBarre, rayonBarre, couleurBarre, 1.0, cacheBarres);
    log.info('   Barres en cache');

    log.ok(`${citations.length} citation(s) (toutes les ${cfg.nowplaying.citation_intervalle_min || 5} min), background + barres prêts`);

    return { background, citations, barBg, barFill };
}

module.exports = { preparerNowPlaying };
