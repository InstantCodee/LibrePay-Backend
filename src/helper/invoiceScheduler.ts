import { IInvoice } from "../models/invoice/invoice.interface";
import { Subscriber } from 'zeromq';
import { logger, rpcClient } from "../app";
import { invoiceRouter } from "../routes/invoice";
import { Invoice } from "../models/invoice/invoice.model";
import { PaymentStatus } from "./types";

export class InvoiceScheduler {
    private pendingInvoices: IInvoice[];
    private unconfirmedTranscations: IInvoice[];
    private sock: Subscriber;

    constructor() {
        this.unconfirmedTranscations = [];
        this.pendingInvoices = [];

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
            logger.debug(`New tx: ${rawtx}`);
            rpcClient.request('decoderawtransaction', [rawtx], (err, decoded) => {
                if (err) {
                    logger.error(`Error while decoding raw tx: ${err.message}`);
                    return;
                }

                decoded.result.vout.forEach(output => {
                    //console.log('Output:', output.scriptPubKey);
                    
                    // Loop over each output and check if the address of one matches the one of an invoice.
                    this.pendingInvoices.forEach(invoice => {
                        // We found our transaction
                        if (output.scriptPubKey.addresses === undefined) return;    // Sometimes (weird) transaction don't have any addresses
                        if (output.scriptPubKey.addresses.indexOf(invoice.receiveAddress) !== -1) {
                            logger.info(`Transcation for invoice ${invoice.id} received! (${decoded.result.hash})`);

                            // Change state in database
                            invoice.status = PaymentStatus.UNCONFIRMED;
                            invoice.transcationHash = decoded.result.txid;
                            invoice.save();

                            // Push to array & remove from pending
                            this.unconfirmedTranscations.push(invoice);
                            this.pendingInvoices.splice(this.pendingInvoices.indexOf(invoice), 1);
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
                rpcClient.request('gettransaction', [invoice.transcationHash], (err, message) => {
                    if (err) {
                        logger.error(`Error while fetching confirmation state of ${invoice.transcationHash}: ${err.message}`);
                        return;
                    }

                    if (Number(message.result.confirmations) > 2) {
                        logger.info(`Transaction (${invoice.transcationHash}) has reached more then 2 confirmations and can now be trusted!`);
                        invoice.status = PaymentStatus.DONE;
                        invoice.save(); // This will trigger a post save hook that will notify the user.

                        this.unconfirmedTranscations.splice(this.unconfirmedTranscations.indexOf(invoice), 1);
                    } else {
                        logger.debug(`Transcation (${invoice.transcationHash}) has not reached his threshold yet.`);
                    }
                });
            });
        }, 2_000);
    }
}