'use strict';

const fs = require('fs');
const path = require('path');
const { ffmpeg, log, ensureDir, hms, bytesToMo, progressReporter, duration } = require('./utils');

async function verifierCodec(codec) {
    if (codec !== 'nvenc' && codec !== 'h264_nvenc') return codec;
    const { execSync } = require('child_process');
    let dispo = '';
    try {
        dispo = execSync('ffmpeg -hide_banner -encoders', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    } catch (e) { /* ignoré */ }
    if (!dispo.includes('h264_nvenc')) {
        log.warn('NVENC non disponible — fallback automatique vers libx264 (encodage CPU).');
        return 'libx264';
    }
    return codec;
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
    log.step('Étape 4/5 — Assemblage final (image fixe + audio)');

    const codec = await verifierCodec((cfg.video.codec || 'libx264').toLowerCase());

    ensureDir(cfg.dossierSortie);
    const sortie = path.join(cfg.dossierSortie, `${cfg.nom}.mp4`);
    if (fs.existsSync(sortie)) fs.unlinkSync(sortie);

    const dureeTotale = cfg._modeTest ? Math.min(audio.duree, cfg._modeTest) : audio.duree;
    const W = cfg.video.upscaleTo4k ? 3840 : 1920;
    const H = cfg.video.upscaleTo4k ? 2160 : 1080;

    log.info(`Cible : ${hms(dureeTotale)} — image fixe ${W}×${H}`);

    const args = [
        '-y',
        '-loop', '1',
        '-framerate', String(cfg.video.fps),
        '-i', visuel.background,
        '-i', audio.master,
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p`,
        '-shortest',
        ...paramsCodec(codec, cfg),
        '-g', String(cfg.video.fps * cfg.video.gopSeconds),
        '-c:a', 'aac',
        '-b:a', cfg.audio.bitrate,
        '-ar', String(cfg.audio.sampleRate),
        '-ac', '2',
        '-t', dureeTotale.toFixed(3),
        '-movflags', '+faststart',
        sortie,
    ];

    const debut = Date.now();
    await ffmpeg(args, { onStderr: progressReporter('Encodage', dureeTotale) });
    process.stdout.write('\n');

    const minutes = ((Date.now() - debut) / 60000).toFixed(1);
    const taille = fs.statSync(sortie).size;
    const dureeFinale = await duration(sortie);

    log.ok(`Vidéo générée en ${minutes} min — ${bytesToMo(taille)} Mo`);
    log.info(path.resolve(sortie));

    return { fichier: sortie, duree: dureeFinale, tailleMo: bytesToMo(taille) };
}

module.exports = { assembler };
