import * as rpc from 'jayson';
import { Subscriber } from 'zeromq';

import { invoiceManager, logger } from '../../app';
import { IInvoice } from '../../models/invoice/invoice.interface';
import { Invoice } from '../../models/invoice/invoice.model';
import { BackendProvider, ITransaction } from '../backendProvider';
import { CryptoUnits } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;
    private rpcClient: rpc.HttpClient;

    NAME = 'Monero RPC Wallet';
    DESCRIPTION = 'This provider queries the Monero daemon running on your computer';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = [CryptoUnits.MONERO];

    onEnable() {
        return new Promise<void>((resolve, reject) => {
            if (process.env.MONERO_WALLET_PASSWORD === undefined) {
                reject('Enviroment variable MONERO_WALLET_PASSWORD is required but not set!');
                return;
            }
    
            if (process.env.MONERO_WALLET_NAME === undefined) {
                reject('Enviroment variable MONERO_WALLET_FILEPATH is required but not set!');
                return;
            }
    
            if (process.env.MONERO_ZMQ_ADDRESS === undefined) {
                reject('Enviroment variable MONERO_ZMQ_ADDRESS is required but not set!');
                return;
            }
    
            this.rpcClient = rpc.Client.http({
                path: '/json_rpc',
                port: 38085
            });
            this.rpcClient.request('open_wallet', {
                filename: process.env.MONERO_WALLET_NAME,
                password: process.env.MONERO_WALLET_PASSWORD
            }, (err, message) => {
                if (err) {
                    reject(`Failed to open Monero wallet: ${err}\nMaybe a wrong password or path?`)
                    return;
                }
                this.listener();
                resolve();
            });
        });
    }

    async listener() {
        // Since we can't really use the ZeroMQ interface, we have to query every n-seconds.
        // Technically there is a ZeroMQ interface but there is almost no to zero documentation for it.
        setInterval(() => {
            invoiceManager.getPendingInvoices().forEach(async invoice => {
                if (invoice.paymentMethod !== CryptoUnits.MONERO) return;
                
                const tx = await this.getPaymentById(((await this.splitAddress(invoice.receiveAddress)).paymentId));
                if (tx === null) {
                    return;
                }

                logger.info(`Transcation for invoice ${invoice.id} received!`);
                invoiceManager.validatePayment(invoice, tx.id);
            });
        }, 5_000);
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

    /**
     * @returns If a payment has not been made yet, `null` will be returned.
     */
    async getTransaction(txid: string, context?: IInvoice): Promise<ITransaction | null> {
        return new Promise<ITransaction>(async (resolve, reject) => {            
            // We're still missing the confirmation count, since we don't get it with this function.
            this.rpcClient.request('get_transfer_by_txid', { txid }, async (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }

                const paymentTransaction = message.result.transfer;
                if (paymentTransaction === undefined) {
                    console.log(message)
                    logger.warning(`Tried to get transfer by txid but failed: ${message}`);
                    resolve(null);
                    return;
                }

                // Renaming properties to make them fit into interface.
                const ret: ITransaction = {
                    id: paymentTransaction.txid,
                    blockhash: paymentTransaction.txid,
                    amount: this.decimalToFloat(paymentTransaction.amount),
                    confirmations: paymentTransaction.confirmations,
                    time: paymentTransaction.timestamp,
                    fee: paymentTransaction.fee
                };
                resolve(ret);
            });
        });
    }

    sendToAddress(
        recipient: string,
        amount: number,
        comment?: string,
        commentTo?: string,
        subtractFeeFromAmount?: boolean): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                const account_index = Number(process.env.MONERO_WALLET_ACCOUNT_INDEX) || 0;
                this.rpcClient.request('transfer', { destinations: [{ amount, address: recipient }] }, async (err, message) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    logger.debug(`[Monero] Transaction has been made: ${message.result.tx_hash}`);
                    resolve(message.result.tx_hash);
                });
            });
        }

    async validateInvoice(invoice: IInvoice) {
        if (invoice.paymentMethod !== CryptoUnits.MONERO) return;

        const split = await this.splitAddress(invoice);
        if (split === null) {
            return;
        }
        
        const transaction = await this.getPaymentById(split.paymentId);

        if (transaction === null) {
            return; // Transaction has not been yet made.
        }
        
        invoiceManager.validatePayment(invoice, transaction.blockhash);
        /*this.rpcClient.request('get_payments', { payment_id }, async (err, message) => {
            if (err) {
                logger.error(`[Monero] There was an error while gettings payments of ${payment_id}: ${err}`);
                return;
            }

            const payment = message.result.payments[0];
            invoiceManager.validatePayment(invoice, payment.tx_hash);
        });*/
    }

    private getPaymentById(payment_id: string): Promise<ITransaction> {
        return new Promise(resolve => {
            this.rpcClient.request('get_payments', { payment_id: payment_id }, async (err, message) => {
                if (err) {
                    resolve(null);
                    return;
                }
    
                console.log(payment_id, message);                
    
                // The payment has not been made yet
                if (message.result.payments === undefined) {
                    resolve(null);
                    return;
                }
    
                resolve(await this.getTransaction(message.result.payments[0].tx_hash));
            });
        })
    }

    /**
     * This method will take the full receive address and will return the payment id and orignal address.
     * @returns Will return `null` if input was invalid.
     */
    private splitAddress(context: IInvoice | string): Promise<{ address: string, paymentId: string } | null> {
        return new Promise(resolve => {
            const address = typeof(context) === 'string' ? context : context.receiveAddress;
            this.rpcClient.request('split_integrated_address', { integrated_address: address }, async (err, message) => {
                if (err) {
                    logger.error(`[Monero] There was an error while splitting the address ${address}: ${err}`);
                    resolve(null);
                    return;
                }                
                resolve({ paymentId: message.result.payment_id, address: message.result.standard_address });
            });
        })
    }

    /**
     * When querying the Monero RPC wallet we get full decimals back instead of floats. Maybe because
     * floats can be a hussle sometimes. Anyway, we have to convert them back into the original format.
     */
    private decimalToFloat(int: number) {
        return int / 1000000000000;
    }
}