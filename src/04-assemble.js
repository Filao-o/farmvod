'use strict';

const fs = require('fs');
const path = require('path');
const { ffmpeg, log, ensureDir, hms, bytesToMo, progressReporter, duration } = require('./utils');
const { construireFiltreNowPlaying } = require('./04-nowplaying-filter');

async function verifierCodec(codec) {
    if (codec !== 'nvenc' && codec !== 'h264_nvenc') return;
    const { execSync } = require('child_process');
    let dispo = '';
    try {
        dispo = execSync('ffmpeg -hide_banner -encoders', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    } catch (e) { /* ignoré */ }
    if (!dispo.includes('h264_nvenc')) {
        throw new Error(
            'Encodeur NVENC introuvable. Vérifie :\n' +
            '   - carte NVIDIA compatible (GTX 10xx ou plus récent) ;\n' +
            '   - pilotes NVIDIA à jour ;\n' +
            '   - FFmpeg installé via winget/Gyan (support NVENC intégré).\n' +
            '   Test dans un terminal :  ffmpeg -encoders | findstr nvenc'
        );
    }
}

function paramsCodec(codec, cfg) {
    if (codec === 'nvenc' || codec === 'h264_nvenc') {
        const table = {
            ultrafast: 'p1', superfast: 'p2', veryfast: 'p3', faster: 'p4',
            fast: 'p5', medium: 'p6', slow: 'p7', slower: 'p7', veryslow: 'p7',
        };
        const preset = table[cfg.video.preset] || 'p5';
        return [
            '-c:v', 'h264_nvenc',
            '-preset', preset,
            '-tune', 'hq',
            '-rc', 'vbr',
            '-cq', String(cfg.video.crf),
            '-b:v', '0',
            '-spatial_aq', '1',
        ];
    }
    return [
        '-c:v', 'libx264',
        '-preset', cfg.video.preset,
        '-crf', String(cfg.video.crf),
    ];
}

async function assembler(cfg, audio, visuel) {
    log.step('Étape 4/5 — Assemblage final');

    const codec = (cfg.video.codec || 'libx264').toLowerCase();
    await verifierCodec(codec);

    ensureDir(cfg.dossierSortie);
    const sortie = path.join(cfg.dossierSortie, `${cfg.nom}.mp4`);
    if (fs.existsSync(sortie)) fs.unlinkSync(sortie);

    const dureeTotale = cfg._modeTest ? Math.min(audio.duree, cfg._modeTest) : audio.duree;

    // Ajuster les citations à la durée réelle
    const citationsActives = visuel.citations
        .filter((c) => c.debut < dureeTotale)
        .map((c) => ({ ...c, fin: Math.min(c.fin, dureeTotale) }));

    log.info(`Cible : ${hms(dureeTotale)} — ${citationsActives.length} citation(s)`);

    cfg._masterAudio = audio.master;
    cfg._backgroundImage = visuel.background;
    cfg._barBg = visuel.barBg;
    cfg._barFill = visuel.barFill;
    const { filter, inputs, mapVideo } = construireFiltreNowPlaying(cfg, dureeTotale, citationsActives);

    // Sauvegarde du filter graph pour debug
    const filterFile = path.join(cfg.dossierSortie, `${cfg.nom}.filter.txt`);
    fs.writeFileSync(filterFile, filter, 'utf-8');
    log.info(`Filter graph sauvegardé : ${path.basename(filterFile)} (${filter.length} caractères)`);

    const filterScript = path.join(cfg.cache, `filter_${cfg.nom}_${Date.now()}.txt`);
    ensureDir(path.dirname(filterScript));
    fs.writeFileSync(filterScript, filter, 'utf-8');

    const args = [
        '-y',
        '-threads', '0',
        ...inputs,
        '-filter_complex_script', filterScript,
        '-map', mapVideo,
        '-map', '0:a:0',
        ...paramsCodec(codec, cfg),
        '-c:a', 'aac',
        '-b:a', cfg.audio.bitrate,
        '-ar', String(cfg.audio.sampleRate),
        '-ac', '2',
        '-t', dureeTotale.toFixed(3),
        '-movflags', '+faststart',
        sortie,
    ];

    const debut = Date.now();
    try {
        await ffmpeg(args, { onStderr: progressReporter('Encodage', dureeTotale) });
    } finally {
        if (fs.existsSync(filterScript)) fs.unlinkSync(filterScript);
    }
    process.stdout.write('\n');

    const minutes = ((Date.now() - debut) / 60000).toFixed(1);
    const taille = fs.statSync(sortie).size;
    const dureeFinale = await duration(sortie);

    log.ok(`Vidéo générée en ${minutes} min — ${bytesToMo(taille)} Mo`);
    log.info(path.resolve(sortie));

    return { fichier: sortie, duree: dureeFinale, tailleMo: bytesToMo(taille) };
}

module.exports = { assembler };
