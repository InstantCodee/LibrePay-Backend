import { CryptoUnits } from './src/helper/types';
/**
 * Here you can change various settings like database credentials, http settings and more.
 * 
 * Debug mode and MongoDB credentials are set via enviroment variables for security reasons.
 */
export const config: IConfig = {
    authentification: {
        pepper: 'J3%_zö\\^',
        salt_length: 8,
        argonTimecost: 8,
        minPasswordLength: 4,
        maxPasswordLength: 150
    },
    http: {
        port: 2009,
        host: "0.0.0.0"
    },
    transcations: {
        // If a payment has been made and its value is this amount less, it would be still accepted.
        acceptMargin: 0.00000001
    },
    payment: {
        // This is a list of cryptocurrencies that you want to accpet.
        methods: [
            CryptoUnits.BITCOIN,
            CryptoUnits.DOGECOIN,
            CryptoUnits.ETHEREUM,
            CryptoUnits.MONERO
        ]
    }
}
/**
 * END OF CONFIG
 * ====================
 */


export interface IConfig {
    authentification: {
        pepper: string,
        salt_length: number,
        argonTimecost: number,
        minPasswordLength: number,
        maxPasswordLength: number
    },
    http: {
        port: number,
        host: string
    },
    transcations: {
        acceptMargin: number
    },
    payment: {
        methods: CryptoUnits[];
    }
}