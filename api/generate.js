// Vercel Serverless Function – ruft Gemini 3 Pro Image (Nano Banana Pro)
// und komponiert die hochgeladene Person in das Plakatmotiv.

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" }
  }
};

const PROMPTS = {
  face: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY of the person in image 1 / image 2 — must be a 1:1 photographic likeness.
2. Natural, seamless photographic integration — the result must look like a single real photograph, not a composite.
3. Wardrobe STYLE (business attire), overall pose feeling, atmosphere, lighting and color grading taken from image 3.
4. Concrete arrangement of sheep, hills, sky and exact framing — may be re-composed freely if needed for a natural result.
If any two conflict, the higher number wins. Never sacrifice 1 or 2 for 3 or 4.

INPUT
- Image 1 = IDENTITY ANCHOR. Real person whose face must appear 1:1 in the output.
- Image 2 = high-resolution close-up detail of the same person's face. Use this to verify and lock identity at the pixel level.
- Image 3 = STYLE/MOOD reference. Defines wardrobe style, posture spirit, location type, lighting quality and photographic look. NOT a pixel template.

METHOD
Compose a NEW photograph from scratch. The face from images 1 + 2 is the only fixed point — do NOT redraw it, do NOT idealize it, do NOT smooth or beautify it. Around that face, render a body, wardrobe, pose, light and scene that match the style of image 3 and integrate seamlessly with the face. You are free to re-arrange sheep, hills, framing, head tilt, hand position and exact pose so the result looks like one coherent, naturally lit photograph. Skin tone, light direction and shadows must match consistently between face, neck, hands and surroundings — no "pasted-on" face.

IDENTITY MUST PRESERVE (1:1 from image 1 + image 2)
- Bone structure, face shape, jawline, chin, cheekbones.
- Eye shape, eye color, eye spacing, eyelid shape.
- Nose shape, nose width, nostril shape.
- Mouth shape, lip thickness, philtrum.
- Hairline, hair color, hair texture, hair length and parting.
- Skin tone, skin texture, freckles, moles, scars, wrinkles, pores.
- Glasses (exact same model) if present in image 1 / image 2.
- Apparent age, weight, head and neck build.

DO NOT
- Do NOT make the person look younger, slimmer, more symmetric or more attractive.
- Do NOT generalize features toward an "average" face.
- Do NOT change eye color, hair color or skin tone for stylistic reasons.
- Do NOT paste the face onto image 3 — re-light, re-shadow and re-compose as needed for natural integration.
- Do NOT prioritize matching the exact arrangement of image 3 over identity or natural integration.

TAKE FROM IMAGE 3 (style level, not pixel level)
- Wardrobe style: business attire (suit/blazer/shirt) consistent with image 3.
- General pose feeling and framing intent (head-and-shoulders / mid-shot portrait).
- Scene type: outdoor pastoral with sheep, hills, sky.
- Lighting quality: soft overcast daylight, gentle direction.
- Color grading and analog/film look, shallow depth of field.

OUTPUT REQUIREMENTS
- Photorealistic, no illustration, no painterly look, no AI-glossy skin.
- No text, no logos, no watermark, no border.
- Subject's face sharp; light, shadows and skin tone consistent across face, neck and surroundings.
- Portrait orientation, suitable for a printed poster.`,

  full: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY and BODY of the person in image 1 / image 2 — face AND body must be a 1:1 photographic likeness, including the outfit.
2. Natural, seamless photographic integration — the result must look like a single real photograph, not a composite.
3. Atmosphere, lighting, color grading and overall photographic style of image 3.
4. Concrete arrangement of sheep, hills, sky and exact framing — may be re-composed freely if needed for a natural result.
If any two conflict, the higher number wins. Never sacrifice 1 or 2 for 3 or 4.

INPUT
- Image 1 = IDENTITY + BODY ANCHOR. Real person, their outfit, body shape, posture and proportions.
- Image 2 = high-resolution close-up detail of the same person's face. Use this to verify and lock face identity at the pixel level.
- Image 3 = MOOD/STYLE reference. Defines location type, atmosphere, lighting and photographic look. NOT a pixel template.

METHOD
Compose a NEW photograph from scratch. The person from image 1 (face verified by image 2, plus body, outfit and proportions) is the only fixed point — do NOT redraw, slim, idealize or restyle them. Around them, render an outdoor pastoral scene that matches the mood, light and color grading of image 3, with sheep, hills and sky composed freely so the result looks like one coherent, naturally lit photograph. The person must integrate seamlessly: consistent ground contact, consistent light direction and shadow, skin tone and outfit lighting matching the surrounding scene — no "pasted-in" subject.

IDENTITY MUST PRESERVE (1:1 from image 1 + image 2)
- Full face: bone structure, eyes, nose, mouth, hairline, hair, skin tone, skin texture, freckles, moles, scars, wrinkles, glasses, apparent age.
- Full body: height, build, weight, body proportions, shoulder width, posture.
- Full outfit: every visible garment, color, pattern, fit, accessories, shoes, jewelry, watch — exactly as in image 1.

DO NOT
- Do NOT replace the outfit with business attire unless image 1 already shows business attire.
- Do NOT slim, idealize, beautify or change the body or face.
- Do NOT change hair, skin tone, eye color or features.
- Do NOT invent props, accessories, gestures or wardrobe details that are not in image 1.
- Do NOT paste the person onto image 3 — re-light, re-shadow and re-compose the surroundings for natural integration.
- Do NOT prioritize matching the exact arrangement of image 3 over identity or natural integration.

TAKE FROM IMAGE 3 (style level, not pixel level)
- Scene type: outdoor pastoral with sheep, hills, sky.
- Lighting quality: soft overcast daylight, gentle direction.
- Color grading and analog/film look, shallow depth of field.
- General framing intent suitable for a printed portrait poster.

OUTPUT REQUIREMENTS
- Photorealistic, analog/film look matching the mood of image 3.
- No text, no logos, no watermark, no border.
- Subject sharp; light and grading consistent across person and landscape.
- Portrait orientation, suitable for a printed poster.`
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
    const { referenceImage, personImage, mode = "face", aspectRatio = "3:4", imageSize = "4K" } = req.body || {};

    if (!referenceImage || !personImage) {
      return res.status(400).json({ error: "referenceImage and personImage are required (data URLs)." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set in environment." });
    }

    const ref = parseDataUrl(referenceImage);
    const person = parseDataUrl(personImage);
    const prompt = mode === "full" ? PROMPTS.full : PROMPTS.face;

    const personBuffer = Buffer.from(person.data, "base64");
    let faceCropBase64 = null;
    try {
      faceCropBase64 = await makeFaceCrop(personBuffer);
    } catch (e) {
      console.warn("face crop failed:", e?.message);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const userParts = [
      { text: prompt },
      { text: "Image 1 — IDENTITY ANCHOR (real person whose likeness must appear 1:1 in the output):" },
      { inlineData: { mimeType: person.mime, data: person.data } }
    ];

    if (faceCropBase64) {
      userParts.push({ text: "Image 2 — close-up detail of the SAME person's face (pixel-level identity reference, must match 1:1):" });
      userParts.push({ inlineData: { mimeType: "image/jpeg", data: faceCropBase64 } });
      userParts.push({ text: "Image 3 — SCENE/STYLE reference (campaign motif; defines wardrobe, pose, location, lighting):" });
    } else {
      userParts.push({ text: "Image 3 — SCENE/STYLE reference (campaign motif; defines wardrobe, pose, location, lighting). NOTE: image 2 was unavailable, treat image 1 alone as identity anchor:" });
    }
    userParts.push({ inlineData: { mimeType: ref.mime, data: ref.data } });

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
