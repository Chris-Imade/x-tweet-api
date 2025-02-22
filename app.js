const express = require("express");
const { TwitterApi } = require("twitter-api-v2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const winston = require("winston");
const cors = require("cors");

// Logging Configuration
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "combined.log",
    }),
  ],
});

require("dotenv").config();

const app = express();
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
});

// Middleware with Enhanced Logging
app.use((req, res, next) => {
  logger.info(
    `[${req.method}] ${req.path} - Body: ${JSON.stringify(req.body)}`
  );
  next();
});

// Middleware configuration
app.use(
  cors({
    origin: ["http://localhost:5173", "https://www.chonkler.fun"],
    methods: ["GET", "POST", "PUT", "DELETE"], // Optional: Specify allowed HTTP methods
    credentials: true, // Optional: Include cookies and other credentials in requests
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_session_secret",
    resave: false,
    saveUninitialized: true,
  })
);

// Allowed media types
const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "video/mp4",
  "video/quicktime",
];

// Validate Environment Variables
const requiredEnvVars = [
  "TWITTER_CONSUMER_KEY",
  "TWITTER_CONSUMER_SECRET",
  "TWITTER_ACCESS_TOKEN",
  "TWITTER_ACCESS_TOKEN_SECRET",
];

requiredEnvVars.forEach((variable) => {
  if (!process.env[variable]) {
    logger.error(`Missing required environment variable: ${variable}`);
    process.exit(1);
  }
});

// OAuth Initialization
const client = new TwitterApi({
  appKey: process.env.TWITTER_CONSUMER_KEY,
  appSecret: process.env.TWITTER_CONSUMER_SECRET,
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

const tweetQueue = [];

// Function to process the tweet queue
const processTweetQueue = () => {
  if (tweetQueue.length === 0) {
    return;
  }

  const { text, mediaPath, mediaType } = tweetQueue.shift();

  // Configure Twitter client with single user credentials
  const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
  const rwClient = twitterClient.readWrite;

  const postTweet = async () => {
    try {
      let mediaId = null;
      if (mediaPath) {
        const mediaBuffer = fs.readFileSync(mediaPath);
        const mediaUpload = await rwClient.v1.uploadMedia(mediaBuffer, {
          mimeType: mediaType,
        });
        mediaId = mediaUpload;
        fs.unlinkSync(mediaPath);
      }

      const tweetOptions = {
        text: text || "",
        ...(mediaId && { media: { media_ids: [mediaId] } }),
      };

      const tweet = await rwClient.v2.tweet(tweetOptions);

      logger.info("Tweet Successfully Posted", {
        tweetId: tweet.data.id,
      });

      // Log when the tweet has been posted
      logger.info("Tweet from queue posted", {
        text,
        mediaPath,
        mediaType,
        tweetId: tweet.data.id,
      });

      // Process the next tweet in the queue
      processTweetQueue();
    } catch (error) {
      logger.error("Tweet Creation Failed", {
        error: error.message,
        stack: error.stack,
      });

      // Process the next tweet in the queue even if there was an error
      processTweetQueue();
    }
  };

  setTimeout(postTweet, 5 * 60 * 1000); // Schedule tweet to be posted after 5 minutes
  // setTimeout(postTweet, 24 * 60 * 60 * 1000); // Schedule tweet to be posted after 24 hours
};

// Tweet Endpoint with Verbose Logging
app.post("/tweet", upload.single("media"), (req, res) => {
  logger.info("Tweet Endpoint Accessed", {
    body: req.body,
    file: req.file,
  });

  const { text } = req.body;

  // Validate text or media presence
  if (!text && !req.file) {
    return res.status(400).json({
      error: "No text or media provided",
      supportedMediaTypes: ALLOWED_MEDIA_TYPES,
    });
  }

  // Media validation
  if (req.file && !ALLOWED_MEDIA_TYPES.includes(req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: "Unsupported media type",
      supportedTypes: ALLOWED_MEDIA_TYPES,
      uploadedType: req.file.mimetype,
    });
  }

  // Add tweet to the queue
  tweetQueue.push({
    text,
    mediaPath: req.file ? req.file.path : null,
    mediaType: req.file ? req.file.mimetype : null,
  });

  // Respond immediately
  res.status(202).json({
    success: true,
    message: "Tweet added to queue and will be posted in due time.",
  });

  // Process the tweet queue
  processTweetQueue();
});

// Helper function to retry with exponential backoff
const retryWithBackoff = async (fn, retries = 5, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0 || error.code !== 429) {
      throw error;
    }
    logger.warn(`Rate limit exceeded. Retrying in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
};

// Enhanced Error Handling Middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 4951;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
