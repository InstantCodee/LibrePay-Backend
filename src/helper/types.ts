import { logger } from "../app";

export enum CryptoUnits {
    BITCOIN = 'BTC',
    BITCOINCASH = 'BCH',
    ETHEREUM = 'ETH',
    LITECOIN = 'LTC',
    DOGECOIN = 'DOGE',
    MONERO = 'XMR'
}

/**
 * Get the decimal places by id
 */
export const decimalPlaces = new Map<CryptoUnits, number>([
    [CryptoUnits.BITCOIN, 8],
    [CryptoUnits.BITCOINCASH, 8],
    [CryptoUnits.ETHEREUM, 18],
    [CryptoUnits.LITECOIN, 8],
    [CryptoUnits.DOGECOIN, 8],
    [CryptoUnits.MONERO, 12]
])

export function findCryptoBySymbol(symbol: string): string | null {
    for (let coin in CryptoUnits) {
        if (CryptoUnits[coin] === symbol.toUpperCase()) {
            return coin;
        }
    }
    return null;
}

export enum FiatUnits {
    USD = 'USD',
    EUR = 'EUR'
}

export enum PaymentStatus {
    /**
     * The payment has been cancelled by the user.
     */
    CANCELLED = -2,

    /**
     * The invoice has been requested but the payment method has to be choosen.
     */
    REQUESTED = -1,

    /**
     * The payment has not been yet started. The user did not initiated the transfer.
     */
    PENDING = 0,

    /**
     * The payment has been made but it's not yet confirmed.
     */
    UNCONFIRMED = 1,

    /**
     * The payment is completed and the crypto is now available.
     */
    DONE = 2,
}

// I'll will just leave that here
export function roundNumber(number: number, precision: number) {
    var factor = Math.pow(10, precision);
    var tmpNumber = number * factor;
    var rounded = Math.round(tmpNumber);
    return rounded / factor;
};
