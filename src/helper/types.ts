export enum CryptoUnits {
    BITCOIN = 'BTC',
    BITCOINCASH = 'BCH',
    ETHEREUM = 'ETH',
    LITECOIN = 'LTC',
    DOGECOIN = 'DOGE',
    MONERO = 'XMR'
}

export function findCryptoBySymbol(symbol: string): string | null {
    for (let coin in CryptoUnits) {
        if (CryptoUnits[coin] === symbol.toUpperCase()) return coin;
    }
    return null;
}

export enum FiatUnits {
    USD = 'USD',
    EUR = 'EUR'
}

export enum PaymentStatus {
    /**
     * The invoice has been requested but the payment method has to be choosen.
     */
    REQUESTED = -1,

    /**
     * The payment has not been yet started. The user did not initiated the transfer.
     */
    PENDING = 0,

    /**
     * The payment has been paid, but not completly.
     */
    PARTIALLY = 1,

    /**
     * The payment has been made but it's not yet confirmed.
     */
    UNCONFIRMED = 2,

    /**
     * The payment is completed and the crypto is now available.
     */
    DONE = 3,

    /**
     * The payment has been cancelled by the user.
     */
    CANCELLED = 4
}