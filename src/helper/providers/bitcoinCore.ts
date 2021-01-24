import { Subscriber } from 'zeromq';

import * as rpc from 'jayson';
import { invoiceManager, logger } from '../../app';
import { IInvoice } from '../../models/invoice/invoice.interface';
import { BackendProvider, IRawTransaction, ITransaction, ITransactionDetails, ITransactionList } from '../backendProvider';
import { CryptoUnits, PaymentStatus } from '../types';

export class Provider implements BackendProvider {

    private sock: Subscriber;
    private rpcClient: rpc.HttpClient;

    NAME = 'Bitcoin Core';
    DESCRIPTION = 'This provider communicates with the Bitcoin Core application.';
    AUTHOR = 'LibrePay Team';
    VERSION = '0.1';
    CRYPTO = [CryptoUnits.BITCOIN];

    onEnable() {
        this.sock = new Subscriber();
        this.sock.connect('tcp://127.0.0.1:29000');
        this.sock.subscribe('rawtx');

        
        this.rpcClient = rpc.Client.http({
            port: 18332,
            auth: 'admin:admin'        
        });

        this.listener();

        return true;
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

                if (context !== undefined) {
                    for (let i = 0; i < details.length; i++) {
                        if (details[i].category == 'receive' && details[i].address == context.receiveAddress) {
                            amount += details[i].amount;
                        }
                    }
                }

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
                invoiceManager.getPendingInvoices().filter(item => { return item.paymentMethod === CryptoUnits.BITCOIN }).forEach(async invoice => {   
                    if (output.scriptPubKey.addresses === undefined) return;    // Sometimes (weird) transaction don't have any addresses

                    logger.debug(`${output.scriptPubKey.addresses} <-> ${invoice.receiveAddress}`);
                    // We found our transaction (https://developer.bitcoin.org/reference/rpc/decoderawtransaction.html)
                    if (output.scriptPubKey.addresses.indexOf(invoice.receiveAddress) !== -1) {
                        logger.info(`Transcation for invoice ${invoice.id} received! (${tx.hash})`);

                        // Change state in database
                        invoiceManager.validatePayment(invoice, tx.txid);
                    }
                })
            }); 
            
        }
    }
    
    async validateInvoice(invoice: IInvoice) {
        if (invoice.paymentMethod !== CryptoUnits.BITCOIN) return;

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
}

