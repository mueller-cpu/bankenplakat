// Vercel Serverless Function – ruft Gemini 3 Pro Image (Nano Banana Pro)
// und komponiert die hochgeladene Person in das Plakatmotiv.

import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" }
  }
};

const PROMPTS = {
  face: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY of image 2 — must be a 1:1 photographic likeness.
2. Wardrobe, pose, posture, hands of image 1.
3. Scene, lighting, color grading, depth of field, photographic style of image 1.
If any two conflict, the higher number wins. Never sacrifice 1 for 3.

INPUT
- Image 2 is the IDENTITY ANCHOR. It defines the real person whose face must appear in the output.
- Image 1 is the SCENE/STYLE REFERENCE. It defines wardrobe, pose, location, lighting and look.

METHOD
Start from the face in image 2 as ground truth. Do NOT redraw it, do NOT idealize it, do NOT smooth or beautify it. Then dress that exact person in the wardrobe and pose of image 1, place them in the scene of image 1, and match the lighting, color grading and depth of field of image 1.

IDENTITY MUST PRESERVE (1:1 from image 2)
- Bone structure, face shape, jawline, chin, cheekbones.
- Eye shape, eye color, eye spacing, eyelid shape.
- Nose shape, nose width, nostril shape.
- Mouth shape, lip thickness, philtrum.
- Hairline, hair color, hair texture, hair length and parting.
- Skin tone, skin texture, freckles, moles, scars, wrinkles, pores.
- Glasses (exact same model) if present in image 2.
- Apparent age, weight, head and neck build.

DO NOT
- Do NOT make the person look younger, slimmer, more symmetric or more attractive.
- Do NOT generalize features toward an "average" face.
- Do NOT change eye color, hair color or skin tone for stylistic reasons.
- Do NOT alter facial proportions to fit the body of image 1.

MATCH FROM IMAGE 1
- Wardrobe (suit/blazer/shirt) exactly.
- Body posture, hand position, head tilt and gaze direction approximately.
- Scene (sheep, pasture, hills, sky), framing, focal length, depth of field, color grading.
- Soft overcast light, analog/film look, shallow DoF with sheep slightly out of focus.

OUTPUT REQUIREMENTS
- Photorealistic, no illustration, no painterly look, no AI-glossy skin.
- No text, no logos, no watermark, no border.
- Subject's face sharp; bokeh and grading consistent with image 1.
- Portrait orientation, suitable for a printed poster.`,

  full: `You are producing a high-end commercial portrait for a printed bank campaign poster.

PRIORITY HIERARCHY (non-negotiable, in this order)
1. IDENTITY and BODY of image 2 — face AND body must be a 1:1 photographic likeness, including the outfit.
2. Scene (location, sheep, landscape) of image 1.
3. Lighting, color grading, depth of field and photographic style of image 1.
If any two conflict, the higher number wins. Never sacrifice 1 for 2 or 3.

INPUT
- Image 2 is the IDENTITY + BODY ANCHOR. It defines the real person, their outfit, body shape, posture and proportions.
- Image 1 is the SCENE/STYLE REFERENCE. It defines location, framing, lighting and look.

METHOD
Treat image 2 as if you were placing that exact photograph into the scene of image 1. Keep the person from image 2 unchanged — same face, same body, same outfit, same proportions — and place them naturally in the scene of image 1 with correct ground contact, shadows and lighting. Re-render only what is needed to integrate them (light, shadow, ground, atmosphere). Do NOT regenerate the person.

IDENTITY MUST PRESERVE (1:1 from image 2)
- Full face: bone structure, eyes, nose, mouth, hairline, hair, skin tone, skin texture, freckles, moles, scars, wrinkles, glasses, apparent age.
- Full body: height, build, weight, body proportions, shoulder width, posture.
- Full outfit: every visible garment, color, pattern, fit, accessories, shoes, jewelry, watch — exactly as in image 2.

DO NOT
- Do NOT replace the outfit with business attire unless image 2 already shows business attire.
- Do NOT slim, idealize, beautify or change the body or face.
- Do NOT change hair, skin tone, eye color or features.
- Do NOT invent props, accessories, gestures or wardrobe details that are not in image 2.
- Do NOT alter the person's pose more than necessary to make them stand naturally in the scene.

MATCH FROM IMAGE 1
- Location (sheep herd, pasture, hills, sky) and framing.
- Camera angle, focal length, depth of field.
- Lighting direction, lighting quality, color grading, soft overcast film look.
- Realistic shadows on the ground and on the person, consistent with image 1's light.

OUTPUT REQUIREMENTS
- Photorealistic, analog/film look matching image 1.
- No text, no logos, no watermark, no border.
- Subject sharp; sheep and landscape in matching focus and grading as image 1.
- Portrait orientation, suitable for a printed poster.`
};

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

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { text: "Image 1 — original campaign motif (preserve everything described above):" },
            { inlineData: { mimeType: ref.mime, data: ref.data } },
            { text: "Image 2 — reference of the person whose likeness should appear in the final image:" },
            { inlineData: { mimeType: person.mime, data: person.data } }
          ]
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
