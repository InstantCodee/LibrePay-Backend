import { Server, Socket } from "socket.io";
import { logger } from "../app";
import { IInvoice } from "../models/invoice/invoice.interface";
import { Invoice } from "../models/invoice/invoice.model";
import { PaymentStatus } from "./types";

export class SocketManager {
    io: Server;

    constructor(io: Server) {
        this.io = io;
        this.listen();
    }

    listen() {
        console.log("Listen");
        
        this.io.on('connection', (socket: Socket) => {
            // The frontend sends his selector, then pick _id and put it in `socketInvoice` map.
            // Return `true` if successful and `false` if not.
            socket.on('subscribe', async data => {
                if (data.selector !== undefined) {
                    const invoice = await Invoice.findOne({ selector: data.selector });
                    if (invoice === null) {
                        socket.emit('subscribe', false);
                        return;
                    }

                    logger.info(`Socket ${socket.id} has subscribed to invoice ${invoice.id} (${PaymentStatus[invoice.status]})`);
                }
            });
        });
    }

    emitInvoiceEvent(invoice: IInvoice, event: string, data: any) {
        logger.debug(`Broadcast ${data} to room ${invoice.selector}`);
        this.io.to(invoice.selector).emit(event, data);
    }
}