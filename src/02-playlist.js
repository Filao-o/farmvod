'use strict';

const fs = require('fs');
const path = require('path');
const {
    ffmpeg, log, ensureDir, duration, hms,
    seededRandom, shuffleNoAdjacentRepeat, progressReporter, horodatageYoutube,
} = require('./utils');

/**
 * Assemble une liste de fichiers audio en un seul, avec fondu enchaîné
 * (acrossfade) à chaque jonction.
 *
 * Le démultiplexeur "concat" du script d'origine collait les pistes
 * bout à bout : toute coupe nette laissée par Suno s'entendait, et la
 * jonction fin de playlist → reprise était brutale. Ici chaque
 * transition est fondue sur quelques secondes.
 */
async function fondreEnchaine(fichiers, sortie, secondes, etiquette, dureeEstimee) {
    if (fichiers.length === 1) {
        fs.copyFileSync(fichiers[0], sortie);
        return;
    }

    const entrees = [];
    fichiers.forEach((f) => entrees.push('-i', f));

    const filtres = [];
    let precedent = '[0:a]';
    for (let i = 1; i < fichiers.length; i++) {
        const cible = (i === fichiers.length - 1) ? '[sortie]' : `[t${i}]`;
        filtres.push(`${precedent}[${i}:a]acrossfade=d=${secondes}:c1=tri:c2=tri${cible}`);
        precedent = cible;
    }

    await ffmpeg([
        '-y', ...entrees,
        '-filter_complex', filtres.join(';'),
        '-map', '[sortie]',
        '-c:a', 'flac', '-compression_level', '5',
        sortie,
    ], { onStderr: progressReporter(etiquette, dureeEstimee) });

    process.stdout.write('\n');
}

async function monterPlaylist(cfg, pistes) {
    log.step('Étape 2/5 — Montage de la playlist longue (fondus enchaînés)');

    const d = cfg.audio.crossfadeSeconds;
    const cible = cfg.video.targetDurationMinutes * 60;
    const dossierTravail = ensureDir(path.join(cfg.cache, 'playlists', cfg.nom));

    // Durée utile d'un passage complet de la playlist, une fois les
    // recouvrements de fondu déduits.
    const sommePistes = pistes.reduce((s, p) => s + (p.duree || 0), 0);
    const dureeParPassage = sommePistes - pistes.length * d;

    // Safety : si les pistes sont plus courtes que le crossfade cumulé,
    // dureeParPassage ≤ 0 → Math.ceil(cible / négatif) donnait 0 ou négatif,
    // Math.max(1, …) tombait sur 1 passage. Symptôme observé : vidéo tronquée
    // à la durée d'un seul passage, avec le message "→ 1 passage(s)" qui
    // masquait le problème réel.
    if (dureeParPassage <= 0) {
        throw new Error(
            `Playlist inutilisable : la somme des pistes (${sommePistes.toFixed(1)}s) ne ` +
            `couvre pas les fondus enchaînés (${(pistes.length * d).toFixed(1)}s). ` +
            `Ajoute des pistes plus longues ou baisse crossfadeSeconds.`
        );
    }
    const passages = Math.max(1, Math.ceil(cible / dureeParPassage));

    log.info(`Pistes : ${pistes.length} × durée moyenne ${(sommePistes / pistes.length).toFixed(1)}s = ${(sommePistes / 60).toFixed(1)} min brutes`);
    log.info(`Playlist : ${(dureeParPassage / 60).toFixed(1)} min utiles par passage (après crossfade ${d}s × ${pistes.length})`);
    log.info(`Objectif ${cfg.video.targetDurationMinutes} min → ${passages} passage(s), ordre remélangé à chaque fois`);

    // --- Construction de l'ordre complet -------------------------------
    const rng = seededRandom(cfg.graine);
    const ordre = [];
    let blocPrecedent = null;

    for (let i = 0; i < passages; i++) {
        // Premier passage dans l'ordre naturel (tu maîtrises l'accroche
        // des premières minutes, celles qui décident de la rétention),
        // puis mélangé pour les suivants.
        const bloc = (i === 0)
            ? pistes.slice()
            : shuffleNoAdjacentRepeat(pistes, rng, blocPrecedent);
        blocPrecedent = bloc;
        ordre.push(bloc);
    }

    // --- Montage hiérarchique ------------------------------------------
    // On fond d'abord chaque passage séparément, puis les passages entre
    // eux. Sans ça, un projet de 3 h ouvrirait 50+ entrées simultanées
    // dans un seul filter_complex — instable sur Windows.
    const blocs = [];
    for (let i = 0; i < ordre.length; i++) {
        const sortieBloc = path.join(dossierTravail, `bloc_${i}.flac`);
        if (!fs.existsSync(sortieBloc)) {
            await fondreEnchaine(
                ordre[i].map((p) => p.fichier),
                sortieBloc,
                d,
                `Passage ${i + 1}/${passages}`,
                dureeParPassage,
            );
        } else {
            log.cache(`Passage ${i + 1}/${passages}`);
        }
        blocs.push(sortieBloc);
    }

    const master = path.join(dossierTravail, 'master.flac');
    if (fs.existsSync(master)) fs.unlinkSync(master);
    await fondreEnchaine(blocs, master, d, 'Assemblage final', dureeParPassage * passages);

    const dureeReelle = await duration(master);
    const dureeFinale = Math.min(dureeReelle, cible + dureeParPassage); // on ne coupe jamais en plein milieu d'un passage

    // --- Tracklist avec horodatage exact --------------------------------
    // Chaque jonction recouvre d secondes : le décalage cumulé est donc
    // de i × d au i-ème morceau.
    const tracklist = [];
    let curseur = 0;
    ordre.flat().forEach((piste, index) => {
        const debut = curseur - index * d;
        if (debut < dureeFinale) {
            tracklist.push({
                index,
                titre: piste.titre,
                debut: Math.max(0, debut),
                horodatage: horodatageYoutube(Math.max(0, debut)),
                passage: Math.floor(index / pistes.length) + 1,
            });
        }
        curseur += piste.duree;
    });

    log.ok(`Master audio : ${hms(dureeReelle)} — ${tracklist.length} morceaux enchaînés`);
    return { master, duree: dureeReelle, tracklist };
}

module.exports = { monterPlaylist };
