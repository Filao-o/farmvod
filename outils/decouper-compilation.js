'use strict';

/**
 * Découpe une compilation audio/vidéo en ses pistes UNIQUES à partir d'un
 * chapitrage YouTube. Déduplique les titres répétés (garde la 1re occurrence),
 * extrait l'audio en MP3 et ignore le reste.
 *
 * Usage :
 *   node outils/decouper-compilation.js <source> <chapitres.txt> [dossierSortie]
 *
 * <source>        : le fichier compilation (mp4, mkv, webm, mp3, m4a...).
 * <chapitres.txt> : un chapitre par ligne, format "MM:SS Titre" ou
 *                   "H:MM:SS Titre" (un séparateur -, – ou | après le
 *                   timecode est toléré).
 * [dossierSortie] : défaut "extraits/".
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function parseTimecode(tc) {
    const parts = tc.split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseChapitres(txt) {
    const re = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–|.)]?\s*(.+?)\s*$/;
    const chap = [];
    for (const ligne of txt.split(/\r?\n/)) {
        const m = ligne.match(re);
        if (!m) continue;
        const t = parseTimecode(m[1]);
        if (t === null) continue;
        chap.push({ debut: t, titre: m[2].trim() });
    }
    return chap;
}

function slug(s) {
    return s.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'piste';
}

function main() {
    const [, , source, chapFile, dossier = 'extraits'] = process.argv;

    if (!source || !chapFile) {
        console.error('Usage : node outils/decouper-compilation.js <source> <chapitres.txt> [dossierSortie]');
        process.exit(1);
    }
    if (!fs.existsSync(source)) {
        console.error(`Source introuvable : ${source}`);
        process.exit(1);
    }
    if (!fs.existsSync(chapFile)) {
        console.error(`Chapitres introuvables : ${chapFile}`);
        process.exit(1);
    }

    const chap = parseChapitres(fs.readFileSync(chapFile, 'utf-8'));
    if (chap.length === 0) {
        console.error('Aucun chapitre lisible. Format attendu par ligne : "MM:SS Titre" ou "H:MM:SS Titre".');
        process.exit(1);
    }
    chap.sort((a, b) => a.debut - b.debut);

    fs.mkdirSync(dossier, { recursive: true });

    const vus = new Set();
    let n = 0;

    for (let i = 0; i < chap.length; i++) {
        const { debut, titre } = chap[i];
        const cle = slug(titre);
        if (vus.has(cle)) continue;          // doublon → on saute
        vus.add(cle);

        const fin = i + 1 < chap.length ? chap[i + 1].debut : null;  // null = jusqu'à la fin du fichier
        const duree = fin !== null ? fin - debut : null;

        n++;
        const sortie = path.join(dossier, `${String(n).padStart(2, '0')}-${cle}.mp3`);

        // -ss avant -i = seek rapide (ne décode pas depuis 0, crucial sur 1h+).
        // Ré-encodage MP3 : coupe propre + strip la vidéo si la source en a.
        const args = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(debut), '-i', source];
        if (duree !== null) args.push('-t', String(duree));
        args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2', sortie);

        process.stdout.write(`[${n}] ${titre}  (${debut}s${duree !== null ? ` → +${duree}s` : ' → fin'})  … `);
        try {
            execFileSync('ffmpeg', args, { stdio: 'pipe' });
            console.log('ok');
        } catch (e) {
            console.log('ÉCHEC');
            console.error(String(e.stderr || e.message).slice(0, 300));
        }
    }

    console.log(`\n${n} pistes uniques extraites dans ${path.resolve(dossier)} (sur ${chap.length} chapitres, doublons ignorés).`);
}

main();
