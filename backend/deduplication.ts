import { NeedEntity } from '../shared/types';
import { db } from './firebaseDb';

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

const SEVERITY_WEIGHTS: Record<string, number> = {
  medical: 100,
  water: 90,
  food: 80,
  shelter: 70,
  infrastructure: 50
};

export async function processDeduplication(newNeed: NeedEntity): Promise<NeedEntity> {
  const recentNeeds = await db.getRecentUnresolvedNeeds();
  
  let bestMatch: NeedEntity | null = null;
  let highestSim = 0;

  for (const existing of recentNeeds) {
    if (!existing.embedding || !newNeed.embedding) continue;
    
    const dist = haversineDistance(
      newNeed.location.lat, newNeed.location.lng,
      existing.location.lat, existing.location.lng
    );

    if (dist <= 2.0) { // 2km geo-radius
      const sim = cosineSimilarity(newNeed.embedding, existing.embedding);
      if (sim > 0.85 && sim > highestSim) {
        highestSim = sim;
        bestMatch = existing;
      }
    }
  }

  // Helper to compute exact Priority Score 0-100
  const computeScore = (reportCount: number, firstReportedAt: number, crisisType: string, estimatedScale: number) => {
    // 1. report_velocity: clamp to max ~100 (e.g. 50+ reports/hour gives 100 base velocity)
    const hours = Math.max((Date.now() - firstReportedAt) / (1000 * 60 * 60), 0.1);
    const velocityRaw = reportCount / hours;
    const report_velocity = Math.min(100, velocityRaw * 5); // scaled assuming 20 rep/hr is severe
    
    // 2. severity_weight: 0-100 from dict
    const severity_weight = SEVERITY_WEIGHTS[crisisType] || 50;
    
    // 3. vulnerability_index: 0-100 based on scale
    const vulnerability_index = Math.min(100, estimatedScale * 5); 

    // Score = (report_velocity × 0.4) + (severity_weight × 0.4) + (vulnerability_index × 0.2)
    const rawScore = (report_velocity * 0.4) + (severity_weight * 0.4) + (vulnerability_index * 0.2);
    return Math.min(100, Math.max(0, rawScore));
  };

  if (bestMatch) {
    const mergedReportCount = bestMatch.reportCount + 1;
    const newCriticalityScore = computeScore(mergedReportCount, bestMatch.reportedAt, bestMatch.crisisType, Math.max(bestMatch.estimatedScale, newNeed.estimatedScale));
    const hoursSinceFirstReport = Math.max((Date.now() - bestMatch.reportedAt) / (1000 * 60 * 60), 0.1);
    const isCriticalVelocity = newCriticalityScore >= 80;

    const updatedNeed: NeedEntity = {
      ...bestMatch,
      reportCount: mergedReportCount,
      criticalityScore: newCriticalityScore,
      estimatedScale: Math.max(bestMatch.estimatedScale, newNeed.estimatedScale),
      status: isCriticalVelocity ? 'CRITICAL_VELOCITY' : 'OPEN',
      rawInputs: [...bestMatch.rawInputs, ...newNeed.rawInputs],
    };

    await db.updateNeed(updatedNeed.id, updatedNeed);
    return updatedNeed;
  } else {
    // Brand new cluster
    newNeed.criticalityScore = computeScore(1, Date.now(), newNeed.crisisType, newNeed.estimatedScale);
    await db.addNeed(newNeed);
    return newNeed;
  }
}
