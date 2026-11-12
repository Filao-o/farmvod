'use strict';

/**
 * Fabrique des médias de DÉMONSTRATION neutres pour le projet d'exemple, afin
 * de tester l'installation sans fournir ni musique ni image :
 *
 *   node outils/creer-demo.js            → projets/exemple-deep-focus/
 *   node outils/creer-demo.js <projet>   → projets/<projet>/
 *   node outils/creer-demo.js --force    → réécrit les fichiers déjà présents
 *
 * Produit 4 pistes de 45 s (accords synthétiques générés par ffmpeg, libres de
 * droits puisque calculés sur place) et un background.jpg uni 1920×1080.
 * Ce n'est PAS de la musique : juste de quoi vérifier que toute la chaîne
 * (normalisation → fondus → encodage → chapitres) tourne sur ta machine.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const DUREE = 45;

// Quatre accords mineurs (fréquences en Hz) : un par piste, pour entendre les
// fondus enchaînés d'une piste à l'autre.
const PISTES = [
    { fichier: '01-First Light.flac', notes: [220.00, 261.63, 329.63] },   // La mineur
    { fichier: '02-Slow Tide.flac', notes: [196.00, 233.08, 293.66] },     // Sol mineur
    { fichier: '03-Quiet Room.flac', notes: [174.61, 207.65, 261.63] },    // Fa mineur
    { fichier: '04-Last Page.flac', notes: [146.83, 174.61, 220.00] },     // Ré mineur
];

function ffmpeg(args) {
    try {
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { stdio: 'pipe' });
    } catch (e) {
        if (e.code === 'ENOENT') {
            throw new Error(
                'ffmpeg est introuvable : FFmpeg n\'est pas installé, ou pas dans le PATH.\n' +
                '  Windows : winget install Gyan.FFmpeg   puis ferme et rouvre le terminal.'
            );
        }
        throw new Error(`ffmpeg a échoué : ${String(e.stderr || e.message).trim().slice(0, 500)}`);
    }
}

function main() {
    const argv = process.argv.slice(2);
    const force = argv.includes('--force');
    const nom = argv.find((a) => !a.startsWith('-')) || 'exemple-deep-focus';

    const dossierProjet = path.join(RACINE, 'projets', nom);
    const dossierAudio = path.join(dossierProjet, 'audio');
    fs.mkdirSync(dossierAudio, { recursive: true });

    let crees = 0;
    for (const p of PISTES) {
        const sortie = path.join(dossierAudio, p.fichier);
        if (fs.existsSync(sortie) && !force) { console.log(`  = ${p.fichier} (déjà là)`); continue; }
        // Accord tenu + léger tremolo, avec fondu d'entrée et de sortie.
        const expr = p.notes.map((f, i) => `${(0.22 - i * 0.04).toFixed(2)}*sin(2*PI*${f}*t)`).join('+');
        ffmpeg([
            '-f', 'lavfi', '-i', `aevalsrc=${expr}:s=48000:d=${DUREE}`,
            '-af', `tremolo=f=0.2:d=0.4,afade=t=in:d=3,afade=t=out:st=${DUREE - 4}:d=4`,
            '-ac', '2', '-c:a', 'flac', sortie,
        ]);
        console.log(`  + ${p.fichier}`);
        crees++;
    }

    const dejaFond = ['.jpg', '.jpeg', '.png', '.webp']
        .some((ext) => fs.existsSync(path.join(dossierProjet, `background${ext}`)));
    if (dejaFond && !force) {
        console.log('  = background (déjà là)');
    } else {
        ffmpeg([
            '-f', 'lavfi', '-i', 'color=c=0x1b2a49:s=1920x1080',
            '-vf', 'vignette', '-frames:v', '1', '-q:v', '2',
            path.join(dossierProjet, 'background.jpg'),
        ]);
        console.log('  + background.jpg');
        crees++;
    }

    console.log(`\n✔ Démo prête dans ${path.relative(RACINE, dossierProjet)}${path.sep} (${crees} fichier(s) créé(s)).`);
    console.log(`  Essai : node index.js --projet ${nom} --test 30\n`);
}

try {
    main();
} catch (e) {
    console.error('Erreur :', e.message);
    process.exit(1);
}
