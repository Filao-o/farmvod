#!/usr/bin/env node
'use strict';

// Garde-fou version de Node, avant tout require du projet : un message clair
// vaut mieux qu'une erreur de syntaxe obscure sur une vieille installation.
const NODE_MAJEUR = parseInt(process.versions.node.split('.')[0], 10);
if (NODE_MAJEUR < 18) {
    console.error(
        `Node.js ${process.versions.node} est trop ancien : il faut la version 18 ou plus récente.\n` +
        `Installe la version LTS depuis https://nodejs.org puis relance.`
    );
    process.exit(1);
}

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./src/config');
const { log, checkTools, hms, ensureDir, duration, bytesToMo } = require('./src/utils');
const { normaliser } = require('./src/01-normalize');
const { monterPlaylist } = require('./src/02-playlist');
const { preparerBackground } = require('./src/03-background');
const { assembler } = require('./src/04-assemble');
const { genererMetadonnees } = require('./src/05-metadata');

const RACINE = __dirname;

function parserArguments(argv) {
    const args = { projet: null, tous: false, upload: false, viderCache: false, test: 0, metaOnly: false, updateId: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--projet' || a === '-p') args.projet = argv[++i];
        else if (a === '--tous' || a === '--all') args.tous = true;
        else if (a === '--upload') args.upload = true;
        else if (a === '--meta-only' || a === '--meta') args.metaOnly = true;
        else if (a === '--update' || a === '--maj') {
            // --update <id> édite cette vidéo ; --update seul réutilise l'ID stocké.
            const suivant = argv[i + 1];
            if (suivant && !suivant.startsWith('-')) { args.updateId = suivant; i++; }
            else args.updateId = true;
        }
        else if (a === '--vider-cache') args.viderCache = true;
        else if (a === '--test') args.test = parseInt(argv[++i] || '30', 10);
        else if (a === '--aide' || a === '-h') args.aide = true;
        else if (!a.startsWith('-') && !args.projet) args.projet = a;
    }
    return args;
}

function aide() {
    console.log(`
  Compilateur de vidéos longues — pistes audio + image fixe → YouTube

  Usage :
    node index.js --projet <nom>            Compile un projet
    node index.js --projet <nom> --test 30  Rend uniquement les 30 premières secondes
    node index.js --projet <nom> --meta-only Régénère description/chapitres SANS ré-encoder
    node index.js --projet <nom> --meta-only --upload  Idem + ré-uploade le MP4 existant
    node index.js --projet <nom> --update   Édite la vidéo DÉJÀ publiée en place (pas de doublon)
    node index.js --projet <nom> --update <id>  Idem en ciblant un ID vidéo précis
    node index.js --tous                    Compile tous les projets prêts
    node index.js --projet <nom> --upload   Compile puis dépose en privé sur YouTube
    node index.js --vider-cache             Vide le cache (.cache/)

  Un projet = un dossier dans projets/ contenant :
    audio/           tes pistes audio (.mp3, .wav, .flac, .m4a…)
    background.jpg   image fixe (vignette + vidéo)
    projet.json      titre, tags, durée cible…

  Premier essai sans aucun média :
    node outils/creer-demo.js
    node index.js --projet exemple-deep-focus --test 30
`);
}

function listerProjets() {
    const dossier = path.join(RACINE, 'projets');
    if (!fs.existsSync(dossier)) return [];
    return fs.readdirSync(dossier, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .filter((nom) => {
            const audio = path.join(dossier, nom, 'audio');
            return fs.existsSync(audio) && fs.readdirSync(audio).length > 0;
        });
}

async function compiler(nomProjet, options) {
    const debut = Date.now();
    const cfg = loadConfig(RACINE, nomProjet);

    if (options.test > 0) {
        cfg._modeTest = options.test;
        log.warn(`Mode TEST : rendu limité aux ${options.test} premières secondes.`);
    }

    console.log(`\n\x1b[1m═══ ${nomProjet} ═══\x1b[0m`);
    log.info(`Cible : ${cfg.video.targetDurationMinutes} min · ${cfg.audio.lufs} LUFS · fondu ${cfg.audio.crossfadeSeconds} s`);

    const pistes = await normaliser(cfg);
    const audio = await monterPlaylist(cfg, pistes);
    const visuel = await preparerBackground(cfg);
    const video = await assembler(cfg, audio, visuel);
    const meta = await genererMetadonnees(cfg, audio, video, { fichier: visuel.background }, pistes);

    if (options.upload || cfg.upload.actif) {
        const { televerser } = require('./src/06-upload');
        await televerser(cfg, video, meta);
    }

    const minutes = ((Date.now() - debut) / 60000).toFixed(1);
    console.log(`\n\x1b[32m\x1b[1m✔ ${nomProjet} terminé en ${minutes} min — ${hms(video.duree)} de vidéo\x1b[0m`);
    console.log(`  ${path.resolve(cfg.dossierSortie)}\n`);

    return { projet: nomProjet, ok: true };
}

// Lit l'ID de la vidéo publiée, tracé localement après un upload.
function lireVideoId(cfg) {
    const f = path.join(cfg.dossierSortie, 'youtube.json');
    if (fs.existsSync(f)) {
        try { return JSON.parse(fs.readFileSync(f, 'utf-8')).videoId || null; } catch (e) { /* ignore */ }
    }
    return null;
}

// Régénère description/recap (et ré-uploade au besoin) à partir du MP4 déjà
// rendu, SANS ré-encoder. Sert à corriger un libellé de chapitre, un titre ou
// une description : le contenu image+audio ne bouge pas, seul le texte change.
async function regenererMeta(nomProjet, options) {
    const debut = Date.now();
    const cfg = loadConfig(RACINE, nomProjet);
    cfg._metaOnly = true;

    const videoFichier = path.join(cfg.dossierSortie, `${nomProjet}.mp4`);
    if (!fs.existsSync(videoFichier)) {
        throw new Error(
            `Aucun MP4 à ré-exploiter : ${videoFichier}\n` +
            `   Lance d'abord un rendu complet (node index.js --projet ${nomProjet}).`
        );
    }
    const dureeVideo = await duration(videoFichier);
    const tailleMo = bytesToMo(fs.statSync(videoFichier).size);
    cfg._dureeExistante = dureeVideo;

    console.log(`\n\x1b[1m═══ ${nomProjet} — métadonnées seules (pas de ré-encodage) ═══\x1b[0m`);
    log.info(`Vidéo existante : ${hms(dureeVideo)} · ${tailleMo} Mo`);

    const pistes = await normaliser(cfg);               // cache → quasi instantané
    const audio = await monterPlaylist(cfg, pistes);    // branche _metaOnly : aucun ffmpeg
    const visuel = await preparerBackground(cfg);
    const video = { fichier: videoFichier, duree: dureeVideo, tailleMo };
    const meta = await genererMetadonnees(cfg, audio, video, { fichier: visuel.background }, pistes);

    if (options.updateId) {
        // Édition en place de la vidéo déjà publiée : aucun ré-upload.
        const id = typeof options.updateId === 'string' ? options.updateId : lireVideoId(cfg);
        if (!id) {
            throw new Error(
                `Aucun ID vidéo : passe --update <id>, ou fais d'abord un upload ` +
                `(qui enregistre l'ID dans output/youtube.json).`
            );
        }
        const { mettreAJourMeta } = require('./src/06-upload');
        await mettreAJourMeta(cfg, id, meta);
    } else if (options.upload || cfg.upload.actif) {
        const { televerser } = require('./src/06-upload');
        await televerser(cfg, video, meta);
    } else {
        log.info(`Description régénérée : ${path.resolve(path.join(cfg.dossierSortie, 'description.txt'))}`);
        log.info('Copie-la dans Studio, ou relance avec --upload pour ré-uploader le MP4 sans ré-encoder.');
    }

    const minutes = ((Date.now() - debut) / 60000).toFixed(1);
    console.log(`\n\x1b[32m\x1b[1m✔ ${nomProjet} — métadonnées régénérées en ${minutes} min (0 ré-encodage)\x1b[0m\n`);
    return { projet: nomProjet, ok: true };
}

async function main() {
    const args = parserArguments(process.argv.slice(2));

    if (args.aide) return aide();

    if (args.viderCache) {
        const cache = path.join(RACINE, '.cache');
        if (fs.existsSync(cache)) {
            fs.rmSync(cache, { recursive: true, force: true });
            log.ok('Cache vidé.');
        } else {
            log.info('Cache déjà vide.');
        }
        return;
    }

    try {
        await checkTools();
    } catch (e) {
        log.err(e.message);
        process.exit(1);
    }

    ensureDir(path.join(RACINE, 'projets'));

    let projets;
    if (args.tous) {
        projets = listerProjets();
        if (projets.length === 0) {
            log.err('Aucun projet prêt dans projets/');
            process.exit(1);
        }
    } else if (args.projet) {
        projets = [args.projet];
    } else {
        aide();
        const dispo = listerProjets();
        if (dispo.length) log.info(`Projets disponibles : ${dispo.join(', ')}`);
        return;
    }

    const resultats = [];
    for (const p of projets) {
        try {
            const metaSeule = args.metaOnly || !!args.updateId;   // --update implique méta seule
            resultats.push(await (metaSeule ? regenererMeta(p, args) : compiler(p, args)));
        } catch (e) {
            log.err(`${p} : ${e.message}`);
            resultats.push({ projet: p, ok: false, erreur: e.message });
            if (!args.tous) process.exitCode = 1;
        }
    }

    if (resultats.length > 1) {
        console.log('\n\x1b[1m═══ Bilan ═══\x1b[0m');
        resultats.forEach((r) => console.log(r.ok ? `  ✔ ${r.projet}` : `  ✘ ${r.projet} — ${r.erreur}`));
    }
}

main().catch((e) => {
    // Message seul par défaut ; la stack complète avec la variable DEBUG=1.
    log.err(process.env.DEBUG ? (e.stack || e.message) : e.message);
    process.exit(1);
});
