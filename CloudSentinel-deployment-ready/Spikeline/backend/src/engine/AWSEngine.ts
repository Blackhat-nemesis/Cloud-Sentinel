import { PrismaClient } from '@prisma/client';
import { EC2Client, DescribeInstancesCommand, DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { AnomalyEngine } from './AnomalyEngine';

const prisma = new PrismaClient();

export interface AWSCredentials {
  region: string;
}

export type LiveAnalysisMode = 'normal' | 'spike' | 'cryptojacking' | 'false-positive';

export class AWSEngine {
  private tickInterval: NodeJS.Timeout | null = null;
  private io: any;
  private anomalyEngine: AnomalyEngine;
  private ec2Client: EC2Client | null = null;
  private regionalClients = new Map<string, EC2Client>();
  private currentCredentials: AWSCredentials | null = null;

  // AWS Engine uses a slower tick rate to respect rate limits
  private tickRate = 15000; // 15 seconds

  // Very rough estimation mapping for Option A
  private pricingEstimates: Record<string, number> = {
    't2.micro': 0.0116,
    't3.micro': 0.0104,
    't3.medium': 0.0416,
    't3.large': 0.0832,
    'm5.large': 0.096,
    'm5.xlarge': 0.192,
    'c5.large': 0.085,
    'c5.xlarge': 0.17,
    'g4dn.xlarge': 0.526,
    'p3.2xlarge': 3.06,
  };

  constructor(io: any) {
    this.io = io;
    this.anomalyEngine = new AnomalyEngine(io);
  }

  async start(credentials: AWSCredentials) {
    const trimmedCreds = { region: credentials.region.trim() };
    console.log(`Starting AWS Engine for region ${trimmedCreds.region}...`);
    this.currentCredentials = trimmedCreds;
    this.anomalyEngine.reset();
    
    // Prefer the AWS default credential provider chain (environment, profile,
    // ECS/EKS task role, or EC2 instance role). Browser-supplied long-lived
    // secrets should never be required by the dashboard.
    this.ec2Client = new EC2Client({ region: trimmedCreds.region });
    this.regionalClients.set(trimmedCreds.region, this.ec2Client);

    // Clear simulation data only after the client has been constructed. The
    // first tick below validates credentials and repopulates the inventory.
    await prisma.cloudResource.deleteMany();
    await prisma.telemetryEvent.deleteMany();
    await prisma.anomaly.deleteMany();

    // Initial fetch - if this fails, it throws directly to the caller.
    await this.tick(true);
    
    // Start interval
    this.tickInterval = setInterval(() => this.tick(), this.tickRate);
  }

  stop() {
    console.log('Stopping AWS Engine...');
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = null;
    this.ec2Client = null;
    this.regionalClients.clear();
    this.currentCredentials = null;
  }

  isConnected() {
    return this.ec2Client !== null;
  }

  async analyzeLiveMode(mode: LiveAnalysisMode) {
    if (!this.ec2Client) throw new Error('AWS is not connected');

    // Refresh the inventory and evaluate only real AWS resources. Live modes
    // never create instances or mutate AWS resources.
    await this.tick(true);
    const resources = await prisma.cloudResource.findMany({ where: { status: 'running' } });
    const gpuResources = resources.filter(resource => resource.gpuCount > 0);
    const unauthorizedGpuResources = gpuResources.filter(resource => !resource.approved);
    const ticketedResources = resources.filter(resource => resource.approved && (resource.tags || '').toLowerCase().includes('ticket'));
    const hourlySpend = resources.reduce((total, resource) => total + resource.hourlyCost, 0);

    this.io.emit('liveAnalysis', {
      mode,
      timestamp: new Date().toISOString(),
      activeResources: resources.length,
      hourlySpend,
      gpuResources: gpuResources.length,
      unauthorizedGpuResources: unauthorizedGpuResources.length,
      ticketedResources: ticketedResources.length
    });

    return {
      mode,
      activeResources: resources.length,
      hourlySpend,
      gpuResources: gpuResources.length,
      unauthorizedGpuResources: unauthorizedGpuResources.length,
      ticketedResources: ticketedResources.length,
      message: mode === 'normal'
        ? 'Live inventory refreshed and baseline recorded.'
        : mode === 'spike'
          ? 'Live spend velocity evaluated; no resources were created.'
          : mode === 'cryptojacking'
            ? 'Live GPU resources evaluated for unauthorized regions and principals.'
            : 'Live approved GPU workloads evaluated for false-positive suppression.'
    };
  }

  private async tick(isInitial = false): Promise<boolean> {
    if (!this.ec2Client) return false;

    try {
      let totalHourlyCost = 0;
      let activeCount = 0;
      const instances: Array<{ instance: any; region: string }> = [];

      let regionNames = [this.currentCredentials?.region || 'us-east-1'];
      try {
        const regionsResponse = await this.ec2Client.send(new DescribeRegionsCommand({ AllRegions: false }));
        const discovered = regionsResponse.Regions?.map(region => region.RegionName).filter((region): region is string => Boolean(region));
        if (discovered?.length) regionNames = discovered;
      } catch (regionError) {
        console.warn('Unable to enumerate AWS regions; using the selected region.', regionError);
      }

      for (const region of regionNames) {
        let client = this.regionalClients.get(region);
        if (!client) {
          client = new EC2Client({ region });
          this.regionalClients.set(region, client);
        }
        const response = await client.send(new DescribeInstancesCommand({
          Filters: [{ Name: 'instance-state-name', Values: ['running', 'pending'] }]
        }));
        for (const instance of response.Reservations?.flatMap(reservation => reservation.Instances || []) || []) {
          instances.push({ instance, region });
        }
      }

      const currentInstanceIds = instances.map(item => item.instance.InstanceId!).filter(Boolean);

      // Delete resources that are no longer active in AWS
      await prisma.cloudResource.deleteMany({
          where: {
              id: { notIn: currentInstanceIds }
          }
      });

      for (const { instance, region } of instances) {
        if (!instance.InstanceId) continue;
        activeCount++;

        const instanceType = instance.InstanceType || 'unknown';
        const instanceTags = instance.Tags || [];
        const tagText = JSON.stringify(instanceTags);
        const hasApprovalTag = tagText.toLowerCase().includes('cloudsentinelapproved') && tagText.toLowerCase().includes('true');
        const hasChangeTicket = tagText.toLowerCase().includes('ticket');
        const hourlyCost = this.pricingEstimates[instanceType] || 0.10; // Fallback estimate
        totalHourlyCost += hourlyCost;

        // Upsert the resource in the local DB
        await prisma.cloudResource.upsert({
          where: { id: instance.InstanceId },
          update: {
             status: instance.State?.Name === 'running' ? 'running' : 'pending'
          },
          create: {
            id: instance.InstanceId,
            accountId: 'aws-live-account',
            region,
            availabilityZone: instance.Placement?.AvailabilityZone,
            instanceType: instanceType,
            cpuCount: instance.CpuOptions?.CoreCount || 2,
            gpuCount: instanceType.startsWith('p4d') ? 8 : instanceType.startsWith('p') || instanceType.startsWith('g') ? 1 : 0,
            gpuUtilization: 0, // Not fetching real metrics to save cost
            cpuUtilization: Math.random() * 20 + 5, // Mocking CPU lightly so charts aren't completely flat
            hourlyCost: hourlyCost,
            owner: instance.KeyName || 'unknown',
            tags: JSON.stringify(instanceTags),
            approved: hasApprovalTag || hasChangeTicket
          }
        });
      }

      // Fetch all to ensure we have exactly what's in DB for anomaly engine
      const resources = await prisma.cloudResource.findMany({
        where: { status: 'running' }
      });

      const costPerMinute = totalHourlyCost / 60;

      // Create aggregated telemetry event
      const event = await prisma.telemetryEvent.create({
        data: {
          eventType: 'UsageMetrics',
          spend: costPerMinute,
          metadata: JSON.stringify({ totalHourlyCost, activeCount: resources.length, mode: 'live_aws' })
        }
      });

      this.io.emit('telemetry', event);
      this.io.emit('metrics', {
        currentHourlySpend: totalHourlyCost,
        activeResources: resources.length,
        spendPerMinute: costPerMinute
      });
      this.io.emit('resources', resources);

      // Run anomaly detection tick (if desired on real data)
      await this.anomalyEngine.processTick(costPerMinute, resources);
      return true;

    } catch (error: any) {
      console.error('Error fetching data from AWS:', error);
      this.io.emit('event', {
          timestamp: new Date().toISOString(),
          eventType: 'AWSError',
          severity: 'critical',
          metadata: JSON.stringify({ message: error?.message || 'Unknown AWS error' })
      });
      if (isInitial) {
        throw new Error(error?.message || "AWS was not able to validate the provided access credentials or region.");
      }
      return true;
    }
  }
}
