'use strict';

/**
 * Découpe une compilation audio/vidéo en ses pistes UNIQUES à partir d'un
 * chapitrage YouTube. Déduplique les titres répétés (garde la 1re occurrence),
 * extrait l'audio en MP3 et ignore le reste.
 *
 * Usage :
 *   node outils/decouper-compilation.js <source> <chapitres.txt> [dossierSortie]
 *   node outils/decouper-compilation.js --echantillon <nom>
 *
 * Mode explicite :
 *   <source>        : le fichier compilation (mp4, mkv, webm, mp3, m4a...).
 *   <chapitres.txt> : un chapitre par ligne, format "MM:SS Titre" ou
 *                     "H:MM:SS Titre" (un séparateur -, – ou | après le
 *                     timecode est toléré).
 *   [dossierSortie] : défaut "extraits/".
 *
 * Mode échantillon (--echantillon <nom> ou -e <nom>) :
 *   lit echantillons/<nom>/, y trouve la vidéo + chapitres.txt automatiquement
 *   et écrit les pistes dans echantillons/<nom>/pistes/.
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

// Mode échantillon : résout source/chapitres/sortie depuis echantillons/<nom>/.
const MEDIA_EXT = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4a', '.mp3', '.wav', '.flac', '.aac', '.opus', '.ogg']);

// Racine du projet : le mode échantillon marche quel que soit le dossier courant.
const RACINE = path.resolve(__dirname, '..');

function resoudreEchantillon(nom) {
    const base = path.join(RACINE, 'echantillons', nom);
    if (!fs.existsSync(base)) {
        console.error(`Dossier échantillon introuvable : ${base}`);
        console.error(`Crée-le et dépose la vidéo + chapitres.txt dedans (voir echantillons/README.md).`);
        process.exit(1);
    }
    const chapFile = path.join(base, 'chapitres.txt');
    const medias = fs.readdirSync(base)
        .filter((f) => MEDIA_EXT.has(path.extname(f).toLowerCase()))
        .sort();
    if (medias.length === 0) {
        console.error(`Aucun fichier média dans ${base} (dépose la vidéo longue).`);
        process.exit(1);
    }
    if (medias.length > 1) {
        console.error(`Plusieurs médias dans ${base} (${medias.join(', ')}). Garde-en un seul.`);
        process.exit(1);
    }
    return {
        source: path.join(base, medias[0]),
        chapFile,
        dossier: path.join(base, 'pistes'),
    };
}

function main() {
    const argv = process.argv.slice(2);
    let source, chapFile, dossier;

    if (argv[0] === '--echantillon' || argv[0] === '-e') {
        if (!argv[1]) {
            console.error('Usage : node outils/decouper-compilation.js --echantillon <nom>');
            process.exit(1);
        }
        ({ source, chapFile, dossier } = resoudreEchantillon(argv[1]));
    } else {
        [source, chapFile, dossier = 'extraits'] = argv;
    }

    if (!source || !chapFile) {
        console.error('Usage :');
        console.error('  node outils/decouper-compilation.js <source> <chapitres.txt> [dossierSortie]');
        console.error('  node outils/decouper-compilation.js --echantillon <nom>');
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

    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    } catch (e) {
        console.error('ffmpeg est introuvable : installe FFmpeg (Windows : winget install Gyan.FFmpeg),');
        console.error('ferme et rouvre le terminal, puis relance.');
        process.exit(1);
    }

    fs.mkdirSync(dossier, { recursive: true });

    const vus = new Set();
    let n = 0;

    for (let i = 0; i < chap.length; i++) {
        const { debut, titre } = chap[i];
        // Ligne-marqueur sans texte réel (ex: "🔃" de boucle) : pas une piste,
        // sert seulement de borne de fin pour la piste précédente.
        if (!/[\p{L}\p{N}]/u.test(titre)) continue;
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
