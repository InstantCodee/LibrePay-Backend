export enum CryptoUnits {
    BITCOIN = 'BTC',
    BITCOINCASH = 'BCH',
    ETHEREUM = 'ETH',
    LITECOIN = 'LTC',
    DOGECOIN = 'DOGE',
    MONERO = 'XMR'
}

export enum FiatUnits {
    USD = 'USD',
    EUR = 'EURO'
}

export enum PaymentStatus {
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
    DONE = 2
}