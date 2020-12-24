import * as rpc from 'jayson';
import { createConnection } from 'typeorm';
import * as winston from 'winston';

export const IS_DEBUG = process.env.DEBUG == 'true';

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

    const dbConnection = await createConnection({
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        username: 'librepay',
        password: 'librepay',
        database: 'librepay',
        entities: ['models/**/*.ts'],
        synchronize: true,
        logging: false
    }).catch(error => {
        logger.error(`Connection to database failed: ${error}`);
        process.exit(1);
    });
    
    const client = rpc.Client.http({
        port: 18332,
        auth: 'admin:admin'        
    });

    /*client.request('getnewaddress', ['TestRPC', 'bech32'], (err, response) => {
        if (err) throw err;
        console.log(response.result);
    })*/
}

run();