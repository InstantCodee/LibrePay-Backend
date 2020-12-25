import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import { config as dconfig } from 'dotenv';
import * as express from 'express';
import * as rpc from 'jayson';
import * as mongoose from 'mongoose';
import * as winston from 'winston';

import { config } from '../config';
import { hashPassword, randomPepper, randomString } from './helper/crypto';
import { InvoiceScheduler } from './helper/invoiceScheduler';
import { User } from './models/user/user.model';
import { invoiceRouter } from './routes/invoice';
import { userRouter } from './routes/user';

// Load .env
dconfig({ debug: true, encoding: 'UTF-8' });

export const IS_DEBUG = process.env.DEBUG == 'true';
export const MONGO_URI = process.env.MONGO_URI || "";
export const JWT_SECRET = process.env.JWT_SECRET || "";
export const INVOICE_SECRET = process.env.INVOICE_SECRET || "";

export let rpcClient: rpc.HttpClient | undefined = undefined;
export let invoiceScheduler: InvoiceScheduler | undefined = undefined;

export let logger: winston.Logger;

async function run() {
    const { combine, timestamp, label, printf, prettyPrint } = winston.format;

    const myFormat = printf(({ level, message, label, timestamp }) => {
        return `${timestamp} ${level} ${message}`;
    });

    logger = winston.createLogger({
        level: IS_DEBUG ? 'debug' : 'info',
        levels: winston.config.syslog.levels,
        format: combine(
            timestamp(),
            prettyPrint(),
            myFormat
        ),
        defaultMeta: { },
        transports: [
            new winston.transports.File({ filename: 'error.log', level: 'error' }),
            new winston.transports.File({ filename: 'combined.log' })
        ]
    });

    // Adding seperate logger for files (with color)
    logger.add(new winston.transports.Console({
        format: combine(
            winston.format.colorize({ level: true }),
            timestamp(),
            prettyPrint(),
            myFormat
        )
    }));

    if (IS_DEBUG) {
        logger.info('Debug mode is enabled. Do not use this in production!');
    }

    if (JWT_SECRET == '') {
        logger.crit('No JWT secret was provided. Make sure you add JWT_SECRET=YOUR_SECRET to your .env file.');
        process.exit(1);
    }

    if (MONGO_URI == '') {
        logger.crit('No MongoDB URI was provided. Make sure you add MONGO_URI=mongodb+srv://... to your .env file.')
        process.exit(1);
    }

    if (INVOICE_SECRET == '') {
        logger.crit('No invoice secret was provided. Make sure you add INVOICE_SECRET=(long random string) to your .env file.')
        process.exit(1);
    }

    const connection = await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true }).catch((err) => {
        logger.crit("Database connection could not be made: ", err);
        process.exit(1);
    });
    logger.info(`Database connection made to ${mongoose.connection.host}`);

    // Check if admin account doesn't exists
    if((await User.countDocuments()) == 0) {
        const randomPassword = "$1" + randomString(12);
        const salt = randomString(config.authentification.salt_length);

        await User.create({
            name: 'admin',
            password: await hashPassword(randomPassword + salt + randomPepper()),
            salt,
            createdAt: new Date(Date.now()),
            lastLogin: new Date(0)
        });
        logger.info("=================================================================================");
        logger.info("ADMIN USER HAS BEEN CREATED! Username: admin\tPassword: " + randomPassword);
        logger.info("=================================================================================");
    } else {
        logger.debug("At least one admin user already exists, skip.");
    }

    invoiceScheduler = new InvoiceScheduler();
    
    const app = express();
    app.use(express.json());
    app.use(cors());
    app.use(bodyParser.json({ limit: '2kb' }));

    app.get('/', (req, res) => res.status(200).send('OK'));
    app.use('/invoice', invoiceRouter);
    app.use('/user', userRouter);

    app.listen(config.http.port, config.http.host, () => {
        logger.info(`HTTP server started on port ${config.http.host}:${config.http.port}`);
    });

    rpcClient = rpc.Client.http({
        port: 18332,
        auth: 'admin:admin'        
    });
}

run();