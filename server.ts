import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- API Key Segmentation & Validation ---

const getClient = (layer: 'PERCEPTION' | 'INTERPRETATION' | 'REASONING' | 'CHAT') => {
  const key = process.env[`EDUVANE_${layer}_API_KEY`];
  if (!key) {
    throw new Error(`Configuration Error: Missing API Key for ${layer} layer.`);
  }
  return new GoogleGenAI({ apiKey: key });
};

// --- Endpoints ---

// 1. Perception Layer (Images -> Text)
// Uses EDUVANE_PERCEPTION_API_KEY
app.post('/api/perceive', async (req, res) => {
  try {
    const { image, mimeType, systemInstruction } = req.body;
    const ai = getClient('PERCEPTION');
    
    // Model Selection logic preserved from original service
    const model = mimeType === 'application/pdf' ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-image';

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: image, mimeType } },
          { text: "Extract all legible text from this content. Describe the layout briefly." }
        ]
      },
      config: {
        systemInstruction,
        temperature: 0.1,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error('Perception Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Interpretation Layer (Text -> Structured Intent)
// Uses EDUVANE_INTERPRETATION_API_KEY
app.post('/api/interpret', async (req, res) => {
  try {
    const { text, systemInstruction } = req.body;
    const ai = getClient('INTERPRETATION');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ text: `Analyzed Text: ${text}` }]
      },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            topic: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            intent: { 
                type: Type.STRING, 
                enum: ["solution", "explanation", "both"],
            },
            ownership: {
              type: Type.OBJECT,
              properties: {
                  type: { type: Type.STRING, enum: ["student_direct", "teacher_uploaded_student_work"] },
                  student: {
                      type: Type.OBJECT,
                      properties: {
                          name: { type: Type.STRING },
                          class: { type: Type.STRING },
                          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] }
                      }
                  }
              },
              required: ["type"]
            }
          },
          required: ["subject", "topic", "intent", "ownership"]
        }
      }
    });

    // Clean potential markdown fencing
    const jsonText = (response.text || "{}").replace(/```json/g, '').replace(/```/g, '').trim();
    res.json(JSON.parse(jsonText));

  } catch (error: any) {
    console.error('Interpretation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Reasoning Layer (Context + Content -> Analysis)
// Uses EDUVANE_REASONING_API_KEY
app.post('/api/reason', async (req, res) => {
  try {
    const { prompt, image, mimeType, systemInstruction, mode } = req.body;
    const ai = getClient('REASONING');

    // Model routing based on mode
    const model = mode === 'fast' ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';

    const parts: any[] = [{ text: prompt }];
    if (image && mimeType) {
        parts.unshift({ inlineData: { data: image, mimeType } });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.STRING },
                  label: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                }
              },
              feedback: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ["strength", "gap", "neutral"] },
                    text: { type: Type.STRING },
                    reference: { type: Type.STRING }
                  }
                }
              },
              handwriting: {
                type: Type.OBJECT,
                properties: {
                    quality: { type: Type.STRING, enum: ["excellent", "good", "fair", "poor", "illegible"] },
                    feedback: { type: Type.STRING }
                }
              },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    trend: { type: Type.STRING, enum: ["stable", "improving", "declining", "new"] }
                  }
                }
              },
              guidance: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    rationale: { type: Type.STRING }
                  }
                }
              },
              concept_stability: {
                type: Type.OBJECT,
                properties: {
                    status: { type: Type.STRING, enum: ["emerging", "unstable_pressure", "stabilizing", "robust", "unknown"] },
                    evidence: { type: Type.STRING }
                }
              },
              teacher_insight: { type: Type.STRING }
            }
          }
      }
    });

    const jsonText = (response.text || "{}").replace(/```json/g, '').replace(/```/g, '').trim();
    res.json(JSON.parse(jsonText));

  } catch (error: any) {
    console.error('Reasoning Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Chat Layer (Conversational Tasks)
// Uses EDUVANE_CHAT_API_KEY
app.post('/api/chat', async (req, res) => {
  try {
    const { model, systemInstruction, history, message } = req.body;
    const ai = getClient('CHAT');

    const chat = ai.chats.create({
      model: model || 'gemini-3-flash-preview',
      history: history || [], // State passed from client
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });

    // Stream the response back to client
    const resultStream = await chat.sendMessageStream({ message });
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of resultStream) {
        const text = chunk.text;
        if (text) {
            res.write(text);
        }
    }
    res.end();

  } catch (error: any) {
    console.error('Chat Error:', error);
    res.status(500).end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Eduvane AI Server Mode running on port ${PORT}`);
});