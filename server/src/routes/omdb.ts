import express from 'express';
import dotenv from 'dotenv';
import axios from 'axios';

// Reload environment variables in case they weren't loaded in index.ts
dotenv.config();

const router = express.Router();

router.get('/', async (req, res) => {
  const { title } = req.query;
  
  if (!title) {
    return res.status(400).json({ error: 'Title parameter is required' });
  }

  // Debug environment variables
  console.log('OMDb Route - Environment check:', {
    OMDB_API_KEY_EXISTS: !!process.env.OMDB_API_KEY,
    OMDB_API_KEY_LENGTH: process.env.OMDB_API_KEY?.length,
    TITLE: title
  });

  if (!process.env.OMDB_API_KEY) {
    console.error('OMDB_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error: OMDb API key not found' });
  }

  try {
    const apiKey = process.env.OMDB_API_KEY;
    console.log('Making OMDb API request:', { 
      title,
      apiKeyPrefix: apiKey.substring(0, 4) + '...',
      apiKeyLength: apiKey.length
    });
    
    const response = await axios.get(`http://www.omdbapi.com/`, {
      params: {
        t: title,
        apikey: apiKey
      }
    });

    console.log('OMDb API response status:', response.status);
    console.log('OMDb API response data:', response.data);

    if (response.data.Error) {
      console.log('OMDb API returned error:', response.data.Error);
      return res.status(404).json({ error: response.data.Error });
    }

    res.json(response.data);
  } catch (error) {
    console.error('OMDb API error:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          params: error.config?.params
        }
      });
    }
    res.status(500).json({ 
      error: 'Failed to fetch movie data from OMDb',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 