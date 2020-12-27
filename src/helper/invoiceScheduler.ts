import { IInvoice } from "../models/invoice/invoice.interface";
import { Subscriber } from 'zeromq';
import { logger, rpcClient, socketManager } from "../app";
import { invoiceRouter } from "../routes/invoice";
import { Invoice } from "../models/invoice/invoice.model";
import { CryptoUnits, PaymentStatus } from "./types";
import { config } from "../../config";

export class InvoiceScheduler {
    private pendingInvoices: IInvoice[];
    private unconfirmedTranscations: IInvoice[];
    private knownConfirmations: Map<string, number>;    // Invoice id / confirmation cound
    private sock: Subscriber;

    constructor() {
        this.unconfirmedTranscations = [];
        this.pendingInvoices = [];
        this.knownConfirmations = new Map<string, number>();

        // Get all pending transcations
        Invoice.find({ status: PaymentStatus.PENDING }).then(invoices => {
            this.pendingInvoices = invoices;
        });

        // Get all unconfirmed transactions
        Invoice.find({ status: PaymentStatus.UNCONFIRMED }).then(invoices => {
            this.unconfirmedTranscations = invoices;
        });

        this.sock = new Subscriber();
        this.sock.connect('tcp://127.0.0.1:29000');
        this.listen();
        this.watchConfirmations();
    }

    addInvoice(invoice: IInvoice) {
        logger.info(`A new invoice has been created: ${invoice.id}`)
        this.pendingInvoices.push(invoice);
    }

    /**
     * This function waits for Bitcoin Core to respond with raw TX.
     */
    private async listen() {        
        this.sock.subscribe('rawtx');

        logger.info('Now listing for incoming transaction to any invoices ...');
        for await (const [topic, msg] of this.sock) {
            const rawtx = msg.toString('hex');
            //logger.debug(`New tx: ${rawtx}`);
            rpcClient.request('decoderawtransaction', [rawtx], (err, decoded) => {
                if (err) {
                    logger.error(`Error while decoding raw tx: ${err.message}`);
                    return;
                }

                decoded.result.vout.forEach(output => {                    
                    // Loop over each output and check if the address of one matches the one of an invoice.
                    this.pendingInvoices.forEach(invoice => {
                        if (output.scriptPubKey.addresses === undefined) return;    // Sometimes (weird) transaction don't have any addresses

                        // We found our transaction (https://developer.bitcoin.org/reference/rpc/decoderawtransaction.html)
                        if (output.scriptPubKey.addresses.indexOf(invoice.receiveAddress) !== -1) {
                            invoice.paid += output.value;
                            logger.info(`Transcation for invoice ${invoice.id} received! (${decoded.result.hash})`);

                            // Change state in database
                            const price = invoice.paymentMethods.find((item) => { return item.method === CryptoUnits.BITCOIN }).amount;
                            if (invoice.paid < price - config.transcations.acceptMargin) {
                                const left = price - output.value;
                                invoice.status = PaymentStatus.PARTIALLY;
                                invoice.save();
                                logger.info(`Transcation for invoice ${invoice.id} received but there are still ${left} BTC missing (${decoded.result.hash})`);
                            } else {
                                invoice.status = PaymentStatus.UNCONFIRMED;
                                invoice.transcationHashes.push(decoded.result.txid);
                                invoice.save();
    
                                // Push to array & remove from pending
                                this.unconfirmedTranscations.push(invoice);
                                this.pendingInvoices.splice(this.pendingInvoices.indexOf(invoice), 1);
                            }
                        }
                    })
                });                
            });
            
        }
    }

    /**
     * This functions loops over each unconfirmed transaction to check if it reached "trusted" threshold.
     */
    private watchConfirmations() {
        setInterval(() => {
            this.unconfirmedTranscations.forEach(invoice => {
                if (invoice.transcationHashes.length === 0) return;
                let trustworthy = true;    // Will be true if all transactions are above threshold.

                for (let i = 0; i < invoice.transcationHashes.length; i++) {
                    const transcation = invoice.transcationHashes[i];
                    
                    rpcClient.request('gettransaction', [transcation], (err, message) => {
                        if (err) {
                            logger.error(`Error while fetching confirmation state of ${transcation}: ${err.message}`);
                            trustworthy = false;

                            return;
                        }

                        if (this.knownConfirmations.get(invoice.id) != message.result.confirmations) {
                            this.knownConfirmations.set(invoice.id, message.result.confirmations);
                            socketManager.getSocketByInvoice(invoice).emit('confirmationUpdate', { count: Number(message.result.confirmations) });
                        }
    
                        if (Number(message.result.confirmations) > 0) {
                            logger.info(`Transaction (${transcation}) has reached more then 2 confirmations and can now be trusted!`);
    
                            this.unconfirmedTranscations.splice(this.unconfirmedTranscations.indexOf(invoice), 1);
                        } else {
                            trustworthy = false;
                            logger.debug(`Transcation (${transcation}) has not reached his threshold yet.`);
                        }
                    });
                }

                if (trustworthy) {
                    invoice.status = PaymentStatus.DONE;
                    invoice.save(); // This will trigger a post save hook that will notify the user.
                }
            });
        }, 2_000);
    }
}