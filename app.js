const express = require("express");
const { TwitterApi } = require("twitter-api-v2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const winston = require("winston");

// Logging Configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log' 
    })
  ]
});

require("dotenv").config();

const app = express();
const upload = multer({ 
  dest: "uploads/",
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB file size limit
  }
});

// Middleware with Enhanced Logging
app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.path} - Body: ${JSON.stringify(req.body)}`);
  next();
});

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
  'TWITTER_CONSUMER_KEY', 
  'TWITTER_CONSUMER_SECRET', 
  'TWITTER_ACCESS_TOKEN', 
  'TWITTER_ACCESS_TOKEN_SECRET'
];

requiredEnvVars.forEach(variable => {
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

// OAuth Routes
app.get("/auth/twitter", async (req, res) => {
  try {
    logger.info('Initiating Twitter OAuth Authentication');
    const authLink = await client.generateAuthLink(
      process.env.TWITTER_CALLBACK_URL,
      { linkMode: "authorize" }
    );

    req.session.oauth_token = authLink.oauth_token;
    req.session.oauth_token_secret = authLink.oauth_token_secret;

    res.redirect(authLink.url);
  } catch (error) {
    logger.error('Twitter Authentication Failed', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ 
      error: "Authentication failed", 
      details: error.message 
    });
  }
});

app.get("/auth/twitter/callback", async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;
    const { oauth_token_secret } = req.session;

    const client = new TwitterApi({
      appKey: process.env.TWITTER_CONSUMER_KEY,
      appSecret: process.env.TWITTER_CONSUMER_SECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const { accessToken, accessSecret, screenName, userId } =
      await client.login(oauth_verifier);

    // Save user tokens securely (in production, use a database)
    process.env[`TWITTER_ACCESS_TOKEN_${screenName}`] = accessToken;
    process.env[`TWITTER_ACCESS_TOKEN_SECRET_${screenName}`] = accessSecret;

    res.send(`Authenticated as ${screenName}. You can now close this window.`);
  } catch (error) {
    logger.error('Twitter Authentication Callback Failed', { 
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ 
      error: "Authentication callback failed", 
      details: error.message 
    });
  }
});

// Tweet Endpoint with Verbose Logging
app.post("/tweet", upload.single("media"), async (req, res) => {
  logger.info('Tweet Endpoint Accessed', { 
    body: req.body, 
    file: req.file 
  });

  try {
    const { text, userId } = req.body;

    // Validate text or media presence
    if (!text && !req.file) {
      return res.status(400).json({
        error: "No text or media provided",
        supportedMediaTypes: ALLOWED_MEDIA_TYPES,
      });
    }

    // Media validation
    if (req.file) {
      if (!ALLOWED_MEDIA_TYPES.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: "Unsupported media type",
          supportedTypes: ALLOWED_MEDIA_TYPES,
          uploadedType: req.file.mimetype,
        });
      }
    }

    // Configure Twitter client based on userId
    const twitterConfig = userId
      ? {
          appKey: process.env.TWITTER_CONSUMER_KEY,
          appSecret: process.env.TWITTER_CONSUMER_SECRET,
          accessToken: process.env[`TWITTER_ACCESS_TOKEN_${userId}`],
          accessSecret: process.env[`TWITTER_ACCESS_TOKEN_SECRET_${userId}`],
        }
      : {
          appKey: process.env.TWITTER_CONSUMER_KEY,
          appSecret: process.env.TWITTER_CONSUMER_SECRET,
          accessToken: process.env.TWITTER_ACCESS_TOKEN,
          accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
        };

    const twitterClient = new TwitterApi(twitterConfig);
    const rwClient = twitterClient.readWrite;

    // Rest of tweet posting logic
    let mediaId = null;
    if (req.file) {
      const mediaBuffer = fs.readFileSync(req.file.path);
      const mediaUpload = await rwClient.v1.uploadMedia(mediaBuffer, {
        mimeType: req.file.mimetype,
      });
      mediaId = mediaUpload;
      fs.unlinkSync(req.file.path);
    }

    const tweetOptions = {
      text: text || "",
      ...(mediaId && { media: { media_ids: [mediaId] } }),
    };

    const tweet = await rwClient.v2.tweet(tweetOptions);

    logger.info('Tweet Successfully Posted', { 
      tweetId: tweet.data.id 
    });

    res.status(201).json({
      success: true,
      tweet_id: tweet.data.id,
      text: tweet.data.text,
    });
  } catch (error) {
    logger.error('Tweet Creation Failed', { 
      error: error.message, 
      body: req.body, 
      file: req.file,
      stack: error.stack 
    });
    res.status(500).json({
      error: "Tweet creation failed",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced Error Handling Middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled Error: ${err.message}`, { 
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = app;