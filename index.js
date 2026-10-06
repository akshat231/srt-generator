const { convertToAudio,
        splitAudio,
        transcribeAudioToSRT,
        mergeSrtFiles,
        getSRTDirectoryName ,
        saveSRTFile,
        saveFinalSRT,
    } = require('./util');
const path = require('path');
const fs = require('fs');



const main = async () => {
    try {
        const args = process.argv.slice(2);
        if (args[0] !== '--file' || !args[1]) {
            printUsage();
            return;
        }
        const inputPath = args[1];
        console.log('Converting video to audio...');
        const audioPath = await convertToAudio(inputPath);
        console.log(`Audio file: ${audioPath}`);

        console.log('Checking/splitting audio...');
        const splitPaths = await splitAudio(audioPath);

        if (!splitPaths || splitPaths.length === 0) {
            console.log('No Audio Path Exist');
            return;
        }

        const srtDirectoryName = await getSRTDirectoryName(inputPath);
        console.log(`Found ${splitPaths.length} audio chunks.`);
        const srtParts = [];

        for (let i = 0; i < splitPaths.length; i++) {
            const chunkPath = splitPaths[i];
            console.log(
                `Transcribing chunk ${i + 1}/${splitPaths.length}: ${chunkPath}`
            );

            const srt = await transcribeAudioToSRT(chunkPath);
            const chunkSrtPath = await saveSRTFile(srtDirectoryName, chunkPath, srt);
            console.log(`Chunk SRT saved: ${chunkSrtPath}`);
            srtParts.push(srt);
        }

        const mergedSrt = mergeSrtFiles(srtParts);
        const finalSrtPath = await saveFinalSRT(inputPath, mergedSrt)
        console.log(`Final SRT saved: ${finalSrtPath}`);

    } catch (error) {
        console.error('Error occurred:', error);
        process.exitCode = 1;
    }
};

const printUsage = () => {
    try {
        console.log(`
Usage:
  node index.js --file <path>

Options:
  --file <path>    Video/audio file to transcribe

Examples:
  node app.js --file ./video.mp4
  node app.js --file "/path/to/video.mp4"
`);

        process.exit(1);
    } catch (error) {
        console.error('Error occurred:', error);
        process.exit(1);
    }
};



main();