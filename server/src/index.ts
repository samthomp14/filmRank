import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import omdbRoutes from './routes/omdb';

// Load environment variables with explicit path
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env file from:', envPath);

const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Log all environment variables (excluding sensitive data)
console.log('Environment variables loaded:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  OMDB_API_KEY: process.env.OMDB_API_KEY ? 'Set' : 'Not set',
  OMDB_API_KEY_LENGTH: process.env.OMDB_API_KEY?.length
});

// Validate required environment variables
const requiredEnvVars = ['OMDB_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/omdb', omdbRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 