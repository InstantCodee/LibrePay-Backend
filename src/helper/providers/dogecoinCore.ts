import { Subscriber } from 'zeromq';

import * as rpc from 'jayson';
import { invoiceManager, logger } from '../../app';
import { IInvoice } from '../../models/invoice/invoice.interface';
import { BackendProvider, IRawTransaction, ITransaction, ITransactionDetails, ITransactionList } from '../backendProvider';
import { CryptoUnits, PaymentStatus } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;
    private rpcClient: rpc.HttpClient;

    NAME = 'Dogecoin Core';
    DESCRIPTION = 'This provider communicates with the Bitcoin Core application.';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = [CryptoUnits.DOGECOIN];

    onEnable() {
        this.sock = new Subscriber();
        this.sock.connect('tcp://127.0.0.1:30000');
        this.sock.subscribe('rawtx');

        
        this.rpcClient = rpc.Client.http({
            port: 22556,
            auth: 'admin:admin'        
        });

        this.listener();
        this.watchConfirmations();

        return true;

        //logger.info('The Bitcoin Core backend is now available!');
    }

    async getNewAddress(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.rpcClient.request('getnewaddress', [''], async (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(message.result);
            });
        });
    }

    async getTransaction(txId: string): Promise<ITransaction> {
        return new Promise<ITransaction>((resolve, reject) => {
            this.rpcClient.request('gettransaction', [txId], (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(message.result);
            });
        });
    }

    private async decodeRawTransaction(rawTx: string): Promise<IRawTransaction> {
        return new Promise<IRawTransaction>((resolve, reject) => {
            this.rpcClient.request('decoderawtransaction', [rawTx], (err, decoded) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(decoded.result);
            });
        });
    }

    async sendToAddress(
        recipient: string,
        amount: number,
        comment?: string,
        commentTo?: string,
        subtractFeeFromAmount?: boolean): Promise<string> {
            return new Promise<string>((resolve, reject) => {
                this.rpcClient.request('sendtoaddress', [recipient, amount, comment, commentTo, subtractFeeFromAmount], (err, decoded) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    resolve(decoded.result.txid);
                });
            });
    }

    async listener() {
        for await (const [topic, msg] of this.sock) {
            const rawtx = msg.toString('hex');
            const tx = await this.decodeRawTransaction(rawtx);
            
            
            tx.vout.forEach(output => {                                    
                // Loop over each output and check if the address of one matches the one of an invoice.
                invoiceManager.getPendingInvoices().filter(item => { return item.paymentMethod === CryptoUnits.DOGECOIN }).forEach(async invoice => {   
                    if (output.scriptPubKey.addresses === undefined) return;    // Sometimes (weird) transaction don't have any addresses

                    logger.debug(`${output.scriptPubKey.addresses} <-> ${invoice.receiveAddress}`);
                    // We found our transaction (https://developer.bitcoin.org/reference/rpc/decoderawtransaction.html)
                    if (output.scriptPubKey.addresses.indexOf(invoice.receiveAddress) !== -1) {
                        const senderAddress = output.scriptPubKey.addresses[output.scriptPubKey.addresses.indexOf(invoice.receiveAddress)];
                        logger.info(`Transcation for invoice ${invoice.id} received! (${tx.hash})`);

                        // Change state in database
                        invoiceManager.validatePayment(invoice, tx.txid);
                    }
                })
            }); 
            
        }
    }

    async watchConfirmations() {
        setInterval(() => {
            invoiceManager.getUnconfirmedTransactions().filter(item => { return item.paymentMethod === CryptoUnits.DOGECOIN }).forEach(async invoice => {
                if (invoice.transcationHash.length === 0) return;
                const transcation = invoice.transcationHash;
                
                const tx = await this.getTransaction(transcation);
                invoiceManager.setConfirmationCount(invoice, tx.confirmations);
            });
        }, 2_000);
    }
    
    async validateInvoice(invoice: IInvoice) {
        if (invoice.status === PaymentStatus.DONE || invoice.status === PaymentStatus.CANCELLED) return;
        if (invoice.paymentMethod !== CryptoUnits.DOGECOIN) return;

        this.rpcClient.request('listreceivedbyaddress', [0, false, false], async (err, message) => {
            if (err) {
                logger.error(`There was an error while getting transcations of address ${invoice.receiveAddress}: ${err.message}`);
                return;
            }

            // Unfortunately we have to search the map manually.
            const res = (message.result as ITransactionList[]).find(item => {
                return item.address === invoice.receiveAddress;
            }) as ITransactionList;
            if (res === undefined) return;

            res.txids.forEach(async tx => {
                invoiceManager.validatePayment(invoice, tx);
            });
        });
    }
}

