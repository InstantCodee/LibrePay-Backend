import { invoiceManager, providerManager } from '../app';
import { IInvoice } from '../models/invoice/invoice.interface';
import { CryptoUnits } from './types';

/**
 * This backend provider class is required to write your own backends.
 * 
 * *By default LibrePay supports Bitcoin Core.*
 */
export abstract class BackendProvider {

    /* Provider information */
    abstract readonly NAME: string;
    abstract readonly DESCRIPTION: string;
    abstract readonly VERSION: string;
    abstract readonly AUTHOR: string;

    /**
     * The cryptocurrencies that this providers supports.
     */
    abstract readonly CRYPTO: CryptoUnits[];

    /**
     * This function gets called when this provider gets activated.
     * 
     * @returns If `false` is returned, then the provider failed to initialize.
     */
    abstract onEnable(): Promise<void>;

    /**
     * Generate a new address to receive new funds.
     */
    abstract getNewAddress(): Promise<string>;

    /**
     * Get a transaction from the blockchain.
     * @param txId Hash of the transcation you're looking for.
     * @param context Invoice for context (required to calculate correct amount)
     * @returns See https://developer.bitcoin.org/reference/rpc/gettransaction.html for reference
     */
    abstract getTransaction(txId: string, context?: IInvoice): Promise<ITransaction | null>;

    /**
     * This function returns a valid link pointing to a online block explorer.
     * @param txId Transaction to generate link for.
     */
    abstract getBlockExplorerLink?(txId: string): URL;

    /**
     * Decode a raw transcation that was broadcasted in the network.
     * @param rawTx Raw transcation
     * @returns See https://developer.bitcoin.org/reference/rpc/decoderawtransaction.html for reference
     */
    //abstract decodeRawTransaction(rawTx: string): Promise<IRawTransaction>;

    /**
     * Send funds to a specific address.
     * @param recipient Address of the recipient
     * @param amount Amount of coins to transfer
     * @param comment Comment what this transaction is about
     * @param commentTo Comment on who is receiving it
     * @param subtractFeeFromAmount The fee will be deducted from the amount being sent
     * @returns The transcation id
     */
    abstract sendToAddress(
        recipient: string,
        amount: number,
        comment?: string,
        commentTo?: string,
        subtractFeeFromAmount?: boolean): Promise<string>;

    /**
     * Wait for new transactions by the network.
     */
    abstract listener(): void;

    /**
     * Provided is an array with pending invoices that have to be check.
     * 
     * **Note:** It can happen that you'll get an invoice that is not
     * intended for your cryptocurrency. Please check if invoice is
     * made for your cryptocurrency.
     * 
     * *Mainly used when LibrePay starts.*
     */
    abstract validateInvoice(invoices: IInvoice): void;

    /**
     * If this function returns true, then this provider runs in testnet mode.
     * 
     * *Note: Some currencies like Monero have a testnet and stagenet and others coins might call it different. 
     * In that case both things a meant. This just indicates if it's **not the mainnet**.*
     */
    abstract isTestnet(): Promise<boolean>;
}

export interface ITransactionDetails {
    address: string;
    category: 'send' | 'receive' | 'generate' | 'immature' | 'orphan'
    vout: number;
    fee: number;
    amount: number;
    abandoned: boolean
}

export interface ITransaction {
    id: string;
    blockhash: string;
    amount: number;                 // Total transaction amount
    fee?: number;
    confirmations: number;
    time: number;                   // Unix timestamp
    details?: ITransactionDetails[]; // In-/and Outputs of an transaction
}

// Special interface for RPC call `listreceivedbyaddress`
export interface ITransactionList {
    address: string;        // Address that performed that action
    amount: number;         // Amount that got transfered
    confirmation: number;
    txids?: string[];
}

export interface IRawTransaction {
    txid: string;
    hash: string;
    size: number;
    vsize: number;
    weight: number;
    version: number;
    vin: {
        txid: string;
        vout: number;
    }[];
    vout: {
        value: number;
        n: number;
        scriptPubKey: {
            addresses: string[];
        }
    }[];
}