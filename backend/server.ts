import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { AIService } from './aiService';
import { processDeduplication, haversineDistance } from './deduplication';
import { db } from './firebaseDb';
import { NeedEntity } from '../shared/types';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Setup Multer for basic file uploads (in-memory for the demo)
const upload = multer({ storage: multer.memoryStorage() });

// Basic endpoints to fetch data for the frontend
app.get('/needs', async (req, res) => {
  const needs = await db.getAllNeeds();
  // Sort by criticalityScore descending
  needs.sort((a, b) => b.criticalityScore - a.criticalityScore);
  res.json(needs);
});

app.delete('/needs', async (req, res) => {
  try {
    await db.clearAllNeeds();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear needs' });
  }
});

app.get('/volunteers', async (req, res) => {
  const vols = await db.getVolunteers();
  res.json(vols);
});

// PILLAR 1 & 2: Ingestion and Deduplication
app.post('/ingest', upload.single('image'), async (req, res) => {
  try {
    const rawText = req.body.text || '';
    console.log('📥 Incoming Ingest Request. Text:', rawText.substring(0, 50) + '...');
    
    let base64Image: string | undefined;
    if (req.file) {
      base64Image = req.file.buffer.toString('base64');
      console.log('📸 Image attached.');
    }

    if (!rawText && !base64Image) {
      console.warn('⚠️ Rejected: No text or image provided.');
      return res.status(400).json({ error: 'Provide text or image' });
    }

    // 1. Extract Entity using Gemini
    console.log('🤖 Calling Gemini AI for extraction...');
    let extractedData = await AIService.extractNeed(rawText, base64Image);
    
    if (!extractedData || !extractedData.crisisType || !extractedData.location) {
      console.warn('⚠️ Gemini extraction failed or hit quota limit.');
      // Special Fallback for Rate Limiting / API issues to keep the demo alive
      extractedData = {
        crisisType: 'medical' as any,
        location: { name: 'Emergency Sector (Manual Review - API Busy)', lat: 19.0760, lng: 72.8777 },
        urgencyReasoning: 'API RATE LIMIT HIT. Manual verification required for this signal.',
        estimatedScale: 1
      };
    }

    // Prepare full entity
    const locationStr = `${extractedData.crisisType} ${extractedData.location?.name || 'Unknown'} ${extractedData.urgencyReasoning}`;
    
    // 2. Generate Embedding
    const embedding = await AIService.getEmbedding(locationStr);

    const newNeed: NeedEntity = {
      id: crypto.randomUUID(),
      location: { 
        name: extractedData.location?.name || 'Unknown Location', 
        lat: extractedData.location?.lat || 19.0760, 
        lng: extractedData.location?.lng || 72.8777 
      },
      crisisType: (extractedData.crisisType || 'medical') as any,
      urgencyReasoning: extractedData.urgencyReasoning || 'Immediate assistance required.',
      estimatedScale: extractedData.estimatedScale || 1,
      reportCount: 1,
      criticalityScore: 0, // Calculated in dedup
      status: 'OPEN',
      reportedAt: Date.now(),
      rawInputs: [rawText],
      embedding,
      originalLanguage: extractedData.originalLanguage
    };

    // 3. Deduplication + Velocity calculation
    const processedNeed = await processDeduplication(newNeed);

    res.json(processedNeed);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PILLAR 1-Audio: Voice Reporting
app.post('/ingest-audio', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { base64Audio } = req.body;
    if (!base64Audio) return res.status(400).json({ error: 'Missing base64Audio content' });

    const extractedData = await AIService.extractNeedFromAudio(base64Audio);
    if (!extractedData) {
       return res.status(400).json({ error: 'Could not extract actionable need from audio' });
    }

    res.json(extractedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error processing audio' });
  }
});

// PILLAR 3: Volunteer Dispatch
app.post('/dispatch', async (req, res) => {
  try {
    const { needId } = req.body;
    if (!needId) return res.status(400).json({ error: 'needId required' });

    const allNeeds = await db.getAllNeeds();
    const need = allNeeds.find(n => n.id === needId);
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const volunteers = await db.getVolunteers();
    
    // 1. Filter out burnout and out-of-bounds volunteers
    const eligibleVolunteers = volunteers.filter(v => {
      if (v.hoursLast30Days > 20) return false; // Burnout protection
      
      const dist = haversineDistance(
        need.location.lat, need.location.lng,
        v.locationCoords.lat, v.locationCoords.lng
      );
      if (dist > 5.0) return false; // 5km geo-fence
      return true;
    });

    if (eligibleVolunteers.length === 0) {
      return res.status(404).json({ error: 'No eligible volunteers found nearby' });
    }

    // 2. Score them
    const scoredVolunteers = eligibleVolunteers.map(v => {
      // inverseDistance: max 1.0 (at 0 distance), approaches 0 at 5km
      const dist = haversineDistance(need.location.lat, need.location.lng, v.locationCoords.lat, v.locationCoords.lng);
      const inverseDistance = Math.max(0, 1 - (dist / 5.0));
      
      // skillMatch: 1.0 if skill found, else 0.0
      const skillMatch = v.skills.includes(need.crisisType) ? 1.0 : 0.0;
      
      const matchScore = (v.reliabilityRate * 0.5) + (skillMatch * 0.3) + (inverseDistance * 0.2);
      
      return { volunteer: v, matchScore };
    });

    // Sort by score
    scoredVolunteers.sort((a, b) => b.matchScore - a.matchScore);
    if (!scoredVolunteers[0]) return res.status(404).json({ error: 'No volunteers available after scoring' });
    const topVolunteer = scoredVolunteers[0].volunteer;

    // 3. Generate Dispatch Message
    const dispatchMessage = await AIService.generateDispatchMessage(topVolunteer, need);

    res.json({
      volunteer: topVolunteer,
      dispatchMessage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
