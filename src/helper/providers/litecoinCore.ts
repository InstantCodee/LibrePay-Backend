import { Subscriber } from 'zeromq';

import * as rpc from 'jayson';
import { invoiceManager, logger } from '../../app';
import { IInvoice } from '../../models/invoice/invoice.interface';
import { BackendProvider, IRawTransaction, ITransaction, ITransactionDetails, ITransactionList } from '../backendProvider';
import { CryptoUnits, PaymentStatus } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;
    private rpcClient: rpc.HttpClient;

    NAME = 'Litecoin Core';
    DESCRIPTION = 'This provider communicates with the Litecoin Core application.';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = [CryptoUnits.LITECOIN];

    onEnable() {
        return new Promise<void>((resolve, reject) => {
            this.sock = new Subscriber();
            this.sock.connectTimeout = 2;
            this.sock.connect('tcp://127.0.0.1:40000');
            this.sock.subscribe('rawtx');

            
            this.rpcClient = rpc.Client.http({
                port: 22557,
                auth: 'admin:admin'        
            });

            // We perfom a small test call to check if everything works.
            this.rpcClient.request('getblockchaininfo', [], (err, message) => {
                if (err) {
                    reject(`Cannot connect with Bitcoin Core: ${err.message}`);
                    return;
                }
                this.listener();
                resolve();
            });
        });
    }

    async getNewAddress(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            this.rpcClient.request('getnewaddress', ['', 'bech32'], async (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }
    
                resolve(message.result);
            });
        });
    }

    async getTransaction(txId: string, context?: IInvoice): Promise<ITransaction> {
        return new Promise<ITransaction>((resolve, reject) => {
            this.rpcClient.request('gettransaction', [txId], (err, message) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Calculate received funds
                const details: ITransactionDetails[] = message.result.details;
                let amount = 0;

                details.forEach(detail => {
                    if (detail.category === 'receive' && detail.address === context.receiveAddress) {
                        amount += detail.amount;
                    }
                })

                const ret: ITransaction = {
                    id: message.result.txid,
                    amount,
                    blockhash: message.result.blockhash,
                    confirmations: message.result.confirmations,
                    time: message.result.time,
                    fee: message.result.fee
                }
    
                resolve(ret);
            });
        });
    }

    getBlockExplorerLink(txId: string) {
        return new URL(`https://litecoinblockexplorer.net/tx/${txId}`);
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
                invoiceManager.getPendingInvoices().filter(item => { return item.paymentMethod === CryptoUnits.LITECOIN }).forEach(async invoice => {   
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
    
    async validateInvoice(invoice: IInvoice) {
        if (invoice.status === PaymentStatus.DONE || invoice.status === PaymentStatus.CANCELLED) return;
        if (invoice.paymentMethod !== CryptoUnits.LITECOIN) return;

        this.rpcClient.request('listreceivedbyaddress', [0, false, false, invoice.receiveAddress], async (err, message) => {
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

    async isTestnet() {
        return new Promise<boolean>((resolve, reject) => {
            this.rpcClient.request('getblockchaininfo', [], async (err, message) => {
                if (err) {
                    logger.error(`There was an error while getting all blockchain information: ${err.message}`);
                    reject(err.message);
                    return;
                }
    
                resolve(message.result.chain !== 'main');
            });
        });
    }

    isTestnetAddress(address: string) {
        return address.startsWith('m') || address.startsWith('2') || address.startsWith('Q');
    }
}

