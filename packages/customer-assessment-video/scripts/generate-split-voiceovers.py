import asyncio
from pathlib import Path

import edge_tts


PROJECT = Path(__file__).resolve().parents[1]


async def generate(name: str) -> None:
    audio_dir = PROJECT / "public" / "audio"
    text_path = audio_dir / f"{name}-script.txt"
    output_path = audio_dir / f"{name}.mp3"
    metadata_path = audio_dir / f"{name}-word-boundaries.jsonl"
    pending_audio = output_path.with_suffix(".pending.mp3")
    pending_metadata = metadata_path.with_suffix(".pending.jsonl")

    communicate = edge_tts.Communicate(
        text=text_path.read_text(encoding="utf-8"),
        voice="en-US-GuyNeural",
        rate="-4%",
        pitch="-2Hz",
        volume="+0%",
    )
    await communicate.save(str(pending_audio), str(pending_metadata))
    pending_audio.replace(output_path)
    pending_metadata.replace(metadata_path)
    print(output_path)


async def main() -> None:
    await generate("data-preparation-guide")
    await generate("assessment-overview")


if __name__ == "__main__":
    asyncio.run(main())
