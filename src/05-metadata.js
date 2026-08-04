'use strict';

const fs = require('fs');
const path = require('path');
const { ffmpeg, log, ensureDir, hms } = require('./utils');

/**
 * Règles YouTube pour que les chapitres soient reconnus :
 *   - le premier doit être à 0:00 ;
 *   - il en faut au moins trois ;
 *   - chacun doit durer au moins 10 secondes.
 * Si une de ces conditions n'est pas remplie, YouTube ignore
 * silencieusement l'ensemble.
 */
function construireChapitres(tracklist, cfg, nbPistesUniques) {
    let liste = tracklist;

    if (cfg.metadata.chapitresPremierPassageSeulement) {
        liste = tracklist.filter((t) => t.passage === 1);
    }

    // Dédoublonnage des titres répétés (utile si un même morceau revient).
    const vus = new Map();
    liste = liste.map((t) => {
        const n = (vus.get(t.titre) || 0) + 1;
        vus.set(t.titre, n);
        return { ...t, affichage: n > 1 ? `${t.titre} (${n})` : t.titre };
    });

    // Écarte les chapitres trop rapprochés (< 10 s).
    const filtres = [];
    for (const c of liste) {
        if (filtres.length === 0 || c.debut - filtres[filtres.length - 1].debut >= 10) {
            filtres.push(c);
        }
    }

    if (filtres.length === 0) return { texte: '', valides: false };

    filtres[0] = { ...filtres[0], debut: 0, horodatage: '0:00' };

    const valides = filtres.length >= 3;
    if (!valides) {
        log.warn(`${filtres.length} chapitre(s) seulement : YouTube en exige 3 minimum, ils seront ignorés.`);
    }

    const texte = filtres
        .map((c) => `${c.horodatage} ${c.affichage}`)
        .join('\n');

    return { texte, valides, nombre: filtres.length };
}

async function extraireMiniature(cfg, fond) {
    const sortie = path.join(cfg.dossierSortie, 'miniature.jpg');
    try {
        await ffmpeg([
            '-y', '-ss', '1', '-i', fond.fichier,
            '-frames:v', '1',
            '-vf', 'scale=1280:720:flags=lanczos',
            '-q:v', '2',
            sortie,
        ]);
        log.info('Miniature extraite : miniature.jpg (1280×720, à retoucher si besoin)');
        return sortie;
    } catch (e) {
        log.warn(`Miniature non générée : ${e.message.split('\n')[0]}`);
        return null;
    }
}

async function genererMetadonnees(cfg, audio, video, fond, pistes) {
    log.step('Étape 5/5 — Métadonnées YouTube');

    ensureDir(cfg.dossierSortie);

    const { texte: chapitres, valides, nombre } = construireChapitres(
        audio.tracklist, cfg, pistes.length,
    );

    const description = cfg.metadata.descriptionTemplate
        .replace('{intro}', cfg.metadata.intro || '')
        .replace('{chapitres}', chapitres)
        .replace('{outro}', cfg.metadata.outro || '')
        .replace('{duree}', hms(video.duree))
        .replace('{titre}', cfg.metadata.titre)
        .trim();

    const fichierDescription = path.join(cfg.dossierSortie, 'description.txt');
    fs.writeFileSync(fichierDescription, description, 'utf-8');

    // Fichier récapitulatif : sert de trace pour retrouver l'ordre exact
    // d'une vidéo publiée, et de source pour l'upload.
    const recap = {
        projet: cfg.nom,
        genere: new Date().toISOString(),
        graine: cfg.graine,
        titre: cfg.metadata.titre,
        duree: hms(video.duree),
        dureeSecondes: Math.round(video.duree),
        fichierVideo: path.resolve(video.fichier),
        tailleMo: video.tailleMo,
        tags: cfg.metadata.tags,
        chapitresValides: valides,
        pistes: audio.tracklist.map((t) => ({ horodatage: t.horodatage, titre: t.titre, passage: t.passage })),
    };
    fs.writeFileSync(
        path.join(cfg.dossierSortie, 'recap.json'),
        JSON.stringify(recap, null, 2),
        'utf-8',
    );

    await extraireMiniature(cfg, fond);

    log.ok(`Description prête (${nombre} chapitres${valides ? '' : ' — insuffisant'})`);
    return { description, chapitres, recap };
}

module.exports = { genererMetadonnees };
