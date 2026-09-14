import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { SimulationEngine } from './engine/SimulationEngine';
import { AWSEngine, AWSCredentials, LiveAnalysisMode } from './engine/AWSEngine';
import { z } from 'zod';
import 'dotenv/config';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header include health checks and command-line diagnostics.
    if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ''))) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  credentials: false
};
const io = new Server(server, {
  cors: corsOptions
});

const prisma = new PrismaClient();
const engine = new SimulationEngine(io);
const awsEngine = new AWSEngine(io);

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '32kb' }));

const presetSchema = z.object({ preset: z.enum(['normal', 'spike', 'cryptojacking', 'false-positive']) });
const quarantineSchema = z.object({
    resourceIds: z.array(z.string().min(1)).min(1).max(500),
    confirmed: z.literal(true)
});
const revokeSchema = z.object({ principal: z.string().min(1).max(256) });
const awsSchema = z.object({ region: z.string().regex(/^[a-z]{2}-[a-z]+-\d+$/) });
const liveAnalysisSchema = z.object({ mode: z.enum(['normal', 'spike', 'cryptojacking', 'false-positive']) });

// Start engine
engine.start();

// Socket connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
});

// APIs
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mode: awsEngine.isConnected() ? 'live_aws' : 'simulation' });
});

app.get('/api/dashboard', async (req, res) => {
    const resources = await prisma.cloudResource.findMany({ where: { status: 'running' }});
    const anomalies = await prisma.anomaly.findMany({ where: { status: 'open' }});
    const quarantined = await prisma.cloudResource.count({ where: { quarantined: true }});
    
    let hourlySpend = 0;
    resources.forEach(r => hourlySpend += r.hourlyCost);
    
    res.json({
        hourlySpend,
        projected24h: hourlySpend * 24,
        projectedMonthly: hourlySpend * 24 * 30,
        activeResources: resources.length,
        activeAnomalies: anomalies.length,
        quarantinedResources: quarantined,
        riskScore: Math.min(100, 12 + (anomalies.length * 15)), // simplified risk
        financialExposure: anomalies.length > 0 ? (hourlySpend * 24) : 0 // estimated exposure if running for 24h
    });
});

app.get('/api/resources', async (req, res) => {
    const resources = await prisma.cloudResource.findMany();
    res.json(resources);
});

app.get('/api/events', async (req, res) => {
    const events = await prisma.telemetryEvent.findMany({ orderBy: { timestamp: 'desc' }, take: 100 });
    res.json(events);
});

app.get('/api/anomalies', async (req, res) => {
    const anomalies = await prisma.anomaly.findMany({ orderBy: { detectedAt: 'desc' } });
    res.json(anomalies);
});

app.get('/api/audit-log', async (req, res) => {
    const actions = await prisma.containmentAction.findMany({ orderBy: { timestamp: 'desc' } });
    res.json(actions);
});

// Simulation Controls
app.post('/api/simulation/start', async (req, res) => {
    const { preset } = presetSchema.parse(req.body);
    await engine.setPreset(preset);
    res.json({ success: true, preset });
});

app.post('/api/simulation/reset', async (req, res) => {
    engine.stop();
    await prisma.cloudResource.deleteMany();
    await prisma.telemetryEvent.deleteMany();
    await prisma.anomaly.deleteMany();
    await prisma.containmentAction.deleteMany();
    await engine.start();
    res.json({ success: true });
});

// Containment Controls
app.post('/api/containment/quarantine', async (req, res) => {
    const { resourceIds } = quarantineSchema.parse(req.body);
    
    for (const id of resourceIds) {
        await prisma.cloudResource.update({
            where: { id },
            data: { status: 'quarantined', quarantined: true }
        });
    }

    const action = await prisma.containmentAction.create({
        data: {
            actionType: 'Quarantine',
            initiatedBy: 'CloudSentinel Admin',
            affectedResources: JSON.stringify(resourceIds),
            estimatedSavings: 1500, // Dummy
            simulationMode: true
        }
    });

    res.json({ success: true, action });
});

app.post('/api/containment/revoke-credential', async (req, res) => {
    const { principal } = revokeSchema.parse(req.body);
    const action = await prisma.containmentAction.create({
        data: {
            actionType: 'RevokeIAM',
            initiatedBy: 'CloudSentinel Admin',
            affectedResources: principal,
            estimatedSavings: 0,
            simulationMode: true
        }
    });
    res.json({ success: true, action });
});

// AWS Connection Controls
app.post('/api/aws/connect', async (req, res) => {
    const creds = awsSchema.parse(req.body);
    
    // Stop simulation
    engine.stop();
    
    // Start live AWS Engine
    try {
        await awsEngine.start(creds);
        res.json({ success: true, message: 'Connected to AWS' });
    } catch (err: any) {
        // Restart simulation if AWS failed
        engine.start();
        res.status(400).json({ success: false, message: err.message || 'Failed to authenticate with AWS' });
    }
});

app.post('/api/aws/disconnect', async (req, res) => {
    // Stop live AWS Engine
    awsEngine.stop();
    
    // Restart Simulation
    engine.stop();
    await prisma.cloudResource.deleteMany();
    await prisma.telemetryEvent.deleteMany();
    await prisma.anomaly.deleteMany();
    await engine.start();
    
    res.json({ success: true, message: 'Disconnected from AWS, Simulation restored' });
});

app.post('/api/aws/analyze', async (req, res) => {
    const { mode } = liveAnalysisSchema.parse(req.body) as { mode: LiveAnalysisMode };
    if (!awsEngine.isConnected()) {
        res.status(409).json({ success: false, message: 'Connect to AWS before running live analysis.' });
        return;
    }
    const result = await awsEngine.analyzeLiveMode(mode);
    res.json({ success: true, result });
});

app.get('/api/aws/status', (req, res) => {
    res.json({ connected: awsEngine.isConnected() });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
        res.status(400).json({ success: false, message: 'Invalid request payload.' });
        return;
    }
    if (error instanceof Error && error.message === 'Origin is not allowed by CORS') {
        res.status(403).json({ success: false, message: 'Origin is not allowed.' });
        return;
    }
    console.error('Unhandled request error:', error);
    res.status(500).json({ success: false, message: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
