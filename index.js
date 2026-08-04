#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./src/config');
const { log, checkTools, hms, ensureDir } = require('./src/utils');
const { normaliser } = require('./src/01-normalize');
const { monterPlaylist } = require('./src/02-playlist');
const { preparerNowPlaying } = require('./src/03-nowplaying');
const { assembler } = require('./src/04-assemble');
const { genererMetadonnees } = require('./src/05-metadata');

const RACINE = __dirname;

function parserArguments(argv) {
    const args = { projet: null, tous: false, upload: false, viderCache: false, test: 0 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--projet' || a === '-p') args.projet = argv[++i];
        else if (a === '--tous' || a === '--all') args.tous = true;
        else if (a === '--upload') args.upload = true;
        else if (a === '--vider-cache') args.viderCache = true;
        else if (a === '--test') args.test = parseInt(argv[++i] || '30', 10);
        else if (a === '--aide' || a === '-h') args.aide = true;
        else if (!a.startsWith('-') && !args.projet) args.projet = a;
    }
    return args;
}

function aide() {
    console.log(`
  Compilateur de vidéos longues — Suno → YouTube (mode "Now Playing")

  Usage :
    node index.js --projet <nom>            Compile un projet
    node index.js --projet <nom> --test 30  Rend uniquement les 30 premières secondes
    node index.js --tous                    Compile tous les projets prêts
    node index.js --projet <nom> --upload   Compile puis dépose en privé sur YouTube
    node index.js --vider-cache             Vide le cache (.cache/)

  Un projet = un dossier dans projets/ contenant :
    audio/           les pistes téléchargées depuis Suno
    pochettes/       une image par piste (même nom que l'audio, .jpg/.png)
    projet.json      titre, tags, citations, durée cible…
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
    const visuel = await preparerNowPlaying(cfg, audio.tracklist);
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
            resultats.push(await compiler(p, args));
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
    log.err(e.stack || e.message);
    process.exit(1);
});
