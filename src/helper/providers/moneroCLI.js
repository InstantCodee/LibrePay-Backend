import * as rpc from 'jayson';
import { Subscriber } from 'zeromq';

import { logger, providerManager } from '../../app';
import { BackendProvider, ITransaction } from '../backendProvider';
import { CryptoUnits } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;
    private rpcClient: rpc.HttpClient;

    NAME = 'Monero CLI';
    DESCRIPTION = 'This provider queries the Monero daemon running on your computer';
    AUTHOR = 'LibrePay Team';
    VERSION = '1.0';
    CRYPTO = CryptoUnits.MONERO;

    onEnable() {
        logger.info('Monero CLI provider is now availabe!');

        if (process.env.MONERO_WALLET_PASSWORD === undefined) {
            logger.error(`Enviroment variable MONERO_WALLET_PASSWORD is required but not set!`);
            return false;
        }

        if (process.env.MONERO_WALLET_NAME === undefined) {
            logger.error(`Enviroment variable MONERO_WALLET_FILEPATH is required but not set!`);
            return false;
        }

        if (process.env.MONERO_RPC_ADDRESS === undefined) {
            logger.error(`Enviroment variable MONERO_RPC_ADDRESS is required but not set!`);
            return false;
        }

        this.rpcClient = rpc.Client.http({
            port: 18082,
            version: 2,
            auth: 'admin:admin'        
        });
        this.rpcClient.request('open_wallet', {
            filename: process.env.MONERO_WALLET_NAME,
            password: process.env.MONERO_WALLET_PASSWORD
        }, (err, message) => {
            if (err) {
                logger.error(`Failed to open Monero wallet: ${err.message}\nMaybe a wrong password or path?`);
                providerManager.disable(this.CRYPTO);
                
                return;
            }
            console.log(message);
        });

        this.listener();

        return true;
    }

    listener() {
        this.sock = new Subscriber();
        this.sock.connect(process.env.MONERO_RPC_ADDRESS);
        this.sock.subscribe('rawtx');
    }

    // Since we can safely use the same address everytime, we just need to return a address
    // with an integrated payment id.
    getNewAddress(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const account_index = Number(process.env.MONERO_WALLET_ACCOUNT_INDEX) || 0;
            this.rpcClient.request('make_integrated_address', {}, async (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(message.result.integrated_address);
            });
        });
    }

    async getTransaction(txId: string): Promise<ITransaction> {
        
    }
}