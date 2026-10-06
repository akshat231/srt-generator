# SRT Generator

Generate `.srt` subtitles from any video/audio file using OpenAI Whisper (`whisper-1`) + `ffmpeg`.

How it works:
1. Converts input video/audio to WAV via `ffmpeg`
2. If file > `FILE_SIZE_THRESHOLD` (MB), splits it into `SPLIT_LENGTH`-second chunks
3. Transcribes each chunk with OpenAI `audio.transcriptions` (`response_format: 'srt'`)
4. Shifts timestamps per chunk offset, renumbers, and merges into one final `.srt`

## Prerequisites

- Node.js 18+
- `ffmpeg` installed and on `PATH`
  ```bash
  ffmpeg -version
  # Ubuntu/Debian: sudo apt install ffmpeg
  # macOS: brew install ffmpeg
  ```
- An OpenAI API key

## Setup

```bash
git clone <your-repo-url>
cd srt-generator
npm install
cp .env.example .env
# then edit .env and set OPENAI_API_KEY
```

`.env` config:

| Var | Description | Default / Example |
|-----|-------------|-------------------|
| `OPENAI_API_KEY` | OpenAI API key (required) | `sk-...` |
| `OPENAI_WHISPER_MODEL` | Whisper model | `whisper-1` |
| `FILE_SIZE_THRESHOLD` | Split threshold in MB | `15` |
| `SPLIT_LENGTH` | Chunk length in seconds for `ffmpeg -segment_time` | `60` |


## Usage

```bash
node index.js --file ./video.mp4
node index.js --file "/path/to/video.mp4"
```

Output:
- Per-chunk SRTs: `<input-dir>/<input-basename>/<chunk>.srt`
- Final merged SRT: `<input-dir>/<input-basename>.srt`
- Temp audio goes to `os.tmpdir()/audio-paths/` (auto-created)

Example:
```
Input:  ./my-video.mp4
Output: ./my-video.srt
Chunks: ./my-video/output-..._000.srt, ..._001.srt, ...
```

## Scripts

```bash
npm install   # install deps (dotenv, openai, undici)
```


## Project Structure

```
.
├── index.js       # CLI entry: --file <path> -> convert -> split -> transcribe -> merge
├── util.js        # ffmpeg + OpenAI + SRT merge/shift helpers
├── package.json
├── .env.example   # safe template to copy to .env
└── .gitignore
```

## License

MIT
