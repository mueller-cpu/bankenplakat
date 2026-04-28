// Vercel Serverless Function – ruft Gemini 3 Pro Image (Nano Banana Pro)
// und komponiert die hochgeladene Person in das Plakatmotiv.

import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" }
  }
};

const PROMPTS = {
  face: `You are compositing a high-end commercial portrait for a printed bank campaign poster.

INPUT
- Image 1 = the original campaign motif. Treat it as the GROUND TRUTH for: composition, framing, camera angle, focal length, depth of field, color grading, lighting direction and quality, wardrobe (suit/blazer/shirt), pose, hands, posture, location (sheep, pasture, hills, sky), and overall photographic style.
- Image 2 = a reference of a real person whose FACE and IDENTITY (head, hair, skin tone, glasses if any, age, build of head/neck) should appear in the final image.

TASK
Render a single new photograph that looks identical to image 1 in every way EXCEPT that the person's face and identifiable head/neck features are now those of the person in image 2. Keep the original wardrobe, body posture, and pose from image 1. Match skin tone naturally where neck meets clothing. Preserve the analog/film look, the soft overcast light, and the shallow depth of field with sheep slightly out of focus around the subject.

OUTPUT REQUIREMENTS
- Photorealistic, no illustration / no painterly look.
- No text, no logos, no watermark, no border.
- Subject sharp, background grading and bokeh consistent with image 1.
- Portrait orientation, suitable for a printed poster.`,

  full: `You are compositing a high-end commercial portrait for a printed bank campaign poster.

INPUT
- Image 1 = the original campaign motif. Treat it as the GROUND TRUTH for: location (sheep herd, pasture, hills, sky), composition, framing, camera angle, focal length, depth of field, color grading, lighting direction and quality, and overall photographic style.
- Image 2 = a reference of a real person (face, body, outfit) who should now stand in the foreground.

TASK
Render a single new photograph in the exact scene and style of image 1, but with the person from image 2 standing in the foreground in the same position, scale and pose as the original subject. The new person should appear naturally placed among the sheep, with realistic ground contact, correct shadows, and lighting that matches image 1. If the wardrobe in image 2 is casual or unsuitable for a business portrait, you may keep it – but lighting, color grading and depth of field MUST match image 1.

OUTPUT REQUIREMENTS
- Photorealistic, analog/film look matching image 1.
- No text, no logos, no watermark, no border.
- Subject sharp, sheep and landscape in matching focus and grading as image 1.
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
