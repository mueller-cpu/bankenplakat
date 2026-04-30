// Vercel Serverless Function – komponiert die hochgeladene Person ins
// Bankenplakat-Motiv. Engine wählbar: "gemini" (Nano Banana Pro) oder
// "openai" (gpt-image-1.5).

import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" }
  }
};

const SCENE_SPEC = `SCENE (compose freely from scratch — there is no scene reference image)
- Outdoor pastoral setting: gentle green rolling hills, a small flock of sheep around the subject, open sky above.
- Soft overcast daylight, gentle directional light, no harsh shadows.
- Muted slightly cool greens, soft natural skin tones, analog/film look (subtle grain, gentle contrast), shallow depth of field with sheep and hills slightly out of focus.

COMPOSITION (3:4 PORTRAIT, HEADLINE-READY)
- Aspect ratio 3:4, vertical / portrait orientation.
- The UPPER THIRD of the frame must be calm, uncluttered sky or soft horizon — low detail, no sheep, no busy elements — so a headline can be set on top.
- The subject's head sits approximately at the boundary between the upper third and the lower two thirds.
- The subject occupies roughly the lower two thirds, framed head-and-shoulders to mid-torso.
- Sheep and landscape arranged naturally around and behind the subject; never above the head into the headline area.`;

const PROMPTS = {
  face: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY of the person — 1:1 photographic likeness, triangulated from ALL person reference images.
2. EXPRESSION of the person — must reproduce the expression of the PRIMARY (first) person reference image exactly.
3. Natural, seamless photographic integration — single coherent real photograph.
4. Scene specification below.
5. Compositional rules for the headline area.

INPUT
- The first N images (labelled "person reference") all show the SAME real person from different angles / lighting / expressions. Use ALL of them to triangulate IDENTITY. The PRIMARY (first) reference is also the EXPRESSION anchor — its mouth, eyes and brows define the output's expression. The other references are for identity confirmation only and must NOT be averaged into the expression.
- One additional image is a high-resolution close-up detail of the person's face (cropped from the PRIMARY reference). Use it to verify identity and expression at the pixel level.
- NO scene reference image is provided — the scene is fully specified by the text below.

METHOD
Compose a NEW photograph from scratch. Two fixed points: (a) the person's identity (face + features as triangulated across ALL person references), and (b) the person's expression as shown in the PRIMARY reference. Render the wardrobe, pose, light and scene fresh according to the scene specification, integrating seamlessly with the face. Skin tone, light direction and shadows must match consistently between face, neck, hands and surroundings.

IDENTITY MUST PRESERVE (1:1 — verified across ALL person reference images)
- Bone structure, face shape, jawline, chin, cheekbones.
- Eye shape, eye color, eye spacing, eyelid shape.
- Nose shape, nose width, nostril shape.
- Mouth shape, lip thickness, philtrum.
- Hairline, hair color, hair texture, hair length and parting.
- Skin tone, skin texture, freckles, moles, scars, wrinkles, pores.
- Glasses (exact same model) if present.
- Apparent age, weight, head and neck build.

EXPRESSION (from PRIMARY reference, 1:1)
- The output's expression MUST match the PRIMARY (first) person reference. If the primary shows a smile, render the same smile (same intensity, same teeth visibility, same eye crinkle). If it shows a closed-mouth neutral or serious face, render that. If it shows a soft half-smile, render a soft half-smile.
- Reproduce the PRIMARY's mouth shape and openness, eye openness and gaze direction, eyebrow position and any visible micro-expression as faithfully as you reproduce the bone structure.
- Do NOT average expressions across the multiple references — only the PRIMARY defines the expression.

WARDROBE
- Business attire suitable for a bank campaign (dark blazer, suit or shirt). Render fresh; no specific outfit reference.

${SCENE_SPEC}

DO NOT
- Do NOT replace the PRIMARY's expression with a default neutral or default smile — match it exactly.
- Do NOT make the person look younger, slimmer, more symmetric or more attractive.
- Do NOT generalize features toward an average face.
- Do NOT change eye color, hair color or skin tone.
- Do NOT clutter the upper third of the frame.

OUTPUT
- Photorealistic, no illustration, no painterly look, no AI-glossy skin.
- No text, no logos, no watermark, no border.
- Subject sharp; light, shadows and skin tone consistent across face, neck and surroundings.
- Portrait orientation 3:4, suitable for a printed poster with headline overlay in the upper third.`,

  full: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY of the person — 1:1 likeness, triangulated from ALL person reference images.
2. BODY, OUTFIT, POSE and EXPRESSION — must match the PRIMARY (first) person reference 1:1.
3. Natural, seamless photographic integration — single coherent real photograph.
4. Scene specification below.
5. Compositional rules for the headline area.

INPUT
- The first N images (labelled "person reference") all show the SAME real person — face, expression, body, outfit. Use ALL of them to triangulate IDENTITY. The PRIMARY (first) reference is the anchor for outfit, body, pose AND expression. Additional references are for identity confirmation only and must NOT be averaged into expression, pose or outfit.
- One additional image is a high-resolution close-up detail of the person's face (cropped from the PRIMARY reference) for pixel-level identity and expression verification.
- NO scene reference image is provided — the scene is fully specified by the text below.

METHOD
Compose a NEW photograph from scratch. The person from the references — face, expression, body, outfit, proportions — is the only fixed point, with the PRIMARY reference defining body, outfit, pose and expression. Render the surrounding scene fresh according to the scene specification. Integrate the person seamlessly: consistent ground contact, light direction, shadows, skin tone and outfit lighting matching the surroundings.

IDENTITY MUST PRESERVE (1:1 — verified across ALL person reference images)
- Full face: bone structure, eyes, nose, mouth, hairline, hair, skin tone, skin texture, freckles, moles, scars, wrinkles, glasses, apparent age.
- Full body: height, build, weight, body proportions, shoulder width, posture.
- Full outfit: every visible garment, color, pattern, fit, accessories, shoes, jewelry, watch — exactly as in the PRIMARY reference.

EXPRESSION (from PRIMARY reference, 1:1)
- The output's expression MUST match the PRIMARY (first) reference exactly. Smile → same smile. Neutral → neutral. Half-smile → half-smile. Reproduce mouth shape and openness, eye openness, gaze direction, eyebrow position and micro-expressions as faithfully as the bone structure.
- Do NOT average expressions across the references — only the PRIMARY defines the expression.

${SCENE_SPEC}

DO NOT
- Do NOT replace the PRIMARY's expression with a default neutral or default smile — match it exactly.
- Do NOT replace the outfit with business attire unless the PRIMARY reference already shows it.
- Do NOT slim, idealize, beautify or change the body or face.
- Do NOT change hair, skin tone, eye color or features.
- Do NOT invent props, accessories, gestures or wardrobe details not in the references.
- Do NOT clutter the upper third of the frame.

OUTPUT
- Photorealistic, analog/film look as specified.
- No text, no logos, no watermark, no border.
- Subject sharp; light and grading consistent across person and landscape.
- Portrait orientation 3:4, suitable for a printed poster with headline overlay in the upper third.`
};

// gpt-image-1.5 folgt langen "DO NOT"-Listen schlechter als Gemini und reagiert
// stark auf knappe, positiv formulierte Anweisungen mit klarer Reihenfolge.
// Composition mit harten Prozenten muss vor allem anderen stehen, sonst zentriert
// das Modell die Person und der Headline-Headroom oben fehlt.
const OPENAI_HEADROOM_SPEC = `COMPOSITION (read first, non-negotiable — this is a poster with a headline area)
- Output is a 1024×1536 vertical portrait. Imagine a horizontal line at 45% from the TOP of the frame.
- TOP 45% (above that line): nothing but smooth, calm, uncluttered open sky. NO head, NO hair, NO face, NO sheep, NO hilltops, NO clouds with dense detail. This top area is reserved for poster text — it must be visually empty.
- The very top of the subject's head sits at approximately 45% from the top, NOT higher. The subject's eyes are at approximately 60% from the top.
- BOTTOM 55%: the subject framed head-and-shoulders to mid-torso, with sheep and gentle green hills arranged around and behind them. Horizon line is at or below the subject's eye level — never above the head.
- The subject is NOT centered vertically. They sit in the LOWER half of the frame, with empty sky above for headline overlay.

SCENE
- Outdoor pastoral setting: gentle green rolling hills, a small flock of sheep around and behind the subject (never above the head into the sky area), open sky above.
- Soft overcast daylight, gentle directional light, no harsh shadows.
- Muted slightly cool greens, soft natural skin tones, analog/film look (subtle grain, gentle contrast), shallow depth of field.`;

const OPENAI_PROMPTS = {
  face: `Create a photorealistic vertical portrait of the person shown in the reference images, for a printed bank campaign poster.

${OPENAI_HEADROOM_SPEC}

Reference image order (critical):
- Image 1 is the PRIMARY anchor: identity AND expression. The output's face must look exactly like image 1, and the output's expression (mouth, eyes, brows) must match image 1 exactly — same smile or neutral, same intensity, same teeth visibility, same eye crinkle.
- Images 2..N are additional views of the SAME person. Use them only to confirm identity (bone structure, features, hair). Do NOT average their expressions into the result.
- The final image is a tight face-crop from the primary reference for pixel-level identity verification.

Identity to preserve 1:1: bone structure, eye shape and color, nose, mouth, hairline, hair color and texture, skin tone, freckles, moles, scars, glasses (exact model if present), apparent age and weight. Keep the person looking like themselves — do not idealize, smooth, slim or beautify.

Wardrobe: business attire suitable for a bank (dark blazer, suit or shirt). Compose fresh.

Look: photorealistic, analog/film, gentle grain, no AI-glossy skin, no illustration, no text, no logos, no watermark, no border. Reminder: the top 45% of the frame must be empty sky.`,

  full: `Create a photorealistic vertical portrait of the person shown in the reference images, for a printed bank campaign poster.

${OPENAI_HEADROOM_SPEC}

Reference image order (critical):
- Image 1 is the PRIMARY anchor: identity, expression, body, outfit and pose. Reproduce the face AND the expression of image 1 exactly (same smile or neutral, same intensity). Reproduce the outfit (every garment, color, pattern, fit, accessories, watch, shoes) and body proportions and pose from image 1.
- Images 2..N are additional views of the SAME person. Use them only to confirm identity. Do NOT average their expressions, outfits or poses into the result.
- The final image is a tight face-crop from the primary reference for pixel-level identity verification.

Identity to preserve 1:1: full face features, hair, skin tone and texture, glasses, body proportions, height and build. Keep the person looking like themselves — do not idealize, smooth, slim or beautify.

Look: photorealistic, analog/film, gentle grain, no AI-glossy skin, no illustration, no text, no logos, no watermark, no border. Reminder: the top 45% of the frame must be empty sky.`
};

async function makeFaceCropBuffer(buffer) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error("invalid image dimensions");
  const cropHeight = Math.round(h * 0.55);
  const cropWidth = Math.round(w * 0.7);
  const cropLeft = Math.max(0, Math.round((w - cropWidth) / 2));
  const cropTop = 0;
  return sharp(buffer)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 92 })
    .toBuffer();
}

// Layout-Referenz für openai: stark verkleinert + geblurrt, damit gpt-image-1.5
// die makro-komposition (subject-position, headroom, schafe-verteilung) sieht,
// aber keine identifizierbaren gesichtszüge der layout-person mehr — sonst
// mischt das modell die fremde identität in den output.
async function makeLayoutReferenceBuffer(buffer) {
  return sharp(buffer)
    .resize({ width: 384, height: 512, fit: "cover" })
    .blur(8)
    .modulate({ saturation: 0.6 })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function callGemini({ persons, mode, faceCropBuffer, aspectRatio, imageSize }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = mode === "full" ? PROMPTS.full : PROMPTS.face;

  const userParts = [{ text: prompt }];
  persons.forEach((p, i) => {
    const label = i === 0
      ? `Person reference 1 of ${persons.length} — PRIMARY anchor. Identity, EXPRESSION${mode === "full" ? ", body, outfit and pose" : ""} must appear 1:1 in the output. The expression visible here (smile / neutral / half-smile / etc.) is the expression of the output:`
      : `Person reference ${i + 1} of ${persons.length} — additional view of the SAME person. Use ONLY to triangulate identity (face features); do NOT use this image's expression${mode === "full" ? ", outfit or pose" : ""}:`;
    userParts.push({ text: label });
    userParts.push({ inlineData: { mimeType: p.mime, data: p.data } });
  });
  if (faceCropBuffer) {
    userParts.push({ text: "Face close-up — high-resolution detail crop from the PRIMARY reference (pixel-level identity AND expression reference, must match 1:1):" });
    userParts.push({ inlineData: { mimeType: "image/jpeg", data: faceCropBuffer.toString("base64") } });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts: userParts }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize }
    }
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  let outBase64 = null;
  let outMime = "image/png";
  let textNote = "";
  for (const part of parts) {
    if (part.inlineData?.data) {
      outBase64 = part.inlineData.data;
      outMime = part.inlineData.mimeType || outMime;
      break;
    }
    if (part.text) textNote += part.text + "\n";
  }
  if (!outBase64) {
    const err = new Error(textNote.trim() || "Model did not return an image.");
    err.note = textNote.trim();
    throw err;
  }
  return { imageDataUrl: `data:${outMime};base64,${outBase64}`, note: textNote.trim() };
}

async function callOpenAI({ persons, mode, faceCropBuffer, motif, quality }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in environment.");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const basePrompt = mode === "full" ? OPENAI_PROMPTS.full : OPENAI_PROMPTS.face;
  const prompt = motif
    ? `${basePrompt}\n\nLAYOUT REFERENCE (last image only — heavily blurred on purpose)\n- The very LAST image is a heavily BLURRED, low-resolution layout sketch from an existing poster. It contains NO usable identity information by design.\n- Use it ONLY for macro composition: where the subject sits in the frame, head position, body scale relative to the frame, horizon line height, where empty sky sits, rough sheep distribution.\n- Do NOT try to read any face, features, hair, skin tone, expression or clothing from this blurred image. The person in it is a different person and the blur is intentional to prevent identity mixing.\n- Identity and expression come EXCLUSIVELY from the sharp person reference images above. The layout reference defines WHERE, the person references define WHO and HOW.`
    : basePrompt;

  const files = [];
  for (let i = 0; i < persons.length; i++) {
    const p = persons[i];
    const buf = Buffer.from(p.data, "base64");
    const ext = (p.mime.split("/")[1] || "png").replace("jpeg", "jpg");
    files.push(await toFile(buf, `person-${i + 1}.${ext}`, { type: p.mime }));
  }
  if (faceCropBuffer) {
    files.push(await toFile(faceCropBuffer, "face-crop.jpg", { type: "image/jpeg" }));
  }
  if (motif) {
    const motifBuf = Buffer.from(motif.data, "base64");
    const blurred = await makeLayoutReferenceBuffer(motifBuf);
    files.push(await toFile(blurred, "layout-reference-blurred.jpg", { type: "image/jpeg" }));
  }

  let result;
  try {
    result = await openai.images.edit({
      model: "gpt-image-1.5",
      image: files,
      prompt,
      size: "1024x1536",
      quality: quality || "high",
      n: 1
    });
  } catch (err) {
    const status = err?.status || err?.response?.status;
    const code = err?.code || err?.error?.code;
    const detail = err?.error?.message || err?.message || String(err);
    const msg = `OpenAI ${status || ""} ${code || ""}: ${detail}`.trim();
    console.error("openai images.edit failed:", { status, code, detail, raw: err });
    throw new Error(msg);
  }

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI did not return an image.");
  }
  return { imageDataUrl: `data:image/png;base64,${b64}`, note: "" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      personImage,
      personImages,
      motifImage,
      mode = "face",
      engine = "gemini",
      aspectRatio = "3:4",
      imageSize = "4K",
      quality
    } = req.body || {};

    const personList = Array.isArray(personImages) && personImages.length > 0
      ? personImages
      : (personImage ? [personImage] : []);

    if (personList.length === 0) {
      return res.status(400).json({ error: "at least one personImage is required (data URL)." });
    }
    if (personList.length > 6) {
      return res.status(400).json({ error: "max 6 person reference images." });
    }

    const persons = personList.map(parseDataUrl);
    const primaryBuffer = Buffer.from(persons[0].data, "base64");
    let faceCropBuffer = null;
    try {
      faceCropBuffer = await makeFaceCropBuffer(primaryBuffer);
    } catch (e) {
      console.warn("face crop failed:", e?.message);
    }

    let out;
    if (engine === "openai") {
      const motif = motifImage ? parseDataUrl(motifImage) : null;
      out = await callOpenAI({ persons, mode, faceCropBuffer, motif, quality });
    } else {
      out = await callGemini({ persons, mode, faceCropBuffer, aspectRatio, imageSize });
    }

    return res.status(200).json({
      image: out.imageDataUrl,
      engine,
      note: out.note || undefined
    });
  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return { mime: "image/png", data: dataUrl };
  return { mime: m[1], data: m[2] };
}
