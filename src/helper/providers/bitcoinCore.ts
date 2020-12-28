import { Socket, Subscriber } from "zeromq";
import { config } from "../../../config";
import { invoiceManager, logger, rpcClient } from "../../app";
import { BackendProvider, ITransaction, IRawTransaction } from "../backendProvider";
import { InvoiceManager } from "../invoiceManager";
import { CryptoUnits, PaymentStatus } from "../types";

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

                    // We found our transaction (https://developer.bitcoin.org/reference/rpc/decoderawtransaction.html)
                    if (output.scriptPubKey.addresses.indexOf(invoice.receiveAddress) !== -1) {
                        const senderAddress = output.scriptPubKey.addresses[output.scriptPubKey.addresses.indexOf(invoice.receiveAddress)];
                        logger.info(`Transcation for invoice ${invoice.id} received! (${tx.hash})`);

                        // Change state in database
                        const price = invoice.paymentMethods.find((item) => { return item.method === CryptoUnits.BITCOIN }).amount;
                        if (output.value < price - config.transcations.acceptMargin) {
                            const left = price - output.value;
                            logger.info(`Transcation for invoice ${invoice.id} received but there are ${left} BTC missing (${tx.hash}).`);

                            const txBack = await this.sendToAddress(senderAddress, output.value, null, null, true);
                            logger.info(`Sent ${output.value} BTC back to ${senderAddress}`);
                        } else {
                            invoice.status = PaymentStatus.UNCONFIRMED;
                            invoice.transcationHash = tx.txid;
                            invoice.save();

                            invoiceManager.upgradeInvoice(invoice);
                        }
                    }
                })
            }); 
            
        }
    }

    async watchConfirmations() {
        setInterval(() => {
            invoiceManager.getUnconfirmedTransactions().forEach(async invoice => {
                if (invoice.transcationHash.length === 0) return;
                let trustworthy = true;    // Will be true if all transactions are above threshold.

                for (let i = 0; i < invoice.transcationHash.length; i++) {
                    const transcation = invoice.transcationHash;
                    
                    const tx = await this.getTransaction(transcation);

                    if (invoiceManager.hasConfirmationChanged(invoice, tx.confirmations)) {
                        invoiceManager.setConfirmationCount(invoice, tx.confirmations);
                    }

                    if (Number(tx.confirmations) > 0) {
                        logger.info(`Transaction (${transcation}) has reached more then 2 confirmations and can now be trusted!`);
                        invoiceManager.removeInvoice(invoice);
                    } else {
                        trustworthy = false;
                        logger.debug(`Transcation (${transcation}) has not reached his threshold yet.`);
                    }
                }

                if (trustworthy) {
                    invoice.status = PaymentStatus.DONE;
                    invoice.save(); // This will trigger a post save hook that will notify the user.
                }
            });
        }, 2_000);
    }
}

