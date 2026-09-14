import { PrismaClient } from '@prisma/client';
import { AnomalyEngine } from './AnomalyEngine';

const prisma = new PrismaClient();

export class SimulationEngine {
  private tickInterval: NodeJS.Timeout | null = null;
  private isStarting = false;
  private lifecycleToken = 0;
  private io: any;
  private anomalyEngine: AnomalyEngine;

  // Simulation State
  private isSimulationMode = true;
  private currentPreset = 'normal'; // 'normal', 'spike', 'cryptojacking', 'false-positive'
  private tickRate = 2000; // 2 seconds
  
  // Data State
  private activeResources: string[] = [];
  
  constructor(io: any) {
    this.io = io;
    this.anomalyEngine = new AnomalyEngine(io);
  }

  async start() {
    if (this.tickInterval || this.isStarting) return;
    this.isStarting = true;
    const token = ++this.lifecycleToken;
    console.log('Starting simulation engine...');
    try {
      this.anomalyEngine.reset();
      await this.seedInitialState();
      if (token === this.lifecycleToken) {
        this.tickInterval = setInterval(() => this.tick(), this.tickRate);
      }
    } finally {
      this.isStarting = false;
    }
  }

  stop() {
    this.lifecycleToken++;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.isStarting = false;
  }

  async setPreset(preset: string) {
    this.currentPreset = preset;
    console.log(`Simulation preset changed to: ${preset}`);
    
    if (preset === 'cryptojacking') {
      await this.triggerCryptojackingAttack();
    } else if (preset === 'spike') {
      await this.triggerGPUSpike();
    } else if (preset === 'false-positive') {
      await this.triggerFalsePositive();
    }
  }

  private async seedInitialState() {
    const existing = await prisma.cloudResource.count();
    if (existing > 0) {
        // Load active resources
        const res = await prisma.cloudResource.findMany({ where: { status: 'running' }});
        this.activeResources = res.map(r => r.id);
        return;
    }

    console.log('Seeding initial state...');
    
    // Seed ~37 resources to match requirement
    const regions = [
      'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1',
      'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
      'ap-south-1', 'ap-east-1', 'ap-southeast-1', 'ap-southeast-2',
      'ap-northeast-1', 'ap-northeast-2', 'me-south-1', 'af-south-1', 'sa-east-1'
    ];
    const types = ['t3.medium', 'm5.large', 'c5.xlarge'];
    
    for (let i = 0; i < 37; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const hourlyCost = type === 't3.medium' ? 0.0416 : type === 'm5.large' ? 0.096 : 0.17;
      
      const res = await prisma.cloudResource.create({
        data: {
          accountId: '123456789012',
          // Guarantee geographic coverage in the demo: every supported region
          // receives at least one resource before regions are repeated.
          region: regions[i % regions.length],
          instanceType: type,
          cpuCount: type === 't3.medium' ? 2 : type === 'm5.large' ? 2 : 4,
          gpuCount: 0,
          hourlyCost,
          owner: 'engineering-team',
          project: 'core-platform',
          tags: JSON.stringify({ env: 'prod' }),
          approved: true
        }
      });
      this.activeResources.push(res.id);
    }
  }

  private async tick() {
    // Generate telemetry for active resources
    const resources = await prisma.cloudResource.findMany({
      where: { status: 'running' }
    });

    let totalHourlyCost = 0;
    
    for (const res of resources) {
        totalHourlyCost += res.hourlyCost;

        // Slight variation in utilization
        const newCpuUtil = Math.min(100, Math.max(0, res.cpuUtilization + (Math.random() * 10 - 5)));
        const newGpuUtil = res.gpuCount > 0 ? Math.min(100, Math.max(0, res.gpuUtilization + (Math.random() * 20 - 10))) : 0;
        
        try {
            await prisma.cloudResource.update({
                where: { id: res.id },
                data: { cpuUtilization: newCpuUtil, gpuUtilization: newGpuUtil }
            });
        } catch (err) {
            // Ignore if record was deleted by AWSEngine transition
        }
    }

    const costPerMinute = totalHourlyCost / 60;

    // Create aggregated telemetry event
    const event = await prisma.telemetryEvent.create({
      data: {
        eventType: 'UsageMetrics',
        spend: costPerMinute,
        metadata: JSON.stringify({ totalHourlyCost, activeCount: resources.length })
      }
    });

    this.io.emit('telemetry', event);
    this.io.emit('metrics', {
      currentHourlySpend: totalHourlyCost,
      activeResources: resources.length,
      spendPerMinute: costPerMinute
    });
    this.io.emit('resources', resources);

    // Run anomaly detection tick
    await this.anomalyEngine.processTick(costPerMinute, resources);
  }

  private async triggerCryptojackingAttack() {
      // Create 50 p4d.24xlarge instances across unauthorized regions
      const badRegions = ['ap-northeast-1', 'me-south-1', 'sa-east-1', 'ap-southeast-1'];
      const newIds = [];
      for(let i=0; i<50; i++) {
          const region = badRegions[i % badRegions.length];
          const res = await prisma.cloudResource.create({
              data: {
                accountId: '123456789012',
                region,
                instanceType: 'p4d.24xlarge',
                cpuCount: 96,
                gpuCount: 8,
                gpuUtilization: 99,
                cpuUtilization: 80,
                hourlyCost: 32.77, // Real AWS cost
                owner: 'leaked-dev-key',
                approved: false
              }
          });
          newIds.push(res.id);
          
          const event = await prisma.telemetryEvent.create({
            data: {
                eventType: 'GPUInstanceDetected',
                resourceId: res.id,
                region,
                iamPrincipal: 'leaked-dev-key',
                metadata: JSON.stringify({ instanceType: 'p4d.24xlarge' })
            }
          });
          this.io.emit('telemetry', event);
      }
      this.activeResources.push(...newIds);
  }

  private async triggerGPUSpike() {
      for(let i=0; i<15; i++) {
          const res = await prisma.cloudResource.create({
              data: {
                accountId: '123456789012',
                region: 'us-east-1',
                instanceType: 'g4dn.xlarge',
                cpuCount: 4,
                gpuCount: 1,
                gpuUtilization: 50,
                cpuUtilization: 40,
                hourlyCost: 0.526,
                owner: 'data-science',
                approved: false
              }
          });
          this.activeResources.push(res.id);
      }
  }

  private async triggerFalsePositive() {
      const res = await prisma.cloudResource.create({
          data: {
            accountId: '123456789012',
            region: 'us-west-2',
            instanceType: 'p3.2xlarge',
            cpuCount: 8,
            gpuCount: 1,
            gpuUtilization: 95, // High util
            cpuUtilization: 60,
            hourlyCost: 3.06,
            owner: 'approved-ml-role',
            project: 'q3-model-training',
            tags: JSON.stringify({ ticket: 'CHG-9942', env: 'training' }),
            approved: true
          }
      });
      this.activeResources.push(res.id);
  }
}
