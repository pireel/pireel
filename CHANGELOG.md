# Changelog

What changed in the open-source editor and on [pireel.com](https://pireel.com), month by month. [简体中文](CHANGELOG.zh-CN.md)

## [v2026.11](https://github.com/pireel/pireel/releases/tag/v2026.11) (2026-11-09)

November: long videos cut into shorts, every scene started from one box on the Studio home and finished on the server, captions that read like finished subtitles, and 24 new transitions.

#### Open-source editor (this repository)

- **Captions that read as finished.** A caption holds whole clauses. Chinese captions break at Chinese punctuation and never inside a title or a quote. Dictionary words stay whole, a partly cut row keeps only the words still heard, and a backing plate fades in with its words.
- **Transitions.** Cuts and transitions play smoothly in preview, transitions snap onto cuts, and 24 new effects are added.
- **Montages by plan.** `plan_montage` lays out a montage's picture from a plan, picture can be laid to a voice-over, and every edit mode picks an opening hook.
- **Several people in one frame.** Faces can carry who they are, several people are read per frame, and framed picture layers stay framed in preview.
- **Agents finish the job.** `finish_edit` reports every remaining problem at once and runs the enabled cover; an external agent can save a Skill from its finished edit.
- **Timing you can trust.** Trims and splits keep their zoom frames, a new in-point on the story spine moves time at the clip's head, sounds shorter than 0.2 s play whole, and every source span a cut removes is reported where it left.
- **A tidier timeline.** Compact by default, square filmstrip tiles, the cover at the head of the timeline, and icons for transitions.
- **Multi-select controls.** `SimpleMultiSelect`, and `SceneMultiSelect` for settings rows.
- **Faster, lighter media.** Audio and video decoders close when a mix or track is done; loudness is measured on the mix the export actually encodes.

#### Pireel.com

- **[Long video to shorts](https://pireel.com/en/long-video-to-shorts).** Upload a lecture, livestream or podcast and get several vertical shorts at the lengths you pick, cut on clean sentence ends with captions. With several people on screen, each short knows who is speaking and frames them: follow the speaker, split top and bottom, or keep the whole picture.
- **One box on the Studio home.** AI Captions, Video Dubbing, Picture in picture, Auto SFX, AI Eraser, Long to Shorts, AI Image and AI Video all start from the same box. Drop a video in, pick the settings, press Generate.
- **Results finish without the page open.** Captions, one-click edits, B-roll, picture in picture and sound effects run on the server, so you can close the tab and come back to a finished project.
- **Transcripts know who speaks.**
- **[Claude video editing skills](https://pireel.com/en/claude-video-editing-skills).** A gallery of creative edit skills for Claude Code, each with a finished example video.
- **New homepage: "You talk. Pireel edits."** with a step-by-step walkthrough of an edit, and real Studio exports in the example reel.
- **Tool pages rewritten** around what you upload and what you get back, with each tool's box at the top of its page.
- **[Pricing](https://pireel.com/en/pricing)** lists what each plan includes, and member features are marked in the editor.
- **Agent plugin 0.7.23**: imports reuse a video already in the library, dropped uploads retry, and the import helper can write a local transcript without uploading.

## [v2026.10](https://github.com/pireel/pireel/releases/tag/v2026.10) (2026-10-29)

October: brands that learn a creator's editing style from their own videos, a one-click edit that follows it, picture in picture, export to Premiere Pro, DaVinci Resolve and Final Cut Pro, and scenes that keep running after you close the page.

#### Open-source editor (this repository)

- **Export for other editors.** One package with the timeline as XML for Premiere Pro, DaVinci Resolve and Final Cut Pro, plus the media, transparent graphics and subtitles.
- **Brands replace themes.** A project carries the creator's brand (captions, fonts, graphics, picture and cover habits) and the agent edits by it. The 25 fixed themes are retired.
- **Picture in picture.** Footage-on-top and footage-below halves, tiled groups of shots, layouts that ease in and out, and the speaker reframed per shot. Bottom-corner windows stay above the captions.
- **Reframing fills the frame.** Empty bands around a reframed source are filled with its own blurred picture.
- **Captions.** Gaps filled, lines broken by phrase, highlights picked in one pass, single-line artistic captions, and captions re-laid when their size or look changes.
- **Shared controls.** Every choice, menu, confirmation and media viewer is built on one set of `@pireel/ui` controls.
- **Credits on the button.** Each generation shows what it costs before you press it.
- **Host-owned surfaces.** Hosts can add their own entries, top-bar account controls and material preparation to the editor without forking it.
- **Clearer failures.** Failed generations say what went wrong, and the agent is told exactly what a refused step needs instead of retrying blind.

#### Pireel.com

- **My Brand.** Paste a link to one of your videos (YouTube, TikTok, Douyin, Bilibili, Xiaohongshu or Kuaishou). Pireel reads your captions, fonts, graphics, B-roll and cover style, and writes them down as a brand you can edit.
- **One-click edit.** Drop a raw recording into the Studio home and it comes back cut, captioned and dressed in your brand.
- **Picture in picture.** Lay your footage or AI-made stills beside the speaker, with a layout picked for each shot.
- **Covers** written and designed from your brand, with the headline taken from the new video.
- **Video Dubbing** writes, voices and times the dub phrase by phrase; edit one line and only that line is voiced again. Lip sync is back for single-speaker videos.
- **Scenes run on the server.** Start a dubbing job, close the page, and come back to the result.
- **AI Eraser** keeps results on the server, takes several boxes and lets you pick the output size.
- **Auto SFX** uses the full Earshot sound bank, aims at an approximate number of sounds, and lets you swap any sound.
- **Credits are shown on each button** before you generate.
- **[CapCut alternative](https://pireel.com/en/capcut-alternative)** page with an interactive comparison.

## [v2026.09](https://github.com/pireel/pireel/releases/tag/v2026.09) (2026-09-30)

September: ready-made scenes for the jobs creators do most (captions, dubbing, sound effects, B-roll, erasing burned-in text), word masks, better fonts and denoise, and a rebuilt agent tool surface.

#### Open-source editor (this repository)

- **Word masks.** Bleep or mute a spoken word and cover it in the captions without cutting the video. Masks follow the voice's real onset and decay.
- **Captions built around the transcript.** Caption styling and animated looks, sentence-level translation written back line by line, captions pinned above every B-roll lane, and caption position set by dragging in the preview.
- **Fonts.** Google Fonts in the font picker, a library of Chinese, Japanese and Korean display faces paired with Latin fonts, and a caption font picker with previews.
- **Denoise.** A light mode that keeps room tone, and a strong mode (DeepFilterNet3, running in the browser).
- **Speed that keeps the pitch.** Speed up or slow down a clip without changing the voice.
- **Push-ins.** Animated zoom presets on video clips.
- **Generation in the chat.** Images, video, music and sound effects are generated from the chat composer, and results land in the project's media.
- **Motion graphics.** A library-first component panel with a labelled properties inspector, timing edited on the timeline, and a tool that bakes a component to a transparent overlay.
- **Whiteboard explainers.** `set_whiteboard` draws charts, timelines, cycles, Venn diagrams, code, formulas and freehand sketches that reveal in time with the narration.
- **Agent tool surface v3.** One set of tools for the in-app chat and MCP, with schemas taken from the engine, document-level change reports, and one undo step per agent turn. Includes `mask_words`, `generate_sfx` and `remove_words`.
- **Preview engine.** Every video layer decodes with WebCodecs in the page, and previews mount in the page instead of iframes.

#### Pireel.com

- **[AI Captions](https://pireel.com/en/ai-caption-generator).** Upload a video and get animated captions, with bilingual captions and earlier versions kept.
- **[Video Dubbing](https://pireel.com/en/ai-video-translator).** Translate a video into another language with a new voice for each speaker, and optional lip sync.
- **[AI Eraser](https://pireel.com/en/remove-subtitles-from-video).** Remove burned-in subtitles and text from your own footage.
- **[Auto SFX](https://pireel.com/en/add-sound-effects-to-video).** Sound effects placed on the moments that need them, from a short-video sound pack, mixed to a steady loudness.
- **[AI B-Roll](https://pireel.com/en/ai-b-roll-generator).** B-roll matched to what you say, starting on the word it illustrates.
- **[AI Image](https://pireel.com/en/ai-image-generator) and [AI Video](https://pireel.com/en/ai-video-generator)** pages, each with its own history. GPT Image is the default image model; Seedance 2.5 and MiniMax H3 join the video models.
- **Personal brand kits** to keep a creator's captions and colours the same across videos.
- **Large uploads** go up in parts and resume after a dropped connection.

## [v2026.08](https://github.com/pireel/pireel/releases/tag/v2026.08) (2026-08-31)

August: one document model under every edit, a multi-track timeline, Skills written from a conversation, and voice generation.

#### Open-source editor (this repository)

- **One document behind every edit.** The timeline, captions, overlays and audio now live in a single project document, and every change (from the UI, the chat agent or an external agent) is a command on that document. Undo, autosave and agent receipts all read from the same place.
- **Multi-track editing.** Any number of video, image, graphics and audio lanes, stacked in one order across preview and export, with clip editing on every lane.
- **Local-first assets.** Import a folder (subfolders included), keep media on your device, and see which clips are missing their source.
- **Search your media in plain words.** Natural-language search over the project library and inside footage.
- **Stock footage and music** from online libraries, with the source of every imported file recorded.
- **Skills.** Create a Skill from a chat conversation, give it an icon, and pick it from the chat composer. A Skill can pause and ask the user before a large edit.
- **Scenario workflows with multiple outputs**, for example several cuts of one recording.
- **Voice tools.** Speech and voice tools for agents, including designed custom voices.
- **Constant speed changes** on video clips, and native editing of on-screen text.

#### Pireel.com

- **Voice generation.** Turn a script into narration, or design a custom voice.
- **Stock search.** Find stock footage and music without leaving the editor.
- **Large edits wait for approval.** The agent shows its editing plan first and goes ahead when you say so.
- **A new editorial look** for the site and the Studio, with dark artwork on the landing page.
- **Tutorials and workflow guides** added to the blog.

## [v2026.07](https://github.com/pireel/pireel/releases/tag/v2026.07) (2026-07-31)

The first public release of Pireel Studio: an AI video editor for talking-head videos, built so a person and an AI agent can edit the same timeline. This repository holds the editor; [pireel.com](https://pireel.com) runs it as a hosted service.

#### Open-source editor (this repository)

- **Open-sourced on July 21, 2026.** The full editor runs locally with no backend: canvas, multi-track timeline, transcript, captions, assets and export, under AGPL-3.0. Shared UI components are MIT.
- **Edit by transcript.** Click a word to jump to it. Delete words and pauses from the script and the cut follows. Mid-sentence stalls count as pauses too, and pauses are tightened rather than removed.
- **Captions.** Fixed caption cues with word segmentation for Chinese, Japanese and other languages, per-line styling, and a bilingual translation line under the main caption.
- **Audio.** Multi-track audio with waveforms, fades, per-clip mute and solo, gain up to +20 dB, a background music bed that ducks under speech, and narration denoise.
- **Framing.** Split-screen and half-frame layouts that follow the canvas orientation, plus per-shot volume.
- **Components.** A library of motion-graphic components (lower thirds, titles, lists) with a properties panel, plus 25 visual themes.
- **Agent tools.** The editor exposes its editing operations as tools, so the built-in chat agent and external agents (Claude Code, Codex) edit through the same calls. Every edit returns a receipt describing what changed.
- **Export.** In-browser export, with a local export target for agent-driven browsers.

#### Pireel.com

- **Connect an agent.** Claude Code and Codex can edit a Pireel project over MCP with the [agent plugin](https://github.com/pireel/pireel-agent); an agent can hand its browser a one-time sign-in link.
- **Transitions.** Real cut transitions (push, slide, scale, spin, flip and more) rendered with WebGL shaders.
- **Bilingual captions.** Translate captions and edit both lines in place.
- **Music generation** from a description, placed straight onto the music lane.
- **Projects in the cloud.** Refresh or switch devices and the project and chat are still there.
- **Export** at up to 4K, with resolution, frame rate and format choices.
- **Light and dark themes** across the site.
- **Blog and guides** on editing talking-head videos at [pireel.com/en/blog](https://pireel.com/en/blog).

Before July, pireel.com ran an AI image and video generation workspace (April to June 2026), which grew a timeline editor and one-click captions in June.
