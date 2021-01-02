import { Subscriber } from 'zeromq';

import { invoiceManager, logger, rpcClient } from '../../app';
import { IInvoice } from '../../models/invoice/invoice.interface';
import { BackendProvider, IRawTransaction, ITransaction, ITransactionList } from '../backendProvider';
import { CryptoUnits, PaymentStatus } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;

    NAME = 'Bitcoin Core';
    DESCRIPTION = 'This provider communicates with the Bitcoin Core application.';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = CryptoUnits.BITCOIN;

    onEnable() {
        this.sock = new Subscriber();
        this.sock.connect('tcp://127.0.0.1:29000');
        this.sock.subscribe('rawtx');

        this.listener();
        this.watchConfirmations();

        //logger.info('The Bitcoin Core backend is now available!');
    }

    async getNewAddress(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            rpcClient.request('getnewaddress', ['', 'bech32'], async (err, message) => {
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
            rpcClient.request('gettransaction', [txId], (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(message.result);
            });
        });
    }

    async decodeRawTransaction(rawTx: string): Promise<IRawTransaction> {
        return new Promise<IRawTransaction>((resolve, reject) => {
            rpcClient.request('decoderawtransaction', [rawTx], (err, decoded) => {
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
                rpcClient.request('sendtoaddress', [recipient, amount, comment, commentTo, subtractFeeFromAmount], (err, decoded) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    resolve(decoded.result.txid);
                });
            });
    }

    async listener() {
        logger.info('Now listing for incoming transaction to any invoices ...');
        for await (const [topic, msg] of this.sock) {
            const rawtx = msg.toString('hex');
            const tx = await this.decodeRawTransaction(rawtx);
            
            
            tx.vout.forEach(output => {                                    
                // Loop over each output and check if the address of one matches the one of an invoice.
                invoiceManager.getPendingInvoices().forEach(async invoice => {   
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
            invoiceManager.getUnconfirmedTransactions().forEach(async invoice => {
                if (invoice.transcationHash.length === 0) return;
                const transcation = invoice.transcationHash;
                
                const tx = await this.getTransaction(transcation);
                invoiceManager.setConfirmationCount(invoice, tx.confirmations);
            });
        }, 2_000);
    }
    
    async validateInvoice(invoice: IInvoice) {
        if (invoice.status === PaymentStatus.DONE || invoice.status === PaymentStatus.CANCELLED) return;
        if (invoice.paymentMethod !== CryptoUnits.BITCOIN) return;

        rpcClient.request('listreceivedbyaddress', [0, false, false, invoice.receiveAddress], async (err, message) => {
            if (err) {
                logger.error(`There was an error while getting transcations of address ${invoice.receiveAddress}: ${err.message}`);
                return;
            }

            const res = message.result[0] as ITransactionList;
            if (res === undefined) return;

            res.txids.forEach(async tx => {
                invoiceManager.validatePayment(invoice, tx);
            });
        });
    }
}

