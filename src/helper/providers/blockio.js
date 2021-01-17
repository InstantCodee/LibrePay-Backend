import got from "got/dist/source";
import { logger } from "../../app";
import { BackendProvider } from "../backendProvider";
import { CryptoUnits } from "../types";
import * as Pusher from "pusher"

export class Provider implements BackendProvider {

    NAME = 'Block.io';
    DESCRIPTION = 'This provider communicates with Block.io and sochain1.com to manage your online wallet.';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = CryptoUnits.DOGECOIN;

    onEnable() {
        if (process.env.BLOCKIO_DOGECOIN_API_KEY === undefined) {
            logger.error(`Enviroment variable BLOCKIO_DOGECOIN_API_KEY is required but not set!`);
            return false;
        }

        return true;
    }

    async listener() {
        const pusher = new Pusher({
            host: 'slanger1.sochain.com',
            port: '443',
            encrypted: true,
            appId: 'e9f5cc20074501ca7395',
            key: '',
            secret: ''
        });

        let ticker = pusher.
    }

}