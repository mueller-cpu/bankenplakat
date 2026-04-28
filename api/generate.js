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
1. IDENTITY of the person — must be a 1:1 photographic likeness, triangulated from ALL person reference images provided.
2. Natural, seamless photographic integration — the result must look like a single real photograph, not a composite.
3. Wardrobe STYLE (business attire), overall pose feeling, atmosphere, lighting and color grading taken from the scene reference.
4. Concrete arrangement of sheep, hills, sky and exact framing — may be re-composed freely if needed for a natural result.
If any two conflict, the higher number wins. Never sacrifice 1 or 2 for 3 or 4.

INPUT
- The first N images (labelled "person reference") all show the SAME real person from different angles / lighting / expressions. Use ALL of them together to triangulate the true identity. The person in the output must match all of them simultaneously.
- One image is a high-resolution close-up detail of the person's face. Use this to verify and lock identity at the pixel level.
- The final image (labelled "scene reference") is the STYLE/MOOD reference. It defines wardrobe style, posture spirit, location type, lighting quality and photographic look. NOT a pixel template.

METHOD
Compose a NEW photograph from scratch. The person's identity (face + features as shown across ALL person reference images) is the only fixed point — do NOT redraw it, do NOT idealize it, do NOT smooth or beautify it. Around that face, render a body, wardrobe, pose, light and scene that match the style of the scene reference and integrate seamlessly with the face. You are free to re-arrange sheep, hills, framing, head tilt, hand position and exact pose so the result looks like one coherent, naturally lit photograph. Skin tone, light direction and shadows must match consistently between face, neck, hands and surroundings — no "pasted-on" face.

IDENTITY MUST PRESERVE (1:1 — verified across ALL person reference images)
- Bone structure, face shape, jawline, chin, cheekbones.
- Eye shape, eye color, eye spacing, eyelid shape.
- Nose shape, nose width, nostril shape.
- Mouth shape, lip thickness, philtrum.
- Hairline, hair color, hair texture, hair length and parting.
- Skin tone, skin texture, freckles, moles, scars, wrinkles, pores.
- Glasses (exact same model) if present in person reference images.
- Apparent age, weight, head and neck build.

DO NOT
- Do NOT make the person look younger, slimmer, more symmetric or more attractive.
- Do NOT generalize features toward an "average" face.
- Do NOT change eye color, hair color or skin tone for stylistic reasons.
- Do NOT paste the face onto the scene reference — re-light, re-shadow and re-compose as needed for natural integration.
- Do NOT prioritize matching the exact arrangement of the scene reference over identity or natural integration.

TAKE FROM SCENE REFERENCE (style level, not pixel level)
- Wardrobe style: business attire (suit/blazer/shirt) consistent with the scene reference.
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
1. IDENTITY and BODY of the person — face AND body must be a 1:1 photographic likeness, triangulated from ALL person reference images (face, body, outfit).
2. Natural, seamless photographic integration — the result must look like a single real photograph, not a composite.
3. Atmosphere, lighting, color grading and overall photographic style of the scene reference.
4. Concrete arrangement of sheep, hills, sky and exact framing — may be re-composed freely if needed for a natural result.
If any two conflict, the higher number wins. Never sacrifice 1 or 2 for 3 or 4.

INPUT
- The first N images (labelled "person reference") all show the SAME real person — their face, body, outfit, body shape, posture and proportions. Use ALL of them to triangulate true identity and body. The first such image is the PRIMARY anchor for outfit and pose; additional ones confirm and refine identity from other angles.
- One image is a high-resolution close-up detail of the person's face. Use this to verify and lock face identity at the pixel level.
- The final image (labelled "scene reference") is the MOOD/STYLE reference. It defines location type, atmosphere, lighting and photographic look. NOT a pixel template.

METHOD
Compose a NEW photograph from scratch. The person's identity (face triangulated from ALL reference images, plus body, outfit and proportions from the primary anchor) is the only fixed point — do NOT redraw, slim, idealize or restyle them. Around them, render an outdoor pastoral scene that matches the mood, light and color grading of the scene reference, with sheep, hills and sky composed freely so the result looks like one coherent, naturally lit photograph. The person must integrate seamlessly: consistent ground contact, consistent light direction and shadow, skin tone and outfit lighting matching the surrounding scene — no "pasted-in" subject.

IDENTITY MUST PRESERVE (1:1 — verified across ALL person reference images)
- Full face: bone structure, eyes, nose, mouth, hairline, hair, skin tone, skin texture, freckles, moles, scars, wrinkles, glasses, apparent age.
- Full body: height, build, weight, body proportions, shoulder width, posture.
- Full outfit: every visible garment, color, pattern, fit, accessories, shoes, jewelry, watch — exactly as in the primary person reference.

DO NOT
- Do NOT replace the outfit with business attire unless the primary person reference already shows business attire.
- Do NOT slim, idealize, beautify or change the body or face.
- Do NOT change hair, skin tone, eye color or features.
- Do NOT invent props, accessories, gestures or wardrobe details that are not in the person references.
- Do NOT paste the person onto the scene reference — re-light, re-shadow and re-compose the surroundings for natural integration.
- Do NOT prioritize matching the exact arrangement of the scene reference over identity or natural integration.

TAKE FROM SCENE REFERENCE (style level, not pixel level)
- Scene type: outdoor pastoral with sheep, hills, sky.
- Lighting quality: soft overcast daylight, gentle direction.
- Color grading and analog/film look, shallow depth of field.
- General framing intent suitable for a printed portrait poster.

OUTPUT REQUIREMENTS
- Photorealistic, analog/film look matching the mood of the scene reference.
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
    const { referenceImage, personImage, personImages, mode = "face", aspectRatio = "3:4", imageSize = "4K" } = req.body || {};

    const personList = Array.isArray(personImages) && personImages.length > 0
      ? personImages
      : (personImage ? [personImage] : []);

    if (!referenceImage || personList.length === 0) {
      return res.status(400).json({ error: "referenceImage and at least one personImage are required (data URLs)." });
    }
    if (personList.length > 6) {
      return res.status(400).json({ error: "max 6 person reference images." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not set in environment." });
    }

    const ref = parseDataUrl(referenceImage);
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
        ? `Person reference 1 of ${persons.length} — PRIMARY identity anchor (real person whose likeness must appear 1:1 in the output${mode === "full" ? "; this is also the source for body and outfit" : ""}):`
        : `Person reference ${i + 1} of ${persons.length} — additional view of the SAME person (use to triangulate identity 1:1):`;
      userParts.push({ text: label });
      userParts.push({ inlineData: { mimeType: p.mime, data: p.data } });
    });

    if (faceCropBase64) {
      userParts.push({ text: "Face close-up — high-resolution detail crop of the SAME person's face (pixel-level identity reference, must match 1:1):" });
      userParts.push({ inlineData: { mimeType: "image/jpeg", data: faceCropBase64 } });
    }

    userParts.push({ text: "Scene reference — campaign motif. Use ONLY for atmosphere, lighting, color grading, wardrobe style and overall photographic look. Concrete arrangement (sheep, hills, framing) may be re-composed freely:" });
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
