const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const path = require('path');

function createApp({ allowedOrigins, hstsEnabled, isProductionVPS, trustProxy }) {
    const app = express();
    app.set('trust proxy', trustProxy);

    function corsOriginCheck(origin, callback) {
        if (!isProductionVPS) return callback(null, true);
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    }

    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com'],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                connectSrc: ["'self'", 'ws:', 'wss:'],
                frameAncestors: ["'none'"],
                formAction: ["'self'"],
                upgradeInsecureRequests: null
            }
        },
        strictTransportSecurity: hstsEnabled,
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
    app.use(cors({
        origin: corsOriginCheck,
        credentials: true
    }));
    app.use(bodyParser.json({ limit: '1mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        next();
    });

    // V2 documents must be revalidated; hashed assets continue through static serving.
    app.use('/v2', (req, res, next) => {
        if (req.method === 'GET' && (req.path === '/' || !path.extname(req.path))) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
        next();
    });
    app.use(express.static(path.join(__dirname, '../public')));

    return app;
}

module.exports = { createApp };
