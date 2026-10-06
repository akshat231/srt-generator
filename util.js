const path = require('path');
const os = require('os');
const fs = require('fs');
const OpenAI = require('openai');
const https = require('node:https');
const { createReadStream } = require('fs')
const { execFileSync } = require('child_process');
const { basename } = require('node:path');
const { Agent } = require("undici");


require('dotenv').config();
const fileSizeThreshold = process.env.FILE_SIZE_THRESHOLD;

const convertToAudio = async (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const tempDir = path.join(os.tmpdir(), "audio-paths");
            const safePath = filePath.replace(/[<>:"/\\|?*\x00-\x1F-]/g, "_");
            await fs.mkdirSync(tempDir, { recursive: true });
            const outputPath = path.join(tempDir, `output-${safePath}-${timestamp}.wav`);
            const args = ["-y", "-i", filePath, "-c:a", "pcm_s16le", outputPath];
            await execFileSync("ffmpeg", args);
            return outputPath;
        }
        throw new Error('Invalid Path')
    } catch (error) {
        throw error;
    }
};


const splitAudio = async (filePath) => {
    try {
        const fileSize = await fs.statSync(filePath).size;
        const fileSizeThresholdInMb = fileSizeThreshold * 1024 * 1024;
        if (fileSize <= fileSizeThresholdInMb) {
            return [filePath];
        }
        const filename = path.parse(filePath).name;
        const tempDir = path.join(os.tmpdir(), "audio-paths");
        const outputDir = path.join(tempDir, "chunks", filename);
        await fs.mkdirSync(outputDir, { recursive: true });
        const args = [
            "-i", filePath,
            "-f", "segment",
            "-segment_time", process.env.SPLIT_LENGTH,
            "-c", "copy",
            path.join(outputDir, `${filename}_%03d.wav`)
        ];
        await execFileSync("ffmpeg", args);
        const chunkPaths = fs.readdirSync(outputDir)
            .filter(f => f.endsWith(".wav"))
            .sort()
            .map(f => path.join(outputDir, f));
        return chunkPaths;
    } catch (error) {
        throw error;
    }
}


const getOpenAIClient = async () => {
    try {
        const dispatcher = new Agent({
            keepAliveTimeout: 10_000,
            keepAliveMaxTimeout: 60_000,
            headersTimeout: 15 * 60 * 1000,
            bodyTimeout: 15 * 60 * 1000,
            connectTimeout: 60 * 1000,
        });

        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,

            fetchOptions: {
                dispatcher,
            },

            maxRetries: 3,
            timeout: 15 * 60 * 1000,
        });

        return openaiClient;
    } catch (error) {
        throw error;
    }
};

const transcribeAudioToSRT = async (filePath) => {
    try {
        const client = await getOpenAIClient();

        const response = await client.audio.transcriptions.create({
            model: process.env.OPENAI_WHISPER_MODEL,
            file: createReadStream(filePath),
            response_format: 'srt',
        });

        return response;
    } catch (error) {
        throw error;
    }
};


const srtTimestampToMs = (h, m, s, ms) => {
    return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(ms);
};

const msToSrtTimestamp = (totalMs) => {
    if (totalMs < 0) totalMs = 0;
    const ms = Math.floor(totalMs % 1000);
    const totalSeconds = Math.floor(totalMs / 1000);
    const s = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const m = totalMinutes % 60;
    const h = Math.floor(totalMinutes / 60);
    const pad = (n, len) => String(n).padStart(len, '0');
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
};

const shiftSrtTimestampLine = (line, offsetMs) => {
    const re = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    const match = line.match(re);
    if (!match) {
        return line;
    }
    const startMs = srtTimestampToMs(match[1], match[2], match[3], match[4]);
    const endMs = srtTimestampToMs(match[5], match[6], match[7], match[8]);
    return `${msToSrtTimestamp(startMs + offsetMs)} --> ${msToSrtTimestamp(endMs + offsetMs)}`;
};

const mergeSrtFiles = (srtParts, segmentTimeSec = process.env.SPLIT_LENGTH) => {
    let subtitleNumber = 1;
    const merged = [];

    for (let i = 0; i < srtParts.length; i++) {
        const srt = srtParts[i];
        if (!srt || !srt.trim()) {
            continue;
        }
        const offsetMs = i * segmentTimeSec * 1000;
        const blocks = srt
            .trim()
            .split(/\r?\n\r?\n/);

        for (const block of blocks) {
            const lines = block.split(/\r?\n/);

            if (lines.length < 2) {
                continue;
            }

            // Shift timestamps (expected on lines[1]), then renumber
            lines[1] = shiftSrtTimestampLine(lines[1], offsetMs);
            lines[0] = String(subtitleNumber++);

            merged.push(lines.join('\n'));
        }
    }

    return merged.length ? merged.join('\n\n') + '\n' : '';
};


const getSRTDirectoryName = async (inputPath) => {
    try {
        const outputDir = path.dirname(inputPath);
        const fileBase = path.basename(
            inputPath,
            path.extname(inputPath)
        );
        fs.mkdirSync(path.join(outputDir, fileBase), { recursive: true });
        return path.join(outputDir, fileBase);
    } catch (error) {
        throw error;
    }
}

const saveSRTFile = async (srtDirectoryName, chunkPath, srt) => {
    try {
        const chunkBaseName = path.basename(
            chunkPath,
            path.extname(chunkPath)
        );
        const chunkSrtPath = path.join(
            srtDirectoryName,
            `${chunkBaseName}.srt`
        );
        fs.writeFileSync(
            chunkSrtPath,
            srt,
            'utf8'
        );
        return chunkSrtPath;
    } catch (error) {
        throw error;
    }
}

const saveFinalSRT = async (inputPath, mergedSRT) => {
    try {
        const outputDir = path.dirname(inputPath);

        const fileBase = path.basename(
            inputPath,
            path.extname(inputPath)
        );

        const finalSrtPath = path.join(
            outputDir,
            `${fileBase}.srt`
        );
        fs.writeFileSync(
            finalSrtPath,
            mergedSRT,
            'utf8'
        );
        return finalSrtPath;
    } catch (error) {
        throw error;
    }
}

module.exports = {
    convertToAudio,
    splitAudio,
    transcribeAudioToSRT,
    mergeSrtFiles,
    getSRTDirectoryName,
    saveSRTFile,
    saveFinalSRT
}