import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AnomalyEngine {
  private io: any;
  private spendHistory: number[] = [];
  
  constructor(io: any) {
    this.io = io;
  }

  reset() {
    this.spendHistory = [];
  }

  async processTick(currentSpendPerMinute: number, activeResources: any[]) {
    this.spendHistory.push(currentSpendPerMinute);
    if (this.spendHistory.length > 30) {
        this.spendHistory.shift(); // Keep last 30 intervals
    }

    await this.checkZScoreAnomaly(currentSpendPerMinute);
    await this.checkVelocityAnomaly();
    await this.checkCryptojackingHeuristic(activeResources);
  }

  private async hasOpenAnomaly(type: string, affectedResourceIds: string) {
      const existing = await prisma.anomaly.findFirst({
          where: { type, affectedResourceIds, status: 'open' },
          select: { id: true }
      });
      return Boolean(existing);
  }

  private async checkZScoreAnomaly(currentSpend: number) {
      if (this.spendHistory.length < 10) return; // Need baseline

      const mean = this.spendHistory.reduce((a,b) => a+b, 0) / this.spendHistory.length;
      const variance = this.spendHistory.reduce((a,b) => a + Math.pow(b - mean, 2), 0) / this.spendHistory.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) return;

      const zScore = (currentSpend - mean) / stdDev;

      if (zScore >= 3) {
          if (await this.hasOpenAnomaly('z-score', 'global')) return;
          const anomaly = await prisma.anomaly.create({
              data: {
                  type: 'z-score',
                  severity: zScore > 5 ? 'critical' : 'high',
                  score: zScore * 10,
                  confidence: 95,
                  affectedResourceIds: 'global',
                  explanation: `Spend z-score reached ${zScore.toFixed(2)}, indicating a sudden spike.`,
                  recommendedAction: 'Review recently provisioned resources.'
              }
          });
          this.io.emit('anomaly', anomaly);
      }
  }

  private async checkVelocityAnomaly() {
      if (this.spendHistory.length < 5) return;
      
      const latest = this.spendHistory[this.spendHistory.length - 1];
      const fiveMinsAgo = this.spendHistory[this.spendHistory.length - 5];

      if (fiveMinsAgo > 0 && latest > (fiveMinsAgo * 3)) { // 300% increase
           if (await this.hasOpenAnomaly('velocity', 'global')) return;
           const anomaly = await prisma.anomaly.create({
              data: {
                  type: 'velocity',
                  severity: 'critical',
                  score: 90,
                  confidence: 99,
                  affectedResourceIds: 'global',
                  explanation: `Spend increased by >300% within 5 minutes.`,
                  recommendedAction: 'Trigger automatic quarantine.'
              }
          });
          this.io.emit('anomaly', anomaly);
      }
  }

  private async checkCryptojackingHeuristic(resources: any[]) {
      // Find recently created unauthorized GPU resources
      const recent = resources.filter(r => 
          new Date().getTime() - new Date(r.createdAt).getTime() < 60000 && 
          r.gpuCount > 0 && 
          !r.approved
      );

      if (recent.length === 0) return;

      for (const res of recent) {
          let score = 0;
          const badRegions = ['ap-northeast-1', 'me-south-1', 'sa-east-1', 'ap-southeast-1'];
          
          if (badRegions.includes(res.region)) score += 25;
          if (res.gpuCount > 0) score += 20;
          if (res.owner === 'leaked-dev-key') score += 15;
          if (res.gpuUtilization > 80) score += 10;

          // False positive filters
          if (res.tags && res.tags.includes('ticket')) score -= 20;
          if (res.approved) score -= 15;

          if (score >= 60) {
              if (await this.hasOpenAnomaly('cryptojacking', res.id)) continue;
              const anomaly = await prisma.anomaly.create({
                  data: {
                      type: 'cryptojacking',
                      severity: score >= 80 ? 'critical' : 'high',
                      score,
                      confidence: score > 80 ? 98.7 : 85.0,
                      affectedResourceIds: res.id,
                      explanation: `Cryptojacking heuristic matched: unauthorized region, GPU instance, leaked key.`,
                      recommendedAction: 'Quarantine resource and revoke IAM credential.'
                  }
              });
              this.io.emit('anomaly', anomaly);
              this.io.emit('event', {
                  timestamp: new Date().toISOString(),
                  eventType: 'CryptojackingHeuristicMatched',
                  severity: 'critical',
                  region: res.region,
                  resourceId: res.id,
                  iamPrincipal: res.owner
              });
          }
      }
  }
}
