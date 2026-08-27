import asyncio
import pathlib

import edge_tts


PROJECT = pathlib.Path(__file__).resolve().parents[1]


async def main() -> None:
    text_path = PROJECT / "public" / "audio" / "voiceover-script.txt"
    output_path = PROJECT / "public" / "audio" / "voiceover-v2.mp3"
    metadata_path = PROJECT / "public" / "audio" / "voiceover-word-boundaries-v2.jsonl"
    temporary_output = output_path.with_suffix(".pending.mp3")
    temporary_metadata = metadata_path.with_suffix(".pending.jsonl")
    text = text_path.read_text(encoding="utf-8")
    communicate = edge_tts.Communicate(
        text=text,
        voice="en-US-AndrewNeural",
        rate="+7%",
        pitch="-2Hz",
        volume="+0%",
    )
    await communicate.save(str(temporary_output), str(temporary_metadata))
    temporary_output.replace(output_path)
    temporary_metadata.replace(metadata_path)
    print(output_path)


if __name__ == "__main__":
    asyncio.run(main())
