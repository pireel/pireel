import type { GenTemplate } from './types';

/** Video templates: self-authored talking-head B-roll / camera-move / cutaway / mood prompts.
 *  With a finished preview clip, video holds the bare R2 key (card loops it); otherwise the title fills the card. */
export const VIDEO_TEMPLATES: GenTemplate[] = [
  {
    id: 'v01',
    category: 'chatGen.cameraMoves',
    title: 'chatGen.slowPushCloseUp',
    prompt: `Slow cinematic push-in on a single subject, shallow depth of field, soft natural window light, gentle handheld micro-movement, moody film-grade color, 4k, smooth motion.`,
  },
  {
    id: 'v02',
    category: 'chatGen.cameraMoves',
    title: 'chatGen.productOrbitShot',
    prompt: `Smooth 180-degree orbit around a product on a clean pedestal, studio softbox lighting, subtle reflections, slow rotation, premium commercial look, seamless motion.`,
  },
  {
    id: 'v03',
    category: 'chatGen.cameraMoves',
    title: 'chatGen.droneRiseReveal',
    prompt: `Aerial drone shot rising up and pulling back to reveal a vast landscape at golden hour, cinematic wide angle, smooth stabilized ascent, epic scale.`,
  },
  {
    id: 'v04',
    category: 'chatGen.cameraMoves',
    title: 'chatGen.trackingFootsteps',
    prompt: `Low-angle tracking shot following footsteps walking forward on a city street, motion blur on the sides, dynamic energetic pace, first-person momentum.`,
  },
  {
    id: 'v05',
    category: 'chatGen.cameraMoves',
    title: 'chatGen.dollyZoom',
    prompt: `Dolly-zoom (vertigo effect) on a lone figure, background compressing dramatically, tense cinematic atmosphere, slow controlled move.`,
  },
  {
    id: 'v06',
    category: 'chatGen.bRoll',
    title: 'chatGen.morningLightWindow',
    prompt: `Static B-roll of morning sunlight streaming through a window onto a coffee cup, slow drifting dust particles in the light beam, calm and warm, shallow focus.`,
  },
  {
    id: 'v07',
    category: 'chatGen.bRoll',
    title: 'chatGen.rainGlass',
    prompt: `Close-up of raindrops sliding down a window pane, blurred neon city bokeh behind, moody nighttime ambience, slow gentle motion.`,
  },
  {
    id: 'v08',
    category: 'chatGen.bRoll',
    title: 'chatGen.pageTurningCloseUp',
    prompt: `Macro shot of pages of a book turning slowly, warm desk-lamp light, soft paper texture, quiet studious mood, shallow depth of field.`,
  },
  {
    id: 'v09',
    category: 'chatGen.bRoll',
    title: 'chatGen.cityTimelapse',
    prompt: `Timelapse of clouds racing over a modern city skyline at dusk, lights turning on across buildings, smooth accelerated motion, cinematic.`,
  },
  {
    id: 'v10',
    category: 'chatGen.bRoll',
    title: 'chatGen.wavesShore',
    prompt: `Slow-motion ocean waves crashing on a rocky shore at sunset, spray catching golden light, serene and powerful, high frame rate.`,
  },
  {
    id: 'v11',
    category: 'chatGen.product',
    title: 'chatGen.liquidSplash',
    prompt: `Product hero shot with liquid splashing around it in slow motion, dark backdrop, dramatic rim lighting, ultra-crisp droplets, premium advertising style.`,
  },
  {
    id: 'v12',
    category: 'chatGen.product',
    title: 'chatGen.floatingExplodedView',
    prompt: `A product gently floating and its parts exploding outward into an organized exploded view, clean white studio, soft shadows, smooth elegant motion.`,
  },
  {
    id: 'v13',
    category: 'chatGen.product',
    title: 'chatGen.textureMacro',
    prompt: `Extreme macro slow pan across the surface texture of a product, revealing material detail, soft gradient lighting, tactile luxurious feel.`,
  },
  {
    id: 'v14',
    category: 'chatGen.product',
    title: 'chatGen.rotatingLightSweep',
    prompt: `A product slowly rotating as a hard light sweeps across it, highlights traveling over the surface, sleek modern commercial aesthetic.`,
  },
  {
    id: 'v15',
    category: 'chatGen.ambience',
    title: 'chatGen.abstractFluid',
    prompt: `Abstract flowing liquid gradient in soft pastel colors, slow morphing organic shapes, dreamy calming loop, seamless motion, background visual.`,
  },
  {
    id: 'v16',
    category: 'chatGen.ambience',
    title: 'chatGen.particleStardust',
    prompt: `Glowing particles drifting through dark space like stardust, soft depth of field, slow mesmerizing motion, elegant tech ambience.`,
  },
  {
    id: 'v17',
    category: 'chatGen.ambience',
    title: 'chatGen.neonGrid',
    prompt: `Retro neon grid stretching to a horizon with a glowing sun, synthwave palette, slow forward travel, 80s aesthetic loop.`,
  },
  {
    id: 'v18',
    category: 'chatGen.ambience',
    title: 'chatGen.flowingSmoke',
    prompt: `Wisps of colored smoke swirling slowly against a black background, backlit, graceful fluid motion, high-contrast dramatic mood.`,
  },
  {
    id: 'v19',
    category: 'chatGen.ambience',
    title: 'chatGen.underwaterLightRays',
    prompt: `Underwater view of sunlight rays dancing through blue water, floating caustics and bubbles, tranquil slow motion, immersive calm.`,
  },
  {
    id: 'v20',
    category: 'chatGen.people',
    title: 'chatGen.backlitSilhouette',
    prompt: `Cinematic silhouette of a person turning toward camera against a bright backlit haze, lens flare, slow dramatic reveal, emotive mood.`,
  },
  {
    id: 'v21',
    category: 'chatGen.people',
    title: 'chatGen.handsCloseUp',
    prompt: `Close-up of hands working on a craft, warm focused light, shallow depth of field, deliberate careful motion, artisanal storytelling B-roll.`,
  },
  {
    id: 'v22',
    category: 'chatGen.people',
    title: 'chatGen.streetStroll',
    prompt: `A person walking through a busy street in slow motion while the crowd blurs around them, isolated subject, cinematic urban energy.`,
  },
  {
    id: 'v23',
    category: 'chatGen.people',
    title: 'chatGen.pensiveProfile',
    prompt: `Intimate slow push-in on a person's profile in soft window light, contemplative expression, film-grade skin tones, quiet emotional beat.`,
  },
  {
    id: 'v24',
    category: 'chatGen.people',
    title: 'chatGen.turningGlance',
    prompt: `Subject slowly turning to look over their shoulder, hair catching the light, shallow focus, elegant slow-motion portrait moment.`,
  },
];
