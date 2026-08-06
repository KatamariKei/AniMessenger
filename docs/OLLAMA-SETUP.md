# Ollama model setup

AniMessenger uses Ollama for three related jobs:

- **Chat** writes character replies and maintains the immediate conversation.
- **Profile** builds a character's researched personality, voice, history, and visual identity the first time that character is added.
- **Vision** examines photos attached by the user so the character can react to what is actually visible.

One vision-capable model can do all three jobs. That is the recommended first-run setup. **AniMessenger recommends the Gemma 4 family for the best overall experience**, while continuing to support other compatible Ollama models.

## Recommended setup

1. Install and start [Ollama](https://ollama.com/).
2. Open Windows **Command Prompt**. PowerShell and Windows Terminal also work.
3. Copy and paste this command:

   ```bat
   ollama pull gemma4:12b
   ```

4. Wait for the download to finish.
5. Start AniMessenger or return to its guided setup.
6. Select **Check connections again**.
7. Choose `gemma4:12b` for Chat, leave Profile on **Same as chat**, and choose `gemma4:12b` for Vision.

Gemma 4 12B is the default recommendation because it balances conversational quality, speed, memory use, and image understanding. A larger model can be more capable in some situations, but it is not automatically a better character performer and will usually use more memory.

## Choose by GPU memory

The download size is not the model's complete runtime memory requirement. Ollama also needs memory for conversation context and working buffers. These recommendations leave some headroom, but every computer is different.

### CPU only or up to 10 GB VRAM

Use the E2B QAT model:

```bat
ollama pull gemma4:e2b-it-qat
```

Its download is approximately 4.3 GB. It supports attached photos and is the most forgiving Gemma 4 option in this guide. Expect less reliable characterization, memory integration, and structured profile building than the 12B model.

### 12-23 GB VRAM - recommended starting range

Use the 12B model:

```bat
ollama pull gemma4:12b
```

Its download is approximately 7.6 GB. This is AniMessenger's recommended default. Around 12 GB can work, while 16 GB or more provides additional breathing room for conversation context and other GPU activity.

### 24 GB VRAM or more

Use the 26B A4B QAT model:

```bat
ollama pull gemma4:26b-a4b-it-qat
```

Its download is approximately 16 GB. This is a mixture-of-experts model with 25.2B total parameters and about 3.8B active parameters per token, giving it more capacity without the inference cost of a similarly sized dense model. It supports both text and images.

The dense `gemma4:31b` is another high-end option, but it is more demanding and may be slower. For AniMessenger, test the 26B A4B model first.

## Useful commands

Show installed models:

```bat
ollama ls
```

Download or repair the recommended model:

```bat
ollama pull gemma4:12b
```

Test it directly:

```bat
ollama run gemma4:12b
```

Stop a loaded model and release its memory:

```bat
ollama stop gemma4:12b
```

Remove a model you no longer want:

```bat
ollama rm gemma4:12b
```

## If AniMessenger does not see the model

1. Confirm Ollama is running.
2. Run `ollama ls` and verify the model appears.
3. In AniMessenger's guided setup, select **Check connections again**.
4. If Ollama still appears offline, open AniMessenger Settings and confirm the Ollama URL is `http://127.0.0.1:11434`.
5. Restart Ollama, then check again.

AniMessenger only labels a model as photo-capable when the installed Ollama instance reports vision support. If a model appears under Chat but not Vision, update Ollama or choose a model that explicitly supports image input.

## Performance notes

- Do not install every size unless you want to compare them. One model is enough.
- Start with 12B when unsure. Move down to E2B if responses are too slow or the desktop hitches.
- Running ComfyUI image generation and Ollama inference simultaneously increases GPU-memory pressure.
- A very large context setting uses additional memory. More context is not always helpful if it makes the whole computer sluggish.
- Windows may spill model data into shared system memory when VRAM fills. This can keep a model running, but often makes it dramatically slower.

Official references:

- [Ollama CLI commands](https://docs.ollama.com/cli)
- [Gemma 4 model sizes and image support](https://ollama.com/library/gemma4)
- [Google Gemma 4 model overview](https://ai.google.dev/gemma/docs/core)
