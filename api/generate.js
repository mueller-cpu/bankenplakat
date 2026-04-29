// Vercel Serverless Function – ruft Gemini 3 Pro Image (Nano Banana Pro)
// und komponiert die hochgeladene Person in das Plakatmotiv.

import { GoogleGenAI } from "@google/genai";
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

async function makeFaceCrop(buffer) {
  const meta = await sharp(buffer).metadata();
  const w = meta.width;
  const h = meta.height;
  if (!w || !h) throw new Error("invalid image dimensions");
  const cropHeight = Math.round(h * 0.55);
  const cropWidth = Math.round(w * 0.7);
  const cropLeft = Math.max(0, Math.round((w - cropWidth) / 2));
  const cropTop = 0;
  const out = await sharp(buffer)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 92 })
    .toBuffer();
  return out.toString("base64");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { personImage, personImages, mode = "face", aspectRatio = "3:4", imageSize = "4K" } = req.body || {};

    const personList = Array.isArray(personImages) && personImages.length > 0
      ? personImages
      : (personImage ? [personImage] : []);

    if (personList.length === 0) {
      return res.status(400).json({ error: "at least one personImage is required (data URL)." });
    }
    if (personList.length > 6) {
      return res.status(400).json({ error: "max 6 person reference images." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set in environment." });
    }

    const persons = personList.map(parseDataUrl);
    const prompt = mode === "full" ? PROMPTS.full : PROMPTS.face;

    const primaryBuffer = Buffer.from(persons[0].data, "base64");
    let faceCropBase64 = null;
    try {
      faceCropBase64 = await makeFaceCrop(primaryBuffer);
    } catch (e) {
      console.warn("face crop failed:", e?.message);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const userParts = [{ text: prompt }];

    persons.forEach((p, i) => {
      const label = i === 0
        ? `Person reference 1 of ${persons.length} — PRIMARY anchor. Identity, EXPRESSION${mode === "full" ? ", body, outfit and pose" : ""} must appear 1:1 in the output. The expression visible here (smile / neutral / half-smile / etc.) is the expression of the output:`
        : `Person reference ${i + 1} of ${persons.length} — additional view of the SAME person. Use ONLY to triangulate identity (face features); do NOT use this image's expression${mode === "full" ? ", outfit or pose" : ""}:`;
      userParts.push({ text: label });
      userParts.push({ inlineData: { mimeType: p.mime, data: p.data } });
    });

    if (faceCropBase64) {
      userParts.push({ text: "Face close-up — high-resolution detail crop from the PRIMARY reference (pixel-level identity AND expression reference, must match 1:1):" });
      userParts.push({ inlineData: { mimeType: "image/jpeg", data: faceCropBase64 } });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [
        {
          role: "user",
          parts: userParts
        }
      ],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio,
          imageSize
        }
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
      return res.status(502).json({
        error: "Model did not return an image.",
        note: textNote.trim() || undefined
      });
    }

    return res.status(200).json({
      image: `data:${outMime};base64,${outBase64}`,
      note: textNote.trim() || undefined
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
